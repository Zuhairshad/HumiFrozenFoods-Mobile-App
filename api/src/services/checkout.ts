import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { FeatureDeps } from '../domain/ports.js';
import type { NewOrder, PricedLine, Pricing } from '../domain/types.js';
import { AppError, ConflictError, ValidationError } from '../lib/errors.js';
import { generateOrderNumber } from '../orders/order-number.js';
import { NO_PAYMENT_INTENT_ID } from '../payments/stripe-event.js';
import { canonicalJson } from './canonical-json.js';
import type { PaymentIntentBody } from './checkout-schema.js';
import { slotProblem } from './checkout-slots.js';

/** Contract §3.2 line shape: PricedLine without the internal product ObjectId. */
export type PublicPricedLine = Omit<PricedLine, 'sourceId'>;

export interface PaymentIntentResponse {
  orderId: string;
  orderNumber: string;
  guestToken: string;
  clientSecret: string;
  pricing: Pricing;
  lines: PublicPricedLine[];
}

export interface CheckoutResult {
  status: 200 | 201;
  replay: boolean;
  body: PaymentIntentResponse;
}

/** What the idempotency store holds: the response minus the guest token, which is re-issued on every replay. */
const storedResponseSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  clientSecret: z.string().min(1),
  pricing: z.object({
    subtotalPence: z.number().int(),
    deliveryPence: z.number().int(),
    discountPence: z.number().int(),
    totalPence: z.number().int(),
    currency: z.literal('gbp'),
    promoCode: z.string().nullable(),
    freeDeliveryRemainingPence: z.number().int(),
  }),
  lines: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      image: z.string().nullable(),
      unitPricePence: z.number().int(),
      quantity: z.number().int(),
      lineTotalPence: z.number().int(),
    }),
  ),
});
type StoredResponse = z.infer<typeof storedResponseSchema>;

// Stripe's minimum charge for GBP.
const MIN_CHARGE_PENCE = 30;
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function createCheckoutService(deps: FeatureDeps) {
  const { orders, payments, pricing, idempotency, guestTokens, clock, logger, config } = deps;

  /** Cancels an order we created but cannot hand to the client. Never throws: the expiry job is the backstop. */
  async function abandonOrder(orderId: string, paymentIntentId: string | null, reason: string): Promise<void> {
    if (paymentIntentId !== null) {
      try {
        await payments.cancelPaymentIntent(paymentIntentId);
      } catch (error) {
        logger.error({ err: error, orderId, reason }, 'could not cancel payment intent for abandoned order');
      }
    }
    try {
      await orders.applyPaymentTransition(orderId, { kind: 'cancelled', paymentIntentId: paymentIntentId ?? NO_PAYMENT_INTENT_ID });
    } catch (error) {
      logger.error({ err: error, orderId, reason }, 'could not cancel abandoned order; expiry job will clean it up');
    }
  }

  async function replayStored(record: { response: unknown }): Promise<CheckoutResult> {
    const parsed = storedResponseSchema.safeParse(record.response);
    if (!parsed.success) {
      logger.error('stored idempotent response is malformed');
      throw new AppError(500, 'internal_error', 'Internal server error');
    }
    const stored = parsed.data;
    const order = await orders.findById(stored.orderId);
    if (!order || order.siteOrderStatus === 'order-cancelled' || order.sitePaymentStatus === 'payment-failed') {
      throw new ConflictError('This checkout has expired. Start again with a new Idempotency-Key.', 'checkout_expired');
    }
    const { token } = guestTokens.issue(stored.orderId);
    return { status: 200, replay: true, body: { ...stored, guestToken: token } };
  }

  return {
    /**
     * Idempotent order + PaymentIntent creation. `idempotencyKey` must already be a validated UUID v4.
     * Failure after the order insert always cancels that order so no orphan pending order is left behind.
     */
    async createPaymentIntent(body: PaymentIntentBody, idempotencyKey: string): Promise<CheckoutResult> {
      const keyHash = sha256(idempotencyKey.toLowerCase());
      const requestHash = sha256(canonicalJson(body));

      const existing = await idempotency.find(keyHash);
      if (existing) {
        if (existing.requestHash !== requestHash) throw reuseError();
        return replayStored(existing);
      }

      if (!payments.enabled) throw new AppError(503, 'payment_provider_error', 'Payments are not configured');

      const problem = slotProblem(body.slot, clock.now());
      if (problem) throw new ValidationError([{ path: 'slot', message: problem }]);

      const quote = await pricing.quote({ lines: body.lines, promoCode: body.promoCode });
      if (quote.unavailable.length > 0) {
        throw new AppError(422, 'unavailable', 'Some items in your basket are no longer available', {
          details: { unavailable: quote.unavailable },
        });
      }
      if (quote.promo && !quote.promo.valid) {
        throw new AppError(422, 'invalid_promo', quote.promo.message ?? 'This promo code cannot be applied', {
          details: { code: quote.promo.code },
        });
      }
      if (quote.lines.length === 0) {
        throw new AppError(422, 'unprocessable', 'Your basket is empty');
      }
      const { minOrderPence } = config.business.delivery;
      if (quote.pricing.totalPence < minOrderPence) {
        throw new AppError(422, 'min_order', 'Your order is below the minimum order value', {
          details: { minOrderPence, totalPence: quote.pricing.totalPence },
        });
      }
      if (quote.pricing.totalPence < MIN_CHARGE_PENCE) {
        throw new AppError(422, 'unprocessable', 'This order total is too low to pay by card', {
          details: { totalPence: quote.pricing.totalPence },
        });
      }

      const newOrder: NewOrder = {
        orderNumber: await generateOrderNumber(orders, config.business.orderNumberDigits),
        lines: quote.lines,
        pricing: quote.pricing,
        contact: body.contact,
        address: body.address,
        slot: body.slot,
        idempotencyKeyHash: keyHash,
        ...(body.notes === undefined ? {} : { notes: body.notes }),
      };
      const order = await orders.insertPending(newOrder);

      let intent;
      try {
        // Keyed by order as well as request: if our own save fails and the client retries, Stripe must not
        // hand back the earlier (by then cancelled) intent for the new order.
        intent = await payments.createPaymentIntent({
          amountPence: quote.pricing.totalPence,
          currency: 'gbp',
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          receiptEmail: body.contact.email,
          idempotencyKey: `humi-pi-${keyHash.slice(0, 32)}-${order.orderId}`,
        });
      } catch (error) {
        await abandonOrder(order.orderId, null, 'payment_intent_failed');
        throw error instanceof AppError ? error : new AppError(502, 'payment_provider_error', 'The payment provider is unavailable. Please try again.', { cause: error });
      }

      try {
        await orders.attachPaymentIntent(order.orderId, intent.id);
      } catch (error) {
        await abandonOrder(order.orderId, intent.id, 'attach_failed');
        throw error;
      }

      const response: StoredResponse = {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        clientSecret: intent.clientSecret,
        pricing: quote.pricing,
        lines: quote.lines.map((line) => ({
          productId: line.productId,
          name: line.name,
          image: line.image,
          unitPricePence: line.unitPricePence,
          quantity: line.quantity,
          lineTotalPence: line.lineTotalPence,
        })),
      };

      let saved: boolean;
      try {
        saved = await idempotency.save({
          keyHash,
          requestHash,
          response,
          status: 201,
          createdAt: clock.now(),
        });
      } catch (error) {
        await abandonOrder(order.orderId, intent.id, 'idempotency_save_failed');
        throw error;
      }

      if (!saved) {
        // A concurrent request with the same key won; ours is a duplicate and must not stay payable.
        await abandonOrder(order.orderId, intent.id, 'idempotency_race');
        const winner = await idempotency.find(keyHash);
        if (!winner) throw new ConflictError('Please retry the request', 'conflict');
        if (winner.requestHash !== requestHash) throw reuseError();
        return replayStored(winner);
      }

      const { token } = guestTokens.issue(order.orderId);
      logger.info(
        { orderId: order.orderId, orderNumber: order.orderNumber, totalPence: quote.pricing.totalPence },
        'checkout payment intent created',
      );
      return { status: 201, replay: false, body: { ...response, guestToken: token } };
    },
  };
}

function reuseError(): ConflictError {
  return new ConflictError('Idempotency-Key was already used with a different request', 'idempotency_key_reuse');
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
