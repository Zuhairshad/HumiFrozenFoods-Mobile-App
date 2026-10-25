import { AppApiError, isAppApiError, lastSegment, retryAfterText } from '../../lib/api/errors';
import { makeIdempotencyKey, toPaymentIntentBody, type PaymentIntentResult, type StripeGateway } from '../../lib/api/stripe-gateway';
import type { OrderDraft, Pricing } from '../../lib/api/types';
import type { PaymentSheetAdapter, PaymentSheetBilling, PaymentSheetColors } from './paymentSheetTypes';

export type CheckoutStatus =
  | 'idle'
  | 'creating' // server prices, creates order + PaymentIntent
  | 'presenting' // PaymentSheet on screen
  | 'confirming' // sheet reported success; recording the order locally
  | 'succeeded' // sheet success. NOT proof of payment: the order screen polls the server
  | 'failed'
  | 'cancelled';

export type CheckoutErrorKind =
  | 'network' // offline / timeout; safe to retry with the same key
  | 'rate_limited' // 429
  | 'price_changed' // server total differs from the quote; nothing charged
  | 'unavailable' // 422 unavailable / out_of_stock -> back to cart
  | 'min_order' // 422 -> back to cart
  | 'invalid_promo' // 422 -> back to cart
  | 'validation' // 400 with field errors
  | 'payments_unavailable' // payments disabled / not configured
  | 'server'
  | 'declined' // card declined in the sheet
  | 'payment' // sheet could not initialise / other sheet failure
  | 'unsupported' // web / no Stripe key in this build
  | 'unknown';

export interface CheckoutError {
  kind: CheckoutErrorKind;
  title: string;
  message: string;
  retryable: boolean;
  /** 422 states: the user must go back to the cart to fix the basket. */
  returnToCart?: boolean;
  retryAfterSeconds?: number;
  /** Server field errors keyed by the last path segment (email, phone, postcode, ...). */
  fieldErrors?: Record<string, string>;
}

export interface CheckoutSuccess {
  orderNumber: string;
  orderId: string;
  pricing: Pricing;
  demo: boolean;
}

export interface CheckoutState {
  status: CheckoutStatus;
  error?: CheckoutError;
  result?: CheckoutSuccess;
  /** Set with `price_changed`: the total the server will charge. */
  priceChange?: { newTotalPence: number };
}

export interface PayOptions {
  /** Total in pence the user was shown. A different server total aborts before the sheet opens. */
  expectedTotalPence?: number;
}

export interface CheckoutDeps {
  gateway: StripeGateway;
  sheet: Pick<PaymentSheetAdapter, 'available' | 'run'> & { unavailableMessage?: string };
  getColors: () => PaymentSheetColors;
  /** Persist the order snapshot + token. Must never mark it paid. */
  recordOrder: (draft: OrderDraft, intent: PaymentIntentResult) => void;
  /** From GET /v1/config. false blocks before any order is created. */
  paymentsEnabled?: () => boolean;
  makeKey?: () => string;
  formatPence?: (pence: number) => string;
}

const IDLE: CheckoutState = { status: 'idle' };

const UNPROCESSABLE_REASONS = new Set(['unavailable', 'out_of_stock', 'min_order', 'invalid_promo']);

function unprocessableReason(e: AppApiError): string | undefined {
  if (UNPROCESSABLE_REASONS.has(e.code)) return e.code;
  const d = e.details;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const r = (d as { reason?: unknown; code?: unknown }).reason ?? (d as { code?: unknown }).code;
    if (typeof r === 'string' && UNPROCESSABLE_REASONS.has(r)) return r;
  }
  return undefined;
}

export function toCheckoutError(e: unknown): CheckoutError {
  if (!isAppApiError(e)) {
    return { kind: 'unknown', title: 'Something went wrong', message: 'Please try again in a moment.', retryable: true };
  }
  if (e.isNetwork) return { kind: 'network', title: "You're offline", message: e.message, retryable: true };
  if (e.isRateLimited) {
    return {
      kind: 'rate_limited',
      title: 'Too many attempts',
      message: `Please try again in ${retryAfterText(e.retryAfter)}.`,
      retryable: true,
      retryAfterSeconds: e.retryAfter,
    };
  }
  if (e.status === 422) {
    const reason = unprocessableReason(e);
    const msg = e.message;
    if (reason === 'min_order') return { kind: 'min_order', title: 'Minimum order not met', message: msg, retryable: false, returnToCart: true };
    if (reason === 'invalid_promo') return { kind: 'invalid_promo', title: 'Promo code not valid', message: msg, retryable: false, returnToCart: true };
    if (reason === 'unavailable' || reason === 'out_of_stock') {
      return { kind: 'unavailable', title: 'Some items are unavailable', message: msg, retryable: false, returnToCart: true };
    }
    return { kind: 'validation', title: "We couldn't place that order", message: msg, retryable: false, returnToCart: true };
  }
  if (e.status === 400 || e.code === 'validation_failed') {
    const fieldErrors: Record<string, string> = {};
    for (const [path, message] of Object.entries(e.fieldErrors)) fieldErrors[lastSegment(path)] ??= message;
    return { kind: 'validation', title: 'Check your details', message: e.message, retryable: false, fieldErrors };
  }
  if (e.status === 503 && e.code === 'payment_provider_error') {
    return { kind: 'payments_unavailable', title: 'Payments unavailable', message: e.message, retryable: false };
  }
  if (e.isServer) return { kind: 'server', title: 'Something went wrong', message: e.message, retryable: true };
  return { kind: 'unknown', title: "We couldn't place that order", message: e.message, retryable: false };
}

/**
 * The pay flow as a plain state machine (no React). `pay()` is re-entrancy safe: while a run is in
 * flight, further calls resolve at once with the current (non-final) state. One Idempotency-Key + PaymentIntent is kept per
 * checkout attempt in memory; a NEW key is minted only when cart/contact/address/slot/promo change.
 * The client never marks anything paid.
 */
export function createCheckoutMachine(deps: CheckoutDeps) {
  const demo = deps.gateway.mode === 'mock';
  const makeKey = deps.makeKey ?? makeIdempotencyKey;
  const fmt = deps.formatPence ?? ((p: number) => `£${(p / 100).toFixed(2)}`);
  let state: CheckoutState = IDLE;
  let inFlight: Promise<CheckoutState> | null = null;
  let session: { fingerprint: string; key: string; intent?: PaymentIntentResult } | null = null;
  const listeners = new Set<() => void>();

  const set = (next: CheckoutState): CheckoutState => {
    state = next;
    listeners.forEach((l) => l());
    return next;
  };
  const fail = (error: CheckoutError, extra?: Partial<CheckoutState>) => set({ status: 'failed', error, ...extra });

  async function run(draft: OrderDraft, opts?: PayOptions): Promise<CheckoutState> {
    if (!demo) {
      if (!deps.sheet.available) {
        return fail({
          kind: 'unsupported',
          title: 'Payments unavailable',
          message: deps.sheet.unavailableMessage ?? 'Card payments need the mobile app.',
          retryable: false,
        });
      }
      if (deps.paymentsEnabled && !deps.paymentsEnabled()) {
        return fail({ kind: 'payments_unavailable', title: 'Payments unavailable', message: 'Card payments are temporarily unavailable. Please try again later.', retryable: false });
      }
    }

    const fingerprint = JSON.stringify(toPaymentIntentBody(draft));
    if (session?.fingerprint !== fingerprint) session = { fingerprint, key: makeKey() };
    const current = session;

    try {
      set({ status: 'creating' });
      let intent = current.intent;
      if (!intent) {
        try {
          intent = await deps.gateway.createPaymentIntent(draft, { idempotencyKey: current.key });
        } catch (e) {
          // Same key reused with a different body (should not happen): mint a fresh key once.
          if (isAppApiError(e) && e.code === 'idempotency_key_reuse') {
            current.key = makeKey();
            intent = await deps.gateway.createPaymentIntent(draft, { idempotencyKey: current.key });
          } else throw e;
        }
        current.intent = intent;
      }

      if (opts?.expectedTotalPence !== undefined && intent.pricing.totalPence !== opts.expectedTotalPence) {
        return fail(
          {
            kind: 'price_changed',
            title: 'Price updated',
            message: `Your total is now ${fmt(intent.pricing.totalPence)}. Nothing has been charged. Tap Pay to continue.`,
            retryable: true,
          },
          { priceChange: { newTotalPence: intent.pricing.totalPence } },
        );
      }

      if (!demo) {
        const c = deps.getColors();
        const billing: PaymentSheetBilling = {
          name: draft.contact.name,
          email: draft.contact.email,
          phone: draft.contact.phone,
          line1: draft.address.line1,
          line2: draft.address.line2,
          city: draft.address.city,
          postcode: draft.address.postcode,
        };
        const outcome = await deps.sheet.run({
          clientSecret: intent.clientSecret,
          billing,
          colors: c,
          onPresenting: () => set({ status: 'presenting' }),
        });
        if (outcome.kind === 'cancelled') return set({ status: 'cancelled' });
        if (outcome.kind === 'failed') {
          const declined = outcome.declineCode !== undefined || outcome.code === 'Failed';
          return fail({
            kind: declined ? 'declined' : 'payment',
            title: "Payment didn't go through",
            message: outcome.message,
            retryable: true,
          });
        }
      }

      set({ status: 'confirming' });
      try {
        deps.recordOrder(draft, intent);
      } catch {
        // The card is already charged: a local save failure must not be reported as a failed payment
        // (a retry would only hit an already-paid PaymentIntent). The order stays findable by lookup.
      }
      session = null;
      return set({
        status: 'succeeded',
        result: { orderNumber: intent.orderNumber, orderId: intent.orderId, pricing: intent.pricing, demo },
      });
    } catch (e) {
      return fail(toCheckoutError(e));
    }
  }

  return {
    demo,
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    pay(draft: OrderDraft, opts?: PayOptions): Promise<CheckoutState> {
      // A re-entrant call (double tap in the same frame) gets a snapshot, not the run's own promise, so the
      // caller's success/failure handling (clear cart, navigate, alert) runs exactly once.
      if (inFlight) return Promise.resolve(state);
      const p = run(draft, opts).finally(() => {
        inFlight = null;
      });
      inFlight = p;
      return p;
    },
    /** Back to idle (no-op while a run is in flight). */
    reset() {
      if (!inFlight) set(IDLE);
    },
    isBusy: () => inFlight !== null,
  };
}

export type CheckoutMachine = ReturnType<typeof createCheckoutMachine>;
