import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, type Harness } from '../../support/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
}, 120_000);

afterAll(async () => {
  await h.close();
});

describe('data safety: the owner\'s collections', () => {
  it('seeded state sanity: three website orders without app_meta, no extra indexes', async () => {
    const orders = await h.db.collection('orders').find({}).toArray();
    expect(orders).toHaveLength(3);
    for (const o of orders) {
      expect(o).not.toHaveProperty('app_meta');
      expect(o['tracking_number']).toMatch(/^\d{10,12}$/);
    }
    const summary = await h.indexSummary();
    expect(summary['orders']?.map((i) => i.name)).toEqual(['_id_']);
    expect(summary['products']?.map((i) => i.name)).toEqual(['_id_']);
  });

  it('a full lifecycle plus every failure path leaves website orders byte-identical and creates no indexes on products/orders', async () => {
    // Happy path through to paid, delivered by staff, refunded.
    const paid = await h.createOrder({ promoCode: 'HUMI15' });
    await h.pay(paid);
    await h.get(`/v1/orders/${paid.orderId}`, { token: paid.guestToken });
    await h.post('/v1/orders/lookup', { orderNumber: paid.orderNumber, email: 'asha.patel@example.com' });
    await h.deliver(h.refundEvent(paid));
    // Failure paths.
    const cancelled = await h.createOrder();
    await h.deliver(h.paymentEvent('payment_intent.canceled', cancelled));
    h.control.failCreate = new Error('boom');
    await h.checkout();
    h.control.failCreate = null;
    await h.checkout({ promoCode: 'NOPE' });
    await h.checkout({ lines: [{ productId: 'nope', quantity: 1 }] });
    // Hostile lookups and webhooks aimed at website orders.
    for (const tracking of ['482915037264', '175000012399', '660011223344']) {
      await h.post('/v1/orders/lookup', { orderNumber: tracking, email: 'sam.site@example.com' });
      const doc = await h.db.collection('orders').findOne({ tracking_number: tracking });
      const ref = { orderId: String(doc?.['_id']), orderNumber: tracking, pricing: { totalPence: 1 } };
      await h.postWebhook(h.paymentEvent('payment_intent.succeeded', ref, { intentId: 'pi_x' }));
      await h.postWebhook(h.refundEvent(ref));
    }
    await h.post('/v1/enquiries', { type: 'contact', name: 'Asha Patel', email: 'a@example.com', message: 'Hello there, a question please' });
    h.clock.advanceMinutes(300);
    await h.checkout();

    await expectSiteDataIntact(h);
  });

  it('every document in orders is either a seeded website order or an app order marked with app_meta.source', async () => {
    const all = await h.db.collection('orders').find({}).toArray();
    const seeded = h.seededOrderHashes();
    const app = all.filter((o) => !seeded.has(String(o['_id'])));
    expect(app.length).toBeGreaterThan(0);
    for (const o of app) expect((o['app_meta'] as { source: string }).source).toBe('mobile-app');
    expect(all.length - app.length).toBe(3);
  });

  it('the API only wrote to its own collections plus orders/', async () => {
    const names = (await h.db.listCollections().toArray()).map((c) => c.name).sort();
    expect(names).toEqual(['app_enquiries', 'app_idempotency', 'orders', 'products', 'webhook_events']);
    const indexes = await h.indexSummary();
    expect(indexes).toEqual(h.indexBaseline());
    // Its own collections do get their documented indexes.
    expect((await h.db.collection('webhook_events').indexes()).some((i) => i['unique'] === true)).toBe(true);
    expect((await h.db.collection('app_idempotency').indexes()).some((i) => i['unique'] === true)).toBe(true);
  });

  it('product documents are only ever read: sensitive fields remain in the database', async () => {
    const doc = await h.db.collection('products').findOne({ slug: 'aloo-tikki' });
    expect(doc).toMatchObject({ sku: '001', quantity: 1296, sold_quantity: expect.any(Number) as number });
    expect(doc?.['b2b_pricing']).toBeDefined();
  });
});
