import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOrder } from '@/lib/api/orders-client';
import { isGatewayError } from '@/lib/api/errors';
import { getStripeGateway, makeIdempotencyKey, type PaymentIntentResult } from '@/lib/api/stripe-gateway';
import type { OrderDraft, PricingDto } from '@/lib/api/types';
import { useOrdersStore, type StoredOrder } from '@/store/orders';
import { useTheme } from '@/hooks/useTheme';
import type { PaymentSheetBilling } from './paymentSheetTypes';
import { formatSlotLabel } from './slots';
import { usePaymentSheetAdapter } from './usePaymentSheetAdapter';

export type CheckoutStatus =
  | 'idle'
  | 'creating' // asking our server to price + create the order and PaymentIntent
  | 'presenting' // PaymentSheet is on screen
  | 'confirming' // sheet returned success; recording the order / asking the server
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type CheckoutErrorKind =
  | 'network' // offline / timeout; safe to retry
  | 'validation' // server rejected the draft (bad promo, unavailable product, ...)
  | 'server'
  | 'declined' // card declined or payment failed in the sheet
  | 'payment' // sheet could not be initialised
  | 'unsupported' // web / no Stripe key
  | 'unknown';

export interface CheckoutError {
  kind: CheckoutErrorKind;
  title: string;
  message: string;
  retryable: boolean;
}

export interface CheckoutSuccess {
  orderNumber: string;
  remoteId: string;
  pricing: PricingDto;
  demo: boolean;
}

export interface CheckoutState {
  status: CheckoutStatus;
  error?: CheckoutError;
  result?: CheckoutSuccess;
}

const IDLE: CheckoutState = { status: 'idle' };

interface Session {
  fingerprint: string;
  idempotencyKey: string;
  intent?: PaymentIntentResult;
}

const penceToPounds = (p: number) => Math.round(p) / 100;

function toError(e: unknown): CheckoutError {
  if (isGatewayError(e)) {
    switch (e.kind) {
      case 'network':
        return { kind: 'network', title: "You're offline", message: e.message, retryable: true };
      case 'validation':
        return { kind: 'validation', title: "We couldn't place that order", message: e.message, retryable: false };
      case 'unsupported':
        return { kind: 'unsupported', title: 'Payments unavailable', message: e.message, retryable: false };
      default:
        return { kind: 'server', title: 'Something went wrong', message: e.message, retryable: true };
    }
  }
  return { kind: 'unknown', title: 'Something went wrong', message: 'Please try again in a moment.', retryable: true };
}

function buildOrder(draft: OrderDraft, res: PaymentIntentResult, paymentStatus: StoredOrder['paymentStatus']): StoredOrder {
  const { address, contact, slot } = draft;
  const addressLine = [address.line1, address.line2, address.city, address.postcode].filter(Boolean).join(', ');
  return {
    id: res.orderNumber,
    placedAt: new Date().toISOString(),
    lines: res.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      price: penceToPounds(l.unitPricePence),
      quantity: l.quantity,
      image: l.image,
    })),
    subtotal: penceToPounds(res.pricing.subtotalPence),
    delivery: penceToPounds(res.pricing.deliveryPence),
    discount: penceToPounds(res.pricing.discountPence),
    total: penceToPounds(res.pricing.totalPence),
    status: 'placed',
    address: addressLine,
    contact,
    slot: { date: slot.date, window: slot.window, label: formatSlotLabel(slot.date, slot.window) },
    paymentStatus,
    remoteId: res.orderId,
    guestToken: res.guestToken,
  };
}

/**
 * Drives the whole pay flow: server creates order + PaymentIntent, PaymentSheet collects payment.
 * `pay()` is idempotent: while a run is in flight further calls return the same promise, and a
 * retry of an unchanged draft reuses the order/PaymentIntent already created (no duplicate orders).
 * In demo mode (no EXPO_PUBLIC_API_BASE_URL) the sheet is skipped and no payment is claimed.
 */
export function useStripeCheckout() {
  const gateway = getStripeGateway();
  const demo = gateway.mode === 'mock';
  const sheet = usePaymentSheetAdapter();
  const { c, isDark } = useTheme();
  const addOrder = useOrdersStore((s) => s.addOrder);

  const [state, setState] = useState<CheckoutState>(IDLE);
  const inFlight = useRef<Promise<CheckoutState> | null>(null);
  const session = useRef<Session | null>(null);
  const colorsRef = useRef({ c, isDark });
  useEffect(() => {
    colorsRef.current = { c, isDark };
  }, [c, isDark]);

  const run = useCallback(
    async (draft: OrderDraft): Promise<CheckoutState> => {
      const settle = (next: CheckoutState): CheckoutState => {
        setState(next);
        return next;
      };

      if (!demo && !sheet.available) {
        return settle({
          status: 'failed',
          error: {
            kind: 'unsupported',
            title: 'Payments unavailable',
            message: 'Card payments need the Humi app build with Stripe configured.',
            retryable: false,
          },
        });
      }

      const fingerprint = JSON.stringify(draft);
      if (session.current?.fingerprint !== fingerprint) {
        session.current = { fingerprint, idempotencyKey: makeIdempotencyKey() };
      }
      const current = session.current;

      try {
        setState({ status: 'creating' });
        const intent = (current.intent ??= await gateway.createPaymentIntent(draft, { idempotencyKey: current.idempotencyKey }));

        let paymentStatus: StoredOrder['paymentStatus'] = 'demo';
        if (!demo) {
          const { c: cc, isDark: dark } = colorsRef.current;
          const billing: PaymentSheetBilling = {
            name: draft.contact.name,
            email: draft.contact.email,
            phone: draft.contact.phone,
            line1: draft.address.line1,
            line2: draft.address.line2,
            city: draft.address.city,
            postcode: draft.address.postcode,
          };
          const outcome = await sheet.run({
            clientSecret: intent.clientSecret,
            billing,
            colors: {
              tint: cc.tint,
              groupedBackground: cc.groupedBackground,
              cell: cc.cell,
              elevated: cc.elevated,
              separator: cc.separatorOpaque,
              label: cc.label,
              labelSecondary: cc.labelSecondary,
              labelTertiary: cc.labelTertiary,
              destructive: cc.destructive,
              isDark: dark,
            },
            onPresenting: () => setState({ status: 'presenting' }),
          });
          if (outcome.kind === 'cancelled') return settle({ status: 'cancelled' });
          if (outcome.kind === 'failed') {
            const declined = outcome.declineCode !== undefined || outcome.code === 'Failed';
            return settle({
              status: 'failed',
              error: {
                kind: declined ? 'declined' : 'payment',
                title: "Payment didn't go through",
                message: outcome.message,
                retryable: true,
              },
            });
          }
          // Client success is not proof of payment: the server flips the order to paid via webhook.
          setState({ status: 'confirming' });
          paymentStatus = 'pending';
          try {
            const remote = await fetchOrder(intent.orderId, intent.guestToken);
            if (remote?.paymentStatus === 'paid') paymentStatus = 'paid';
          } catch {
            /* best effort; the confirmation screen keeps polling */
          }
        } else {
          setState({ status: 'confirming' });
        }

        addOrder(buildOrder(draft, intent, paymentStatus));
        session.current = null;
        return settle({
          status: 'succeeded',
          result: { orderNumber: intent.orderNumber, remoteId: intent.orderId, pricing: intent.pricing, demo },
        });
      } catch (e) {
        return settle({ status: 'failed', error: toError(e) });
      }
    },
    [addOrder, demo, gateway, sheet],
  );

  const pay = useCallback(
    (draft: OrderDraft): Promise<CheckoutState> => {
      if (inFlight.current) return inFlight.current;
      const p = run(draft).finally(() => {
        inFlight.current = null;
      });
      inFlight.current = p;
      return p;
    },
    [run],
  );

  const reset = useCallback(() => {
    if (!inFlight.current) setState(IDLE);
  }, []);

  const busy = state.status === 'creating' || state.status === 'presenting' || state.status === 'confirming';
  return { pay, state, reset, busy, demo };
}
