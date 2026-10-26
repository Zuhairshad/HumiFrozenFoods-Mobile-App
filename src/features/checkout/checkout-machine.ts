import { AppApiError, isAppApiError, lastSegment, retryAfterText } from '../../lib/api/errors';
import { makeIdempotencyKey, toPaymentIntentBody, type PaymentIntentResult, type StripeGateway } from '../../lib/api/stripe-gateway';
import type { Order, OrderDraft, Pricing } from '../../lib/api/types';
import { pollOrderPayment, POLL_INTERVAL_MS, POLL_MAX_ATTEMPTS } from './order-polling';
import type { PaymentSheetAdapter, PaymentSheetBilling, PaymentSheetColors, SheetOutcome } from './paymentSheetTypes';

/** Cached intents older than this are replaced (server pending TTL is 120 min; stay well inside it). */
export const MAX_INTENT_AGE_MS = 55 * 60 * 1000;

export type CheckoutStatus =
  | 'idle'
  | 'creating' // server prices, creates order + PaymentIntent
  | 'presenting' // PaymentSheet on screen
  | 'confirming' // sheet reported success; recording the order locally
  | 'verifying' // the sheet ended in an unclear way: asking the server (GET /v1/orders/:id) before saying anything
  | 'succeeded' // sheet success, or the server says paid. Sheet success alone is NOT proof: the order screen polls
  | 'unconfirmed' // unclear sheet outcome and the server still says pending after ~30 s: neither paid nor failed
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
  /**
   * Persist the order (snapshot, token, status pending_payment) BEFORE the sheet opens, so a charge can always be
   * traced back to an order after a crash. Failures are swallowed: they must never block or fail a payment.
   */
  recordPending?: (draft: OrderDraft, intent: PaymentIntentResult) => void;
  /** Mark the order confirmed (sheet success, or `remote` = what the server said). Must never mark it paid by itself. */
  recordOrder: (draft: OrderDraft, intent: PaymentIntentResult, remote?: Order) => void;
  /** Forget the pending order (explicit cancel/decline, init failure, server says cancelled/failed). */
  discardPending?: (intent: PaymentIntentResult) => void;
  /** GET /v1/orders/:id with the guest token. Without it an unclear sheet outcome can only end as `unconfirmed`. */
  fetchOrder?: (intent: PaymentIntentResult, signal?: AbortSignal) => Promise<Order>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollIntervalMs?: number;
  pollMaxAttempts?: number;
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

const isPaid = (o: Order): boolean => o.paymentStatus === 'paid' || o.paymentStatus === 'refunded';

/**
 * 'declined': the sheet reported an explicit card decline (retry is safe, nothing charged).
 * 'init': the sheet never opened. Everything else is unclear (network loss while confirming, SDK error,
 * unknown code, timeout, exception): the PaymentIntent may have succeeded, so the server decides.
 */
export function classifyFailure(o: Extract<SheetOutcome, { kind: 'failed' }>): 'declined' | 'init' | 'unclear' {
  if (o.code === 'InitFailed') return 'init';
  if (o.declineCode !== undefined || o.errorType === 'card_error') return 'declined';
  return 'unclear';
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
  let session: { fingerprint: string; key: string; intent?: PaymentIntentResult; createdAt?: number; presented?: boolean } | null = null;
  const now = deps.now ?? Date.now;
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

    const succeed = (intent: PaymentIntentResult): CheckoutState => {
      session = null;
      return set({
        status: 'succeeded',
        result: { orderNumber: intent.orderNumber, orderId: intent.orderId, pricing: intent.pricing, demo },
      });
    };
    const discard = (intent: PaymentIntentResult) => {
      try {
        deps.discardPending?.(intent);
      } catch {
        /* best effort */
      }
    };
    const confirm = (intent: PaymentIntentResult, remote?: Order) => {
      try {
        deps.recordOrder(draft, intent, remote);
      } catch {
        // The card is already charged: a local save failure must not be reported as a failed payment
        // (a retry would only hit an already-paid PaymentIntent). The pending copy saved before the
        // sheet and the launch reconciliation still find the order.
      }
    };
    const check = (intent: PaymentIntentResult): Promise<Order | null> =>
      deps.fetchOrder ? deps.fetchOrder(intent).catch(() => null) : Promise.resolve(null);

    try {
      set({ status: 'creating' });

      // R8: never re-present an old or cancelled intent. A NEW attempt (new key) is minted transparently.
      if (current.intent) {
        const old = current.intent;
        let fresh = now() - (current.createdAt ?? 0) <= MAX_INTENT_AGE_MS;
        if (current.presented && deps.fetchOrder) {
          // The sheet was shown before (cancel, decline, unclear end): ask the server first. It may be paid.
          const remote = await check(old);
          if (!remote) {
            return fail({
              kind: 'network',
              title: "We couldn't check your payment",
              message: "Check your connection and try again. You won't be charged twice.",
              retryable: true,
            });
          }
          if (isPaid(remote)) {
            confirm(old, remote);
            return succeed(old);
          }
          if (remote.status === 'cancelled') fresh = false;
        }
        if (!fresh) {
          discard(old);
          current.key = makeKey();
          current.intent = undefined;
          current.createdAt = undefined;
          current.presented = false;
        }
      }

      let intent = current.intent;
      if (!intent) {
        const create = () => deps.gateway.createPaymentIntent(draft, { idempotencyKey: current.key });
        try {
          intent = await create();
        } catch (e) {
          // Same key reused with a different body (should not happen) or a replay of a cancelled/expired
          // checkout (409 checkout_expired): mint a fresh key once.
          if (isAppApiError(e) && (e.code === 'idempotency_key_reuse' || e.code === 'checkout_expired')) {
            current.key = makeKey();
            intent = await create();
          } else throw e;
        }
        current.intent = intent;
        current.createdAt = now();
        current.presented = false;
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
        // R2: from here a charge is possible. Save the order first (best effort, never blocks the payment).
        try {
          deps.recordPending?.(draft, intent);
        } catch {
          /* the order can still be found by lookup, and the poll below needs no local copy */
        }
        current.presented = true;
        let outcome: SheetOutcome;
        try {
          outcome = await deps.sheet.run({
            clientSecret: intent.clientSecret,
            billing,
            colors: c,
            onPresenting: () => set({ status: 'presenting' }),
          });
        } catch (e) {
          // Anything thrown around the sheet is NOT proof that nothing was charged.
          outcome = { kind: 'failed', message: e instanceof Error ? e.message : 'Payment sheet error', code: 'Exception' };
        }

        if (outcome.kind === 'cancelled') {
          discard(intent);
          return set({ status: 'cancelled' });
        }
        if (outcome.kind === 'failed') {
          const kind = classifyFailure(outcome);
          if (kind === 'declined') {
            discard(intent);
            return fail({ kind: 'declined', title: "Payment didn't go through", message: outcome.message, retryable: true });
          }
          if (kind === 'init') {
            // The sheet never opened: nothing was charged. Raw SDK text can be developer-facing, so it is not shown.
            discard(intent);
            return fail({
              kind: 'payment',
              title: "Payment didn't start",
              message: "We couldn't open the payment sheet. Nothing was charged. Please try again.",
              retryable: true,
            });
          }
          // Unclear outcome: the PaymentIntent may well have succeeded. Ask the server (30 s) before saying anything.
          return verify(intent);
        }
      }

      set({ status: 'confirming' });
      confirm(intent);
      return succeed(intent);
    } catch (e) {
      return fail(toCheckoutError(e));
    }

    async function verify(intent: PaymentIntentResult): Promise<CheckoutState> {
      if (!deps.fetchOrder) return unconfirmed(intent);
      set({ status: 'verifying' });
      const fetchOrder = deps.fetchOrder;
      const outcome = await pollOrderPayment({
        fetchOrder: (signal) => fetchOrder(intent, signal),
        sleep: deps.sleep,
        intervalMs: deps.pollIntervalMs ?? POLL_INTERVAL_MS,
        maxAttempts: deps.pollMaxAttempts ?? POLL_MAX_ATTEMPTS,
        isSettled: (o) => o.paymentStatus !== 'pending' || o.status === 'cancelled',
      });
      if (outcome.kind === 'settled') {
        const remote = outcome.order;
        if (isPaid(remote)) {
          set({ status: 'confirming' });
          confirm(intent, remote);
          return succeed(intent);
        }
        // The server itself says failed / cancelled: the only case besides cancel/decline reported as a failure.
        discard(intent);
        if (remote.status === 'cancelled' && session) {
          session.intent = undefined; // next tap starts a new attempt
          session.key = makeKey();
          session.presented = false;
        }
        return fail({
          kind: 'payment',
          title: "Payment didn't go through",
          message: 'Your card was not charged. Please try again.',
          retryable: true,
        });
      }
      return unconfirmed(intent);
    }

    function unconfirmed(intent: PaymentIntentResult): CheckoutState {
      // Keep the pending order and the intent: the next tap re-checks the server before showing the sheet again.
      return set({
        status: 'unconfirmed',
        result: { orderNumber: intent.orderNumber, orderId: intent.orderId, pricing: intent.pricing, demo },
      });
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
