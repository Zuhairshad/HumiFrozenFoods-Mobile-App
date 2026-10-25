import type { Collection } from 'mongodb';
import type { NewOrder } from '../domain/types.js';
import {
  countStatuses,
  diffShapes,
  hasBlockingGap,
  profileTrackingNumbers,
  renderReport,
  shapeOf,
} from './schema-diff.js';
import { APP_SOURCE, toSiteDocument } from './site-order-mapper.js';

const RECENT_ORDERS = 200;

export function sampleNewOrder(): NewOrder {
  return {
    orderNumber: '123456789012',
    lines: [
      { productId: 'punjabi-samosa-roti', sourceId: '6985bc5e0000000000000001', name: 'Sample', image: 'https://example.invalid/a.jpg', unitPricePence: 599, quantity: 2, lineTotalPence: 1198 },
      { productId: 'seekh-kebab', sourceId: '6985bc5e0000000000000002', name: 'Sample two', image: null, unitPricePence: 1400, quantity: 1, lineTotalPence: 1400 },
    ],
    pricing: { subtotalPence: 2598, deliveryPence: 799, discountPence: 0, totalPence: 3397, currency: 'gbp', promoCode: null, freeDeliveryRemainingPence: 2402 },
    contact: { name: 'Sample Person', email: 'sample@example.invalid', phone: '+447700900123' },
    address: { line1: '1 Sample Street', line2: 'Flat 2', city: 'London', postcode: 'AB1 2CD' },
    slot: { date: '2026-01-01', window: 'morning' },
    notes: 'Sample note',
    idempotencyKeyHash: 'a'.repeat(64),
    appVersion: '1.0.0',
  };
}

export interface VerifyResult {
  /** 0 ok, 1 a site key that looks required is missing from our document, 2 nothing to compare against. */
  exitCode: 0 | 1 | 2;
  lines: string[];
}

/** Read-only by type: the collection handle exposes only find and countDocuments. */
export async function verifyOrdersSchema(
  orders: Pick<Collection, 'find' | 'countDocuments'>,
  now: Date,
): Promise<VerifyResult> {
  const [siteDoc] = await orders.find({ app_meta: { $exists: false } }).sort({ _id: -1 }).limit(1).toArray();
  const recent = await orders
    .find({}, { projection: { _id: 0, order_status: 1, payment_status: 1, tracking_number: 1 } })
    .sort({ _id: -1 })
    .limit(RECENT_ORDERS)
    .toArray();
  const appOrderCount = await orders.countDocuments({ 'app_meta.source': APP_SOURCE }, { maxTimeMS: 5000 });

  const diff = siteDoc ? diffShapes(shapeOf(siteDoc), shapeOf({ ...toSiteDocument(sampleNewOrder(), { now }) })) : null;
  const lines = renderReport({
    diff,
    orderStatuses: countStatuses(recent, 'order_status'),
    paymentStatuses: countStatuses(recent, 'payment_status'),
    tracking: profileTrackingNumbers(recent.map((d) => d.tracking_number as unknown)),
    sampledOrders: recent.length,
    appOrderCount,
  });
  if (!diff) return { exitCode: 2, lines };
  const blocked = hasBlockingGap(diff);
  lines.push('', blocked ? 'RESULT: a key that looks required is missing from our document. Do not enable writes yet.' : 'RESULT: no required-looking key is missing from our document.');
  return { exitCode: blocked ? 1 : 0, lines };
}
