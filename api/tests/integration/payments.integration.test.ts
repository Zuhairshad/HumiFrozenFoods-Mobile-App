import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDatabase, type Database, ensureIndexes } from '../../src/db/client.js';
import { defaultIndexes } from '../../src/db/indexes.js';
import type { FeatureDeps } from '../../src/domain/ports.js';
import { expirePendingOrders } from '../../src/jobs/expire-pending.js';
import { Secret } from '../../src/lib/secret.js';
import { createFakeGateway } from '../../src/payments/fake-gateway.js';
import { createMongoIdempotencyStore, idempotencyIndexes } from '../../src/repositories/mongo-idempotency.js';
import { createMongoOrdersRepository } from '../../src/repositories/mongo-orders.js';
import { createMongoWebhookEventStore } from '../../src/repositories/mongo-webhook-events.js';
import { paymentIntentRoutes } from '../../src/routes/payment-intent.js';
import { webhookRoutes } from '../../src/routes/webhooks.js';
import { FakePricing, NOW } from '../unit/payments/fakes.js';
import { testDeps } from '../unit/helpers.js';

let server: MongoMemoryServer;
let database: Database;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  database = createDatabase({ uri: new Secret(server.getUri()), dbName: 'humis_payments_test' });
  await ensureIndexes(database.db(), [...defaultIndexes, idempotencyIndexes]);
}, 120_000);

afterAll(async () => {
  await database.close();
  await server.stop();
});

describe('createMongoWebhookEventStore', () => {
  it('records an event id once and reports duplicates', async () => {
    const store = createMongoWebhookEventStore(database.db());
    expect(await store.recordIfNew('evt_a', 'payment_intent.succeeded')).toBe(true);
    expect(await store.recordIfNew('evt_a', 'payment_intent.succeeded')).toBe(false);
    expect(await store.recordIfNew('evt_b', 'payment_intent.succeeded')).toBe(true);
    const doc = await database.db().collection('webhook_events').findOne({ eventId: 'evt_a' });
    expect(doc).toMatchObject({ eventId: 'evt_a', type: 'payment_intent.succeeded' });
    expect(doc?.receivedAt).toBeInstanceOf(Date);
  });

  it('lets exactly one of many concurrent deliveries win', async () => {
    const store = createMongoWebhookEventStore(database.db());
    const results = await Promise.all(Array.from({ length: 20 }, () => store.recordIfNew('evt_race', 'x')));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('rethrows errors that are not duplicate-key conflicts', async () => {
    const unreachable = createDatabase({
      uri: new Secret('mongodb://127.0.0.1:1/'),
      dbName: 'x',
      clientOptions: { serverSelectionTimeoutMS: 300 },
    });
    await expect(createMongoWebhookEventStore(unreachable.db()).recordIfNew('evt_z', 'x')).rejects.toThrow();
    await unreachable.close();
  });
});

describe('idempotency claims against real MongoDB', () => {
  const key = (n: string) => n.repeat(64).slice(0, 64);
  const t0 = new Date('2026-10-26T10:00:00Z');

  it('lets exactly one of many concurrent claims win; completing exposes the response; release frees the key', async () => {
    const store = createMongoIdempotencyStore(database.db());
    const results = await Promise.all(Array.from({ length: 25 }, () => store.claim(key('c'), 'r1', t0)));
    expect(results.filter((r) => r.outcome === 'claimed')).toHaveLength(1);
    const loser = results.find((r) => r.outcome === 'exists');
    expect(loser).toMatchObject({ record: { state: 'in_progress', requestHash: 'r1' } });
    expect(await store.complete(key('c'), { orderId: 'x' }, 201)).toBe(true);
    expect(await store.find(key('c'))).toMatchObject({ response: { orderId: 'x' }, status: 201 });
    expect((await store.find(key('c')))?.state).toBeUndefined();
    await store.release(key('c')); // completed records are never released
    expect(await store.find(key('c'))).not.toBeNull();

    expect(await store.claim(key('d'), 'r1', t0)).toEqual({ outcome: 'claimed' });
    await store.release(key('d'));
    expect(await store.claim(key('d'), 'r2', t0)).toEqual({ outcome: 'claimed' });
  });

  it('reclaims a stale claim but not a fresh one, and the old owner then cannot complete', async () => {
    const store = createMongoIdempotencyStore(database.db());
    await store.claim(key('e'), 'r1', t0);
    expect((await store.claim(key('e'), 'r2', new Date(t0.getTime() + 30_000))).outcome).toBe('exists');
    const takeover = await Promise.all(Array.from({ length: 10 }, () => store.claim(key('e'), 'r2', new Date(t0.getTime() + 61_000))));
    expect(takeover.filter((r) => r.outcome === 'claimed')).toHaveLength(1);
    expect(await store.find(key('e'))).toMatchObject({ requestHash: 'r2' });
  });
});

describe('checkout -> webhook -> expiry against real MongoDB', () => {
  const clock = { now: () => NOW };
  const gateway = createFakeGateway({ now: () => NOW.getTime() });
  const base = testDeps({}, { PENDING_ORDER_TTL_MINUTES: '10' });

  function build() {
    const db = database.db();
    const deps: FeatureDeps = {
      config: base.config,
      logger: base.logger,
      clock,
      products: { list: () => Promise.reject(new Error('unused')), findByIdOrSlug: () => Promise.reject(new Error('unused')), findManyBySlugs: () => Promise.reject(new Error('unused')), countByCollection: () => Promise.reject(new Error('unused')) },
      orders: createMongoOrdersRepository(db, base.config.business, clock),
      idempotency: createMongoIdempotencyStore(db),
      enquiries: { insert: () => Promise.reject(new Error('unused')) },
      webhookEvents: createMongoWebhookEventStore(db),
      payments: gateway,
      pricing: new FakePricing(),
      guestTokens: base.guestTokens,
      rateLimitStore: base.rateLimitStore,
    };
    const app = createApp(base, (a) => {
      a.route('/v1', paymentIntentRoutes(deps));
      a.route('/v1', webhookRoutes(deps));
    });
    return { app, deps };
  }

  const payload = {
    lines: [{ productId: 'chicken-samosa', quantity: 4 }],
    contact: { name: 'Asha Patel', email: 'asha@example.com', phone: '07123 456789' },
    address: { line1: '1 High Street', city: 'London', postcode: 'sw1a1aa' },
    slot: { date: '2026-10-28', window: 'morning' },
  };

  it('creates an order, replays idempotently, and settles via a signed webhook', async () => {
    const { app, deps } = build();
    const key = '4b0d9a4e-8f3b-4f64-9a52-3c6c1f7a2e10';
    const post = () =>
      app.request('/v1/checkout/payment-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(payload),
      });
    const first = await post();
    expect(first.status).toBe(201);
    const created = (await first.json()) as { orderId: string; orderNumber: string; pricing: { totalPence: number } };
    const replay = await post();
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { orderId: string }).orderId).toBe(created.orderId);
    expect(await database.db().collection('orders').countDocuments({ tracking_number: created.orderNumber })).toBe(1);

    const stored = await deps.orders.findById(created.orderId);
    expect(stored).toMatchObject({ sitePaymentStatus: 'payment-pending', paymentIntentId: 'pi_fake_000001', createdByApp: true });

    const raw = JSON.stringify({
      id: 'evt_int_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_fake_000001',
          amount_received: created.pricing.totalPence,
          currency: 'gbp',
          metadata: { orderId: created.orderId, orderNumber: created.orderNumber, source: 'humi-mobile-app' },
        },
      },
    });
    const hook = () =>
      app.request('/v1/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': gateway.sign(raw) },
        body: raw,
      });
    expect(await (await hook()).json()).toEqual({ received: true, outcome: 'applied' });
    expect(await (await hook()).json()).toEqual({ received: true, outcome: 'duplicate' });
    expect(await deps.orders.findById(created.orderId)).toMatchObject({ sitePaymentStatus: 'payment-success', status: 'placed' });
  });

  it('expires stale unpaid app orders in the real collection and leaves paid ones', async () => {
    const { app, deps } = build();
    const post = (key: string, quantity: number) =>
      app.request('/v1/checkout/payment-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify({ ...payload, lines: [{ productId: 'seekh-kebab', quantity }] }),
      });
    const unpaid = (await (await post('5b0d9a4e-8f3b-4f64-9a52-3c6c1f7a2e10', 1)).json()) as { orderId: string };

    const later = { now: () => new Date(NOW.getTime() + 11 * 60_000) };
    const result = await expirePendingOrders({ orders: deps.orders, payments: gateway, logger: deps.logger, clock: later, config: deps.config });
    expect(result.errors).toBe(0);
    expect(result.cancelled).toBeGreaterThanOrEqual(1);
    expect(await deps.orders.findById(unpaid.orderId)).toMatchObject({ siteOrderStatus: 'order-cancelled', sitePaymentStatus: 'payment-failed' });
    // The paid order from the previous test is untouched.
    const paid = await database.db().collection('orders').findOne({ payment_status: 'payment-success' });
    expect(paid?.order_status).toBe('order-pending');
    expect(await database.db().collection('orders').countDocuments({ order_status: 'order-cancelled', 'app_meta.source': { $ne: 'mobile-app' } })).toBe(0);
  });
});
