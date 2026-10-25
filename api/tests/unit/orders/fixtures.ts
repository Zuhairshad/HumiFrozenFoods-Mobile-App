import { ObjectId } from 'mongodb';
import type { OrdersRepository } from '../../../src/domain/ports.js';
import type { NewOrder, PricedLine, StoredOrder } from '../../../src/domain/types.js';
import { fromSiteDocument, toSiteDocument } from '../../../src/orders/site-order-mapper.js';

export function firstLine(order: NewOrder = newOrder()): PricedLine {
  const [line] = order.lines;
  if (!line) throw new Error('fixture has no lines');
  return line;
}

/** Copy of an object without one key, typed so the key really is gone. */
export function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== key)) as Omit<T, K>;
}

export const NOW = new Date('2026-03-01T10:00:00.000Z');

export function newOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    orderNumber: '123456789012',
    lines: [
      { productId: 'punjabi-samosa-roti', sourceId: '6985bc5e0000000000000001', name: 'Punjabi Samosa Roti', image: 'https://img.example/a.jpg', unitPricePence: 599, quantity: 2, lineTotalPence: 1198 },
      { productId: 'seekh-kebab', sourceId: '6985bc5e0000000000000002', name: 'Seekh Kebab', image: null, unitPricePence: 1400, quantity: 1, lineTotalPence: 1400 },
    ],
    pricing: { subtotalPence: 2598, deliveryPence: 799, discountPence: 0, totalPence: 3397, currency: 'gbp', promoCode: null, freeDeliveryRemainingPence: 2402 },
    contact: { name: 'Ada Lovelace', email: 'Ada@Example.com', phone: '+44 7700 900123' },
    address: { line1: '1 High Street', line2: 'Flat 2', city: 'London', postcode: 'AB1 2CD' },
    slot: { date: '2026-03-05', window: 'afternoon' },
    notes: 'Leave with neighbour',
    idempotencyKeyHash: 'a'.repeat(64),
    appVersion: '1.2.3',
    ...overrides,
  };
}

/** A site-created order: no app_meta, string numbering, extra keys the admin portal might add. */
export function websiteDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: new ObjectId('6985bc5e00000000000000aa'),
    tracking_number: '555000111222',
    products: [{ product_id: new ObjectId('6985bc5e0000000000000001'), order_quantity: 1, unit_price: 5.99, subtotal: 5.99, name: 'Samosa' }],
    amount: 5.99,
    delivery_fee: 7.99,
    discount: 0,
    total: 13.98,
    paid_total: 13.98,
    customer_name: 'Grace Hopper',
    first_name: 'Grace',
    last_name: 'Hopper',
    customer_email: 'grace@example.com',
    customer_contact: '+447700900999',
    note: 'Ring the bell',
    order_status: 'order-processing',
    payment_status: 'payment-success',
    billing_address: { city: 'Leeds', country: '', street_address: '9 Low Road', post_code: 'LS1 1AA', location: null },
    shipping_address: { city: 'Leeds', country: '', street_address: '9 Low Road', post_code: 'LS1 1AA', location: null },
    created_at: new Date('2026-02-01T09:00:00.000Z'),
    payment_intent: { id: 'pi_site' },
    children: [],
    ...overrides,
  };
}

/** In-memory OrdersRepository for route tests. App orders go through the real mapper. */
export type FakeOrders = OrdersRepository & { seed(order: StoredOrder): void; calls: string[] };

export function fakeOrders(): FakeOrders {
  const byId = new Map<string, StoredOrder>();
  const calls: string[] = [];
  return {
    calls,
    seed(order) {
      byId.set(order.orderId, order);
    },
    insertPending(order) {
      const doc = { ...toSiteDocument(order, { now: NOW }), _id: new ObjectId() };
      const stored = fromSiteDocument(doc);
      if (!stored) return Promise.reject(new Error('unreadable'));
      byId.set(stored.orderId, stored);
      return Promise.resolve(stored);
    },
    findById(id) {
      calls.push(`findById:${id}`);
      return Promise.resolve(byId.get(id) ?? null);
    },
    findByOrderNumber(number) {
      calls.push(`findByOrderNumber:${number}`);
      return Promise.resolve([...byId.values()].find((o) => o.orderNumber === number) ?? null);
    },
    attachPaymentIntent: () => Promise.resolve(),
    applyPaymentTransition: () => Promise.resolve(null),
    findStalePending: () => Promise.resolve([]),
    orderNumberExists: (n) => Promise.resolve([...byId.values()].some((o) => o.orderNumber === n)),
  };
}

export async function storedAppOrder(overrides: Partial<NewOrder> = {}): Promise<StoredOrder> {
  const repo = fakeOrders();
  return repo.insertPending(newOrder(overrides));
}

export function storedWebsiteOrder(): StoredOrder {
  const stored = fromSiteDocument(websiteDoc());
  if (!stored) throw new Error('fixture unreadable');
  return stored;
}
