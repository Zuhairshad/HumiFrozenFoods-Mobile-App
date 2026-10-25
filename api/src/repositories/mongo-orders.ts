import type { Db, Document, Filter } from 'mongodb';
import pino, { type Logger } from 'pino';
import type { Clock, OrdersRepository } from '../domain/ports.js';
import type { BusinessConfig, NewOrder, PaymentTransition, StoredOrder } from '../domain/types.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { isObjectIdString, parseObjectId } from '../lib/ids.js';
import { isValidOrderNumber, MAX_ORDER_NUMBER_ATTEMPTS, randomOrderNumber } from '../orders/order-number.js';
import { APP_SOURCE, fromSiteDocument, toSiteDocument } from '../orders/site-order-mapper.js';
import { transitionRule } from '../orders/statuses.js';

const MAX_STALE_BATCH = 500;
const PAYMENT_INTENT_ID = /^[A-Za-z0-9_]{1,255}$/;
const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === DUPLICATE_KEY;
}

function assertIntentId(value: string): void {
  if (!PAYMENT_INTENT_ID.test(value)) throw new RangeError('Invalid payment intent id');
}

/**
 * Orders live in the owner's production collection, so this repository is deliberately narrow:
 * it inserts new documents, reads, and updates only documents carrying `app_meta.source === "mobile-app"`.
 * It never deletes, never creates indexes, and every filter value is a validated string or a typed ObjectId.
 */
export function createMongoOrdersRepository(
  db: Db,
  business: BusinessConfig,
  clock: Clock,
  logger: Pick<Logger, 'warn'> = pino({ level: 'silent' }),
): OrdersRepository {
  const orders = db.collection(business.collections.orders);
  const read = (doc: unknown): StoredOrder | null =>
    fromSiteDocument(doc, { freeDeliveryThresholdPence: business.delivery.freeThresholdPence, logger });

  const orderNumberExists = async (orderNumber: string): Promise<boolean> => {
    if (!isValidOrderNumber(orderNumber)) return false;
    return (await orders.countDocuments({ tracking_number: orderNumber }, { limit: 1 })) > 0;
  };

  const findAppOrder = async (id: string): Promise<StoredOrder | null> => {
    if (!isObjectIdString(id)) return null;
    return read(await orders.findOne({ _id: parseObjectId(id), 'app_meta.source': APP_SOURCE }));
  };

  return {
    async insertPending(order: NewOrder) {
      let candidate = order.orderNumber;
      for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
        if (!(await orderNumberExists(candidate))) {
          const doc = toSiteDocument({ ...order, orderNumber: candidate }, { now: clock.now() });
          try {
            const { insertedId } = await orders.insertOne(doc);
            const stored = read({ ...doc, _id: insertedId });
            if (!stored) throw new Error('Inserted order could not be read back');
            return stored;
          } catch (error) {
            // Only reachable if the owner's collection has a unique index on tracking_number.
            if (!isDuplicateKey(error)) throw error;
          }
        }
        candidate = randomOrderNumber(business.orderNumberDigits);
      }
      throw new ConflictError('Could not allocate an order number, please retry', 'order_number_unavailable');
    },

    async findById(orderId) {
      if (!isObjectIdString(orderId)) return null;
      return read(await orders.findOne({ _id: parseObjectId(orderId) }));
    },

    async findByOrderNumber(orderNumber) {
      if (!isValidOrderNumber(orderNumber)) return null;
      return read(await orders.findOne({ tracking_number: orderNumber }));
    },

    async attachPaymentIntent(orderId, paymentIntentId) {
      assertIntentId(paymentIntentId);
      if (!isObjectIdString(orderId)) throw new NotFoundError('Order not found');
      const result = await orders.updateOne(
        { _id: parseObjectId(orderId), 'app_meta.source': APP_SOURCE },
        { $set: { payment_intent: { id: paymentIntentId, client_secret_redacted: true }, updated_at: clock.now() } },
      );
      if (result.matchedCount === 0) throw new NotFoundError('Order not found');
    },

    async applyPaymentTransition(orderId, transition: PaymentTransition) {
      assertIntentId(transition.paymentIntentId);
      if (!isObjectIdString(orderId)) return null;
      const rule = transitionRule(transition.kind, business.paidOrderStatus);
      const now = clock.now();
      const filter: Filter<Document> = {
        _id: parseObjectId(orderId),
        'app_meta.source': APP_SOURCE,
        payment_status: { $in: [...rule.allowedFrom] },
        // An intent id, once stored, is the only one allowed to move this order.
        'payment_intent.id': { $in: [transition.paymentIntentId, null] },
      };

      // A paid order only leaves `order-pending` when the owner configured a different paid status;
      // a status an admin already advanced is never overwritten.
      const update =
        transition.kind === 'paid'
          ? [
              {
                $set: {
                  payment_status: rule.toPayment,
                  order_status: { $cond: [{ $eq: ['$order_status', 'order-pending'] }, rule.toOrder, '$order_status'] },
                  updated_at: now,
                },
              },
            ]
          : {
              $set: {
                payment_status: rule.toPayment,
                ...(rule.toOrder === null ? {} : { order_status: rule.toOrder }),
                updated_at: now,
              },
            };

      const updated = await orders.findOneAndUpdate(filter, update, { returnDocument: 'after' });
      // No match: unknown, not app-created, or the monotonic rule refused. Report the unchanged order so callers can inspect it.
      return updated ? read(updated) : findAppOrder(orderId);
    },

    async findStalePending(olderThan, limit) {
      if (Number.isNaN(olderThan.getTime())) throw new RangeError('Invalid cutoff date');
      const size = Math.min(Math.max(1, Math.trunc(limit)), MAX_STALE_BATCH);
      const docs = await orders
        .find({ 'app_meta.source': APP_SOURCE, payment_status: 'payment-pending', created_at: { $lt: olderThan } })
        .sort({ created_at: 1 })
        .limit(size)
        .toArray();
      return docs.map(read).filter((o): o is StoredOrder => o !== null);
    },

    orderNumberExists,
  };
}
