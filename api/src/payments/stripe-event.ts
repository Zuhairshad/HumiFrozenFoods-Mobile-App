import { z } from 'zod';
import type { PaymentEvent } from '../domain/ports.js';

/** Stamped on every PaymentIntent this API creates; the webhook ignores anything without it. */
export const PAYMENT_SOURCE = 'humi-mobile-app';

/** Stripe's own default; the signature timestamp must be at most this old. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/** A signed event whose body does not have the shape Stripe documents. Not a signature problem: the route answers 5xx so it is retried and noticed. */
export class PaymentEventShapeError extends Error {
  constructor(eventType: string) {
    super(`Unexpected payload for Stripe event ${eventType}`);
    this.name = 'PaymentEventShapeError';
  }
}

const metadata = z
  .record(z.string(), z.string())
  .nullish()
  .transform((value) => value ?? {});

const intentObject = z.object({ id: z.string().min(1), metadata });
const succeededObject = intentObject.extend({
  amount_received: z.number().int().nonnegative(),
  currency: z.string(),
});
const chargeObject = z.object({
  amount: z.number().int().nonnegative(),
  amount_refunded: z.number().int().nonnegative(),
  payment_intent: z.union([z.string().min(1), z.object({ id: z.string().min(1) }), z.null()]).optional(),
  metadata,
});

const envelope = z.object({
  id: z.string().min(1),
  type: z.string(),
  data: z.object({ object: z.unknown() }),
});

/**
 * Shared by the real Stripe gateway and the fake so both normalise identically.
 * Accepts anything event-shaped (it is only called after signature verification).
 */
export function normalizeStripeEvent(input: unknown): PaymentEvent {
  const parsedEnvelope = envelope.safeParse(input);
  if (!parsedEnvelope.success) throw new PaymentEventShapeError('unknown');
  const { id, type, data } = parsedEnvelope.data;

  switch (type) {
    case 'payment_intent.succeeded': {
      const object = succeededObject.safeParse(data.object);
      if (!object.success) throw new PaymentEventShapeError(type);
      return {
        id,
        type,
        paymentIntentId: object.data.id,
        amountReceivedPence: object.data.amount_received,
        currency: object.data.currency.toLowerCase(),
        metadata: object.data.metadata,
      };
    }
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled': {
      const object = intentObject.safeParse(data.object);
      if (!object.success) throw new PaymentEventShapeError(type);
      return { id, type, paymentIntentId: object.data.id, metadata: object.data.metadata };
    }
    case 'charge.refunded': {
      const object = chargeObject.safeParse(data.object);
      if (!object.success) throw new PaymentEventShapeError(type);
      const intent = object.data.payment_intent;
      return {
        id,
        type,
        paymentIntentId: typeof intent === 'string' ? intent : (intent?.id ?? null),
        fullyRefunded: object.data.amount > 0 && object.data.amount_refunded === object.data.amount,
        metadata: object.data.metadata,
      };
    }
    default:
      return { id, type: 'ignored', rawType: type };
  }
}
