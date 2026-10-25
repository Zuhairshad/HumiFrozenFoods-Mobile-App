import type { FeatureDeps } from '../domain/ports.js';
import { NO_PAYMENT_INTENT_ID } from '../payments/stripe-event.js';

export interface ExpireResult {
  examined: number;
  cancelled: number;
  errors: number;
}

export type ExpireDeps = Pick<FeatureDeps, 'orders' | 'payments' | 'logger' | 'clock' | 'config'>;

const BATCH_SIZE = 100;
// Bounds one run (and a persistent failure that would otherwise be re-fetched forever).
const MAX_BATCHES = 20;

/**
 * Cancels app-created orders still awaiting payment after PENDING_ORDER_TTL_MINUTES (contract §6): cancels the
 * PaymentIntent first (already-final states are tolerated by the gateway), then the order. Never deletes, and
 * only touches what OrdersRepository.findStalePending returns (app-created orders). An order whose intent
 * cannot be cancelled is left pending and retried by the next run, so a still-payable intent never sits
 * behind a cancelled order.
 */
export async function expirePendingOrders(deps: ExpireDeps): Promise<ExpireResult> {
  const { orders, payments, logger, clock, config } = deps;
  const cutoff = new Date(clock.now().getTime() - config.business.pendingOrderTtlMinutes * 60_000);
  const result: ExpireResult = { examined: 0, cancelled: 0, errors: 0 };
  const seen = new Set<string>();

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const stale = (await orders.findStalePending(cutoff, BATCH_SIZE)).filter((order) => !seen.has(order.orderId));
    if (stale.length === 0) break;

    let progressed = false;
    for (const order of stale) {
      seen.add(order.orderId);
      result.examined += 1;
      try {
        if (order.paymentIntentId !== null) await payments.cancelPaymentIntent(order.paymentIntentId);
        await orders.applyPaymentTransition(order.orderId, {
          kind: 'cancelled',
          paymentIntentId: order.paymentIntentId ?? NO_PAYMENT_INTENT_ID,
        });
        result.cancelled += 1;
        progressed = true;
      } catch (error) {
        result.errors += 1;
        logger.error({ err: error, orderId: order.orderId }, 'expire-pending: could not cancel order');
      }
    }
    if (!progressed || stale.length < BATCH_SIZE) break;
  }

  logger.info({ ...result }, 'expire-pending finished');
  return result;
}
