import { AppApiError } from './errors';
import type { HttpClient } from './http';
import type { OrderDraft, PaymentIntentRequest, PaymentIntentResponse } from './types';

export interface PaymentIntentResult extends PaymentIntentResponse {
  /** True only for the offline mock. In demo mode no payment is ever taken or claimed. */
  demo: boolean;
}

export interface StripeGateway {
  readonly mode: 'http' | 'mock';
  /** Server re-prices the draft, creates the order + PaymentIntent and returns the secret. */
  createPaymentIntent(draft: OrderDraft, opts: { idempotencyKey: string }): Promise<PaymentIntentResult>;
}

/** UUID v4 (contract: `Idempotency-Key` must be a UUID v4). */
export function makeIdempotencyKey(random: () => number = Math.random): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Canonical body: only contract fields, undefined/empty optionals dropped. */
export function toPaymentIntentBody(draft: OrderDraft): PaymentIntentRequest {
  return {
    lines: draft.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    ...(draft.promoCode ? { promoCode: draft.promoCode } : null),
    contact: { name: draft.contact.name, email: draft.contact.email, phone: draft.contact.phone },
    address: {
      line1: draft.address.line1,
      ...(draft.address.line2 ? { line2: draft.address.line2 } : null),
      city: draft.address.city,
      postcode: draft.address.postcode,
    },
    slot: { date: draft.slot.date, window: draft.slot.window },
    ...(draft.notes ? { notes: draft.notes } : null),
  };
}

/** HTTP implementation: POST /v1/checkout/payment-intent. Retries (2x) reuse the SAME Idempotency-Key. */
export function createHttpStripeGateway(client: HttpClient): StripeGateway {
  return {
    mode: 'http',
    async createPaymentIntent(draft, { idempotencyKey }) {
      const res = await client.request<PaymentIntentResponse>({
        method: 'POST',
        path: '/v1/checkout/payment-intent',
        body: toPaymentIntentBody(draft),
        idempotencyKey,
        retry: { retries: 2, baseDelayMs: 500 },
        timeoutMs: 20000,
      });
      if (!res?.clientSecret || !res.orderId || !res.guestToken || !res.pricing) {
        throw new AppApiError({ status: 200, code: 'invalid_response', message: 'Unexpected response from the server.' });
      }
      return { ...res, demo: false };
    },
  };
}
