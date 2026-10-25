import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { FeatureDeps, PaymentEvent } from '../domain/ports.js';
import { PaymentSignatureError } from '../domain/ports.js';
import type { PaymentTransition, StoredOrder } from '../domain/types.js';
import { AppError } from '../lib/errors.js';
import { isObjectIdString } from '../lib/ids.js';
import { PAYMENT_SOURCE } from '../payments/stripe-event.js';
import type { AppEnv } from '../types.js';

type Outcome = 'ignored' | 'applied' | 'duplicate';

/** Events that carry an order, narrowed so `metadata` is always present. */
type OrderEvent = Exclude<PaymentEvent, { type: 'ignored' }>;

/**
 * POST /webhooks/stripe.
 *
 * Dedupe design: processing runs first and the event id is recorded only afterwards. Every transition is
 * monotonic and idempotent (OrdersRepository.applyPaymentTransition), so a redelivery that races or follows a
 * partial failure is harmless, whereas claiming the id first would turn a transient database error into a
 * permanently swallowed payment (the retry would be answered "duplicate"). Cost: a redelivery re-runs a no-op
 * transition before recordIfNew reports it as a duplicate. Events that are not ours are never recorded.
 */
export function webhookRoutes(deps: FeatureDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post('/webhooks/stripe', async (c) => {
    // Raw text, before anything parses it: the signature covers the exact bytes Stripe sent.
    const rawBody = await c.req.text();
    let event: PaymentEvent;
    try {
      event = deps.payments.parseWebhook(rawBody, c.req.header('stripe-signature'));
    } catch (error) {
      if (error instanceof PaymentSignatureError) {
        throw new AppError(400, 'invalid_signature', 'Invalid webhook signature');
      }
      throw error;
    }

    const outcome = await handleEvent(event, c.get('logger'));
    return c.json({ received: true, outcome });
  });

  async function handleEvent(event: PaymentEvent, logger: Logger): Promise<Outcome> {
    if (event.type === 'ignored') return 'ignored';
    if (event.metadata.source !== PAYMENT_SOURCE) return 'ignored';

    const transition = resolveTransition(event, logger);
    if (transition === null) return 'ignored';

    const eventLog = logger.child({ eventId: event.id, eventType: event.type });
    const order = await deps.orders.findById(transition.orderId);
    if (!order?.createdByApp) {
      eventLog.warn({ orderId: transition.orderId }, 'webhook_order_unknown');
      return 'ignored';
    }
    if (order.paymentIntentId !== transition.transition.paymentIntentId) {
      eventLog.warn({ orderId: order.orderId }, 'webhook_intent_mismatch');
      return 'ignored';
    }
    if (event.type === 'payment_intent.succeeded' && !amountMatches(event, order, eventLog)) return 'ignored';

    const updated = await deps.orders.applyPaymentTransition(order.orderId, transition.transition);
    if (!updated) {
      eventLog.warn({ orderId: order.orderId }, 'webhook_order_unknown');
      return 'ignored';
    }
    if (
      transition.transition.kind === 'paid' &&
      (updated.sitePaymentStatus !== 'payment-success' || updated.siteOrderStatus === 'order-cancelled')
    ) {
      // Money was taken but the order is not live (e.g. the expiry job cancelled it first): needs a human.
      eventLog.error(
        { orderId: order.orderId, siteOrderStatus: updated.siteOrderStatus, sitePaymentStatus: updated.sitePaymentStatus },
        'payment_not_applied',
      );
    }

    const isNew = await deps.webhookEvents.recordIfNew(event.id, event.type);
    if (!isNew) {
      eventLog.debug({ orderId: order.orderId }, 'webhook_duplicate');
      return 'duplicate';
    }
    return 'applied';
  }

  function resolveTransition(event: OrderEvent, logger: Logger): { orderId: string; transition: PaymentTransition } | null {
    const { orderId } = event.metadata;
    if (!orderId || !isObjectIdString(orderId)) {
      logger.warn({ eventId: event.id, eventType: event.type }, 'webhook_order_unknown');
      return null;
    }
    switch (event.type) {
      case 'payment_intent.succeeded':
        return { orderId, transition: { kind: 'paid', paymentIntentId: event.paymentIntentId } };
      case 'payment_intent.payment_failed':
        return { orderId, transition: { kind: 'failed', paymentIntentId: event.paymentIntentId } };
      case 'payment_intent.canceled':
        return { orderId, transition: { kind: 'cancelled', paymentIntentId: event.paymentIntentId } };
      case 'charge.refunded':
        // Partial refunds leave the order paid; only a full refund is a state change.
        if (!event.fullyRefunded || event.paymentIntentId === null) return null;
        return { orderId, transition: { kind: 'refunded', paymentIntentId: event.paymentIntentId } };
    }
  }

  function amountMatches(
    event: Extract<PaymentEvent, { type: 'payment_intent.succeeded' }>,
    order: StoredOrder,
    logger: Logger,
  ): boolean {
    const expected = order.pricing.totalPence;
    if (event.amountReceivedPence === expected && event.currency === 'gbp') return true;
    logger.error(
      {
        orderId: order.orderId,
        expectedPence: expected,
        receivedPence: event.amountReceivedPence,
        currency: event.currency,
      },
      'payment_amount_mismatch',
    );
    return false;
  }

  return routes;
}
