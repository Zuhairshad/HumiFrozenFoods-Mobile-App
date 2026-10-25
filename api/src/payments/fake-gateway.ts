import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CreatePaymentIntentInput,
  PaymentEvent,
  PaymentGateway,
  PaymentIntentResult,
} from '../domain/ports.js';
import { PaymentSignatureError } from '../domain/ports.js';
import { normalizeStripeEvent, WEBHOOK_TOLERANCE_SECONDS } from './stripe-event.js';

export const FAKE_WEBHOOK_SECRET = 'whsec_fake_secret_for_tests';

export interface FakeIntent {
  id: string;
  clientSecret: string;
  amountPence: number;
  currency: 'gbp';
  orderId: string;
  orderNumber: string;
  receiptEmail: string;
  status: 'requires_payment_method' | 'canceled';
}

export interface FakeGatewayOptions {
  webhookSecret?: string;
  /** Epoch milliseconds; defaults to Date.now. */
  now?: () => number;
}

export type FakeGateway = PaymentGateway & {
  /** Stripe-style header `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. */
  sign(rawBody: string, timestamp?: number): string;
  readonly intents: ReadonlyMap<string, FakeIntent>;
};

/**
 * In-memory gateway for tests and offline e2e. Intent ids are deterministic
 * (pi_fake_000001, ...), creation is idempotent per key like Stripe's, and the
 * webhook path uses the same signature scheme and event normaliser as the real one.
 */
export function createFakeGateway(options: FakeGatewayOptions = {}): FakeGateway {
  const secret = options.webhookSecret ?? FAKE_WEBHOOK_SECRET;
  const now = options.now ?? Date.now;
  const intents = new Map<string, FakeIntent>();
  const byIdempotencyKey = new Map<string, string>();

  const mac = (timestamp: number, rawBody: string): string =>
    createHmac('sha256', secret).update(`${String(timestamp)}.${rawBody}`).digest('hex');

  return {
    enabled: true,
    intents,

    createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
      const existingId = byIdempotencyKey.get(input.idempotencyKey);
      const existing = existingId === undefined ? undefined : intents.get(existingId);
      if (existing) return Promise.resolve({ id: existing.id, clientSecret: existing.clientSecret });

      const id = `pi_fake_${String(intents.size + 1).padStart(6, '0')}`;
      const intent: FakeIntent = {
        id,
        clientSecret: `${id}_secret_fake`,
        amountPence: input.amountPence,
        currency: input.currency,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        receiptEmail: input.receiptEmail,
        status: 'requires_payment_method',
      };
      intents.set(id, intent);
      byIdempotencyKey.set(input.idempotencyKey, id);
      return Promise.resolve({ id, clientSecret: intent.clientSecret });
    },

    cancelPaymentIntent(paymentIntentId: string): Promise<void> {
      const intent = intents.get(paymentIntentId);
      if (intent) intents.set(paymentIntentId, { ...intent, status: 'canceled' });
      return Promise.resolve();
    },

    sign(rawBody: string, timestamp = Math.floor(now() / 1000)): string {
      return `t=${String(timestamp)},v1=${mac(timestamp, rawBody)}`;
    },

    parseWebhook(rawBody: string, signatureHeader: string | undefined): PaymentEvent {
      if (!signatureHeader) throw new PaymentSignatureError('Missing webhook signature');
      verify(rawBody, signatureHeader);
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        throw new PaymentSignatureError();
      }
      return normalizeStripeEvent(parsed);
    },
  };

  function verify(rawBody: string, header: string): void {
    let timestamp: number | undefined;
    const candidates: string[] = [];
    for (const part of header.split(',')) {
      const [key, value] = part.trim().split('=');
      if (key === 't' && value && /^\d{1,12}$/.test(value)) timestamp = Number(value);
      if (key === 'v1' && value) candidates.push(value);
    }
    if (timestamp === undefined || candidates.length === 0) throw new PaymentSignatureError();
    const expected = Buffer.from(mac(timestamp, rawBody), 'hex');
    const matches = candidates.some((candidate) => {
      const given = Buffer.from(candidate, 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
    if (!matches) throw new PaymentSignatureError();
    // Same one-sided check as stripe-node: only stale timestamps are rejected.
    if (Math.floor(now() / 1000) - timestamp > WEBHOOK_TOLERANCE_SECONDS) throw new PaymentSignatureError();
  }
}
