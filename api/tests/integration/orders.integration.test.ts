import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId, type Db, type Document } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureIndexes, createDatabase, type Database } from '../../src/db/client.js';
import type { PaymentTransition, SitePaymentStatus } from '../../src/domain/types.js';
import { NotFoundError } from '../../src/lib/errors.js';
import { generateOrderNumber } from '../../src/orders/order-number.js';
import { Secret } from '../../src/lib/secret.js';
import { verifyOrdersSchema } from '../../src/orders/schema-verify.js';
import { toSiteDocument } from '../../src/orders/site-order-mapper.js';
import { SITE_PAYMENT_STATUSES } from '../../src/orders/statuses.js';
import { createMongoIdempotencyStore, idempotencyIndexes } from '../../src/repositories/mongo-idempotency.js';
import { createMongoOrdersRepository } from '../../src/repositories/mongo-orders.js';
import { testConfig } from '../unit/helpers.js';
import { buildOrdersApp } from '../unit/orders/app-fixture.js';
import { newOrder, NOW, websiteDoc, without } from '../unit/orders/fixtures.js';

let server: MongoMemoryServer;
let database: Database;
let db: Db;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  database = createDatabase({ uri: new Secret(server.getUri()), dbName: 'orders_test' });
  db = database.db();
}, 120_000);

afterAll(async () => {
  await database.close();
  await server.stop();
});

beforeEach(async () => {
  await db.collection('orders').deleteMany({});
  await db.collection('app_idempotency').deleteMany({});
});

interface Call {
  collection: string;
  method: string;
  args: unknown[];
}

/** Wraps a Db so every collection method call is recorded; the real collection still executes it. */
function recording(real: Db, calls: Call[]): Db {
  return new Proxy(real, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (prop !== 'collection') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      return (name: string) => {
        const collection = target.collection(name);
        return new Proxy(collection, {
          get(ct, p) {
            const member: unknown = Reflect.get(ct, p, ct);
            if (typeof member !== 'function') return member;
            return (...args: unknown[]) => {
              calls.push({ collection: name, method: String(p), args });
              return (member as (...a: unknown[]) => unknown).apply(ct, args);
            };
          },
        });
      };
    },
  });
}

const business = (env: Record<string, string> = {}) => testConfig(env).business;
const repoFor = (target: Db = db, env: Record<string, string> = {}) => createMongoOrdersRepository(target, business(env), { now: () => NOW });
const orders = () => db.collection('orders');

/** Inserts an app-created document with chosen statuses, bypassing the repository. */
async function seedApp(fields: Document = {}): Promise<ObjectId> {
  const doc = { ...toSiteDocument(newOrder({ orderNumber: String(Math.floor(Math.random() * 1e12)).padStart(12, '0') }), { now: NOW }), ...fields };
  return (await orders().insertOne(doc)).insertedId;
}

async function seedForeign(fields: Document = {}): Promise<ObjectId> {
  const doc = without(websiteDoc({ tracking_number: String(Math.floor(Math.random() * 1e12)).padStart(12, '0'), ...fields }), '_id');
  return (await orders().insertOne(doc)).insertedId;
}

describe('insertPending and reads', () => {
  it('inserts exactly the contract document and reads it back', async () => {
    const repo = repoFor();
    const stored = await repo.insertPending(newOrder());
    expect(stored).toMatchObject({ orderNumber: '123456789012', status: 'pending_payment', paymentStatus: 'pending', createdByApp: true, paymentIntentId: null });
    const raw = await orders().findOne({ _id: new ObjectId(stored.orderId) });
    expect(raw).toMatchObject({
      tracking_number: '123456789012',
      total: 33.97,
      amount: 25.98,
      delivery_fee: 7.99,
      order_status: 'order-pending',
      payment_status: 'payment-pending',
      payment_gateway: 'STRIPE',
      created_at: NOW,
      note: 'Leave with neighbour\nDelivery: 2026-03-05 afternoon',
    });
    expect((raw?.products as { product_id: unknown }[] | undefined)?.[0]?.product_id).toBeInstanceOf(ObjectId);
    expect((raw?.app_meta as { source: string } | undefined)?.source).toBe('mobile-app');
    expect(await repo.findById(stored.orderId)).toEqual(stored);
    expect(await repo.findByOrderNumber('123456789012')).toEqual(stored);
  });

  it('assigns a new number when the requested one already exists (even on a website order)', async () => {
    await seedForeign({ tracking_number: '123456789012' });
    const stored = await repoFor().insertPending(newOrder());
    expect(stored.orderNumber).not.toBe('123456789012');
    expect(stored.orderNumber).toMatch(/^\d{12}$/);
    expect(await orders().countDocuments({ tracking_number: stored.orderNumber })).toBe(1);
  });

  it('survives concurrent inserts with generated numbers and keeps every number unique', async () => {
    const repo = repoFor();
    const results = await Promise.all(
      Array.from({ length: 25 }, async () => repo.insertPending(newOrder({ orderNumber: await generateOrderNumber(repo, 12) }))),
    );
    expect(new Set(results.map((o) => o.orderNumber)).size).toBe(25);
    expect(new Set(results.map((o) => o.orderId)).size).toBe(25);
  });

  it('retries through a unique index on tracking_number (the owner may have one)', async () => {
    const isolated = db.client.db('orders_unique_idx');
    await isolated.collection('orders').createIndex({ tracking_number: 1 }, { unique: true });
    await isolated.collection('orders').insertOne({ tracking_number: '123456789012' });
    const stored = await repoFor(isolated).insertPending(newOrder());
    expect(stored.orderNumber).not.toBe('123456789012');
    await isolated.dropDatabase();
  });

  it('reads unknown and malformed ids as null', async () => {
    const repo = repoFor();
    expect(await repo.findById(new ObjectId().toHexString())).toBeNull();
    expect(await repo.findById('not-an-id')).toBeNull();
    expect(await repo.findByOrderNumber('000000000000')).toBeNull();
  });

  it('orderNumberExists sees app and website orders', async () => {
    const repo = repoFor();
    await seedForeign({ tracking_number: '424242424242' });
    expect(await repo.orderNumberExists('424242424242')).toBe(true);
    expect(await repo.orderNumberExists('424242424243')).toBe(false);
  });
});

describe('injection payloads never act as operators', () => {
  it('returns nothing for operator objects, even when matching orders exist', async () => {
    const repo = repoFor();
    await repo.insertPending(newOrder());
    const payloads: unknown[] = [{ $ne: '' }, { $gt: '' }, { $regex: '.*' }, { $in: ['123456789012'] }, ['123456789012'], '.*', '123456789012 || 1', '$where', "1'; return true; //"];
    for (const payload of payloads) {
      expect(await repo.findByOrderNumber(payload as string)).toBeNull();
      expect(await repo.orderNumberExists(payload as string)).toBe(false);
      expect(await repo.findById(payload as string)).toBeNull();
    }
  });

  it('does not let a hostile intent id or order id reach an update', async () => {
    const repo = repoFor();
    const id = await seedApp();
    await expect(repo.attachPaymentIntent(id.toHexString(), '$set')).rejects.toThrow(RangeError);
    expect(await repo.applyPaymentTransition({ $ne: null } as unknown as string, { kind: 'paid', paymentIntentId: 'pi_1' })).toBeNull();
    expect((await orders().findOne({ _id: id }))?.payment_status).toBe('payment-pending');
  });
});

describe('attachPaymentIntent', () => {
  it('stores the intent id (never a secret) on an app order only', async () => {
    const repo = repoFor();
    const stored = await repo.insertPending(newOrder());
    await repo.attachPaymentIntent(stored.orderId, 'pi_abc123');
    const raw = await orders().findOne({ _id: new ObjectId(stored.orderId) });
    expect(raw?.payment_intent).toEqual({ id: 'pi_abc123', client_secret_redacted: true });
    expect((await repo.findById(stored.orderId))?.paymentIntentId).toBe('pi_abc123');
  });

  it('throws NotFound for unknown ids and leaves website orders untouched', async () => {
    const repo = repoFor();
    const foreign = await seedForeign();
    const before = await orders().findOne({ _id: foreign });
    await expect(repo.attachPaymentIntent(foreign.toHexString(), 'pi_x')).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.attachPaymentIntent(new ObjectId().toHexString(), 'pi_x')).rejects.toBeInstanceOf(NotFoundError);
    expect(await orders().findOne({ _id: foreign })).toEqual(before);
  });
});

describe('applyPaymentTransition: monotonic matrix', () => {
  const allowed: Record<PaymentTransition['kind'], readonly SitePaymentStatus[]> = {
    paid: ['payment-pending', 'payment-processing', 'payment-failed'],
    failed: ['payment-pending', 'payment-processing', 'payment-failed'],
    cancelled: ['payment-pending', 'payment-failed'],
    refunded: ['payment-success'],
  };
  const target: Record<PaymentTransition['kind'], { payment: string; order: string }> = {
    paid: { payment: 'payment-success', order: 'order-pending' },
    failed: { payment: 'payment-failed', order: 'order-pending' },
    cancelled: { payment: 'payment-failed', order: 'order-cancelled' },
    refunded: { payment: 'payment-refunded', order: 'order-refunded' },
  };
  const cases = (Object.keys(allowed) as PaymentTransition['kind'][]).flatMap((kind) => SITE_PAYMENT_STATUSES.map((from) => [kind, from] as const));

  it.each(cases)('%s from %s', async (kind, from) => {
    const repo = repoFor();
    const id = await seedApp({ payment_status: from, payment_intent: { id: 'pi_1', client_secret_redacted: true } });
    const result = await repo.applyPaymentTransition(id.toHexString(), { kind, paymentIntentId: 'pi_1' });
    const raw = await orders().findOne({ _id: id });
    expect(result).not.toBeNull();
    if (allowed[kind].includes(from)) {
      expect(raw).toMatchObject({ payment_status: target[kind].payment, order_status: target[kind].order, updated_at: NOW });
    } else {
      expect(raw?.payment_status).toBe(from);
      expect(raw?.order_status).toBe('order-pending');
    }
    // The returned order always reflects what is stored.
    expect(result?.sitePaymentStatus).toBe(raw?.payment_status);
  });

  it('a late payment_failed can never overwrite a success, and a paid order only moves to refunded', async () => {
    const repo = repoFor();
    const stored = await repo.insertPending(newOrder());
    const intent = { paymentIntentId: 'pi_1' };
    await repo.attachPaymentIntent(stored.orderId, 'pi_1');
    expect((await repo.applyPaymentTransition(stored.orderId, { kind: 'paid', ...intent }))?.paymentStatus).toBe('paid');
    expect((await repo.applyPaymentTransition(stored.orderId, { kind: 'failed', ...intent }))?.paymentStatus).toBe('paid');
    expect((await repo.applyPaymentTransition(stored.orderId, { kind: 'cancelled', ...intent }))?.paymentStatus).toBe('paid');
    const refunded = await repo.applyPaymentTransition(stored.orderId, { kind: 'refunded', ...intent });
    expect(refunded).toMatchObject({ paymentStatus: 'refunded', status: 'cancelled', siteOrderStatus: 'order-refunded' });
    expect((await repo.applyPaymentTransition(stored.orderId, { kind: 'paid', ...intent }))?.paymentStatus).toBe('refunded');
  });

  it('refuses to move an order with a different payment intent, accepts one with none stored', async () => {
    const repo = repoFor();
    const withIntent = await seedApp({ payment_intent: { id: 'pi_real', client_secret_redacted: true } });
    const result = await repo.applyPaymentTransition(withIntent.toHexString(), { kind: 'paid', paymentIntentId: 'pi_other' });
    expect(result?.paymentStatus).toBe('pending');
    const without = await seedApp();
    expect((await repo.applyPaymentTransition(without.toHexString(), { kind: 'paid', paymentIntentId: 'pi_new' }))?.paymentStatus).toBe('paid');
  });

  it('returns null for unknown orders and does not create anything', async () => {
    const repo = repoFor();
    expect(await repo.applyPaymentTransition(new ObjectId().toHexString(), { kind: 'paid', paymentIntentId: 'pi_1' })).toBeNull();
    expect(await orders().countDocuments({})).toBe(0);
  });

  it('is atomic: concurrent paid and failed always end paid', async () => {
    const repo = repoFor();
    for (let i = 0; i < 20; i += 1) {
      const id = (await seedApp({ payment_intent: { id: 'pi_1', client_secret_redacted: true } })).toHexString();
      await Promise.all([
        repo.applyPaymentTransition(id, { kind: 'failed', paymentIntentId: 'pi_1' }),
        repo.applyPaymentTransition(id, { kind: 'paid', paymentIntentId: 'pi_1' }),
        repo.applyPaymentTransition(id, { kind: 'failed', paymentIntentId: 'pi_1' }),
      ]);
      expect((await orders().findOne({ _id: new ObjectId(id) }))?.payment_status).toBe('payment-success');
    }
  });

  describe('PAID_ORDER_STATUS', () => {
    it('replaces order-pending only', async () => {
      const repo = repoFor(db, { PAID_ORDER_STATUS: 'order-processing' });
      const fresh = await seedApp();
      const advanced = await seedApp({ order_status: 'order-out-for-delivery' });
      expect((await repo.applyPaymentTransition(fresh.toHexString(), { kind: 'paid', paymentIntentId: 'pi_1' }))).toMatchObject({ siteOrderStatus: 'order-processing', status: 'preparing' });
      expect((await repo.applyPaymentTransition(advanced.toHexString(), { kind: 'paid', paymentIntentId: 'pi_1' }))).toMatchObject({ siteOrderStatus: 'order-out-for-delivery', paymentStatus: 'paid' });
    });

    it('defaults to leaving order-pending as it is, which reads as placed', async () => {
      const id = await seedApp();
      const result = await repoFor().applyPaymentTransition(id.toHexString(), { kind: 'paid', paymentIntentId: 'pi_1' });
      expect(result).toMatchObject({ siteOrderStatus: 'order-pending', status: 'placed' });
    });
  });
});

describe('the owner\'s website orders are never modified', () => {
  const kinds: PaymentTransition['kind'][] = ['paid', 'failed', 'cancelled', 'refunded'];
  const lookalikes: [string, Document][] = [
    ['no app_meta', {}],
    ['other source', { app_meta: { source: 'admin-import' } }],
    ['near-miss source', { app_meta: { source: 'mobile-app-2' } }],
    ['case differs', { app_meta: { source: 'Mobile-App' } }],
    ['source as object', { app_meta: { source: { $ne: 'x' } } }],
    ['flat key only', { 'app_meta.source': 'mobile-app-flat', source: 'mobile-app' }],
  ];

  it.each(lookalikes)('%s: no transition or intent change touches it', async (_label, extra) => {
    const repo = repoFor();
    for (const from of SITE_PAYMENT_STATUSES) {
      const id = await seedForeign({ payment_status: from, payment_intent: { id: 'pi_site' }, ...extra });
      const before = await orders().findOne({ _id: id });
      for (const kind of kinds) {
        const result = await repo.applyPaymentTransition(id.toHexString(), { kind, paymentIntentId: 'pi_site' });
        expect(result).toBeNull();
      }
      await expect(repo.attachPaymentIntent(id.toHexString(), 'pi_site')).rejects.toBeInstanceOf(NotFoundError);
      expect(await orders().findOne({ _id: id })).toEqual(before);
    }
  });

  it('a mixed collection: only the app order changes, nothing else is written or removed', async () => {
    const repo = repoFor();
    const foreignIds = await Promise.all([seedForeign(), seedForeign({ payment_status: 'payment-pending' }), seedForeign({ payment_status: 'payment-failed' })]);
    const app = await repo.insertPending(newOrder());
    const snapshot = async () => orders().find({ _id: { $in: foreignIds } }).sort({ _id: 1 }).toArray();
    const before = await snapshot();
    for (const kind of kinds) await repo.applyPaymentTransition(app.orderId, { kind, paymentIntentId: 'pi_1' });
    expect(await snapshot()).toEqual(before);
    expect(await orders().countDocuments({})).toBe(4);
  });
});

describe('findStalePending', () => {
  it('returns only app-created, payment-pending orders older than the cutoff, oldest first', async () => {
    const repo = repoFor();
    const old = new Date('2026-01-01T00:00:00Z');
    const older = new Date('2025-12-01T00:00:00Z');
    const a = await seedApp({ created_at: old });
    const b = await seedApp({ created_at: older });
    await seedApp({ created_at: old, payment_status: 'payment-success' });
    await seedApp({ created_at: old, payment_status: 'payment-failed' });
    await seedApp({ created_at: NOW });
    await seedForeign({ created_at: older, payment_status: 'payment-pending' });
    const stale = await repo.findStalePending(new Date('2026-02-01T00:00:00Z'), 10);
    expect(stale.map((o) => o.orderId)).toEqual([b.toHexString(), a.toHexString()]);
    expect(stale.every((o) => o.createdByApp && o.paymentStatus === 'pending')).toBe(true);
    expect(await repo.findStalePending(new Date('2026-02-01T00:00:00Z'), 1)).toHaveLength(1);
    expect(await repo.findStalePending(new Date('2020-01-01T00:00:00Z'), 10)).toEqual([]);
  });
});

describe('write safety, observed on the wire', () => {
  it('a full order lifecycle only uses insertOne, reads, and source-filtered updates', async () => {
    const calls: Call[] = [];
    const repo = repoFor(recording(db, calls));
    await seedForeign();
    const stored = await repo.insertPending(newOrder());
    await repo.findById(stored.orderId);
    await repo.findByOrderNumber(stored.orderNumber);
    await repo.attachPaymentIntent(stored.orderId, 'pi_1');
    for (const kind of ['failed', 'paid', 'refunded', 'cancelled'] as const) await repo.applyPaymentTransition(stored.orderId, { kind, paymentIntentId: 'pi_1' });
    await repo.applyPaymentTransition(new ObjectId().toHexString(), { kind: 'paid', paymentIntentId: 'pi_1' });
    await repo.findStalePending(NOW, 10);
    await repo.orderNumberExists('1');

    expect(new Set(calls.map((c) => c.collection))).toEqual(new Set(['orders']));
    const methods = new Set(calls.map((c) => c.method));
    expect([...methods].sort()).toEqual(['countDocuments', 'find', 'findOne', 'findOneAndUpdate', 'insertOne', 'updateOne']);
    const updates = calls.filter((c) => c.method === 'updateOne' || c.method === 'findOneAndUpdate');
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) expect(update.args[0]).toMatchObject({ 'app_meta.source': 'mobile-app', _id: expect.any(ObjectId) as unknown });
    const inserts = calls.filter((c) => c.method === 'insertOne');
    expect(inserts).toHaveLength(1);
    for (const insert of inserts) expect(insert.args[0]).toMatchObject({ app_meta: { source: 'mobile-app' } });
  });

  it('never creates an index on the owner\'s collection', async () => {
    const fresh = db.client.db('orders_no_index');
    const repo = repoFor(fresh);
    await repo.insertPending(newOrder());
    await repo.findByOrderNumber('123456789012');
    const indexes = await fresh.collection('orders').indexes();
    expect(indexes.map((i) => i.name)).toEqual(['_id_']);
    await fresh.dropDatabase();
  });

  it('no document is ever deleted', async () => {
    const repo = repoFor();
    const ids = [await seedForeign(), await seedApp()];
    const app = await repo.insertPending(newOrder());
    for (const kind of ['paid', 'refunded', 'cancelled', 'failed'] as const) await repo.applyPaymentTransition(app.orderId, { kind, paymentIntentId: 'pi_1' });
    expect(await orders().countDocuments({ _id: { $in: ids } })).toBe(2);
    expect(await orders().countDocuments({})).toBe(3);
  });
});

describe('idempotency store', () => {
  const KEY = 'a'.repeat(64);
  const record = { keyHash: KEY, requestHash: 'b'.repeat(64), response: { orderId: 'x', pricing: { totalPence: 3397 } }, status: 201, createdAt: new Date() };

  it('declares a unique key index and a 24h TTL', async () => {
    await ensureIndexes(db, [idempotencyIndexes]);
    await ensureIndexes(db, [idempotencyIndexes]);
    const byName = new Map((await db.collection('app_idempotency').indexes()).map((i) => [i.name, i]));
    expect(byName.get('keyHash_unique')).toMatchObject({ unique: true, key: { keyHash: 1 } });
    expect(byName.get('createdAt_ttl')).toMatchObject({ key: { createdAt: 1 }, expireAfterSeconds: 86_400 });
  });

  it('round-trips a record and returns false for a duplicate key', async () => {
    await ensureIndexes(db, [idempotencyIndexes]);
    const store = createMongoIdempotencyStore(db);
    expect(await store.find(KEY)).toBeNull();
    expect(await store.save(record)).toBe(true);
    expect(await store.save({ ...record, requestHash: 'c'.repeat(64) })).toBe(false);
    expect(await store.find(KEY)).toEqual(record);
  });

  it('lets exactly one of many racing saves win', async () => {
    await ensureIndexes(db, [idempotencyIndexes]);
    const store = createMongoIdempotencyStore(db);
    const results = await Promise.all(Array.from({ length: 15 }, () => store.save(record)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('answers operator payloads with null instead of a match', async () => {
    await ensureIndexes(db, [idempotencyIndexes]);
    const store = createMongoIdempotencyStore(db);
    await store.save(record);
    for (const payload of [{ $ne: '' }, { $regex: '.*' }, [KEY], '.*']) expect(await store.find(payload as unknown as string)).toBeNull();
  });
});

describe('orders routes against real MongoDB', () => {
  const post = (app: ReturnType<typeof buildOrdersApp>['app'], body: unknown, ip = '10.1.1.1') =>
    app.request('/v1/orders/lookup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body) });

  it('lookup then fetch, with a website order and a missing order indistinguishable from a bad contact', async () => {
    const repo = repoFor();
    const { app } = buildOrdersApp({ orders: repo });
    const mine = await repo.insertPending(newOrder());
    const site = await seedForeign({ tracking_number: '555000111222', customer_email: 'grace@example.com' });

    const ok = await post(app, { orderNumber: mine.orderNumber, phone: '07700 900123' });
    expect(ok.status).toBe(200);
    const { orderId, guestToken } = (await ok.json()) as { orderId: string; guestToken: string };
    expect(orderId).toBe(mine.orderId);

    const fetched = await app.request(`/v1/orders/${orderId}`, { headers: { authorization: `Bearer ${guestToken}` } });
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ orderNumber: mine.orderNumber, contact: { name: 'Ada Lovelace' } });

    const miss = await post(app, { orderNumber: '000000000009', email: 'x@y.co' });
    const wrong = await post(app, { orderNumber: mine.orderNumber, email: 'x@y.co' });
    const website = await post(app, { orderNumber: '555000111222', email: 'grace@example.com' });
    const texts = await Promise.all([miss, wrong, website].map(async (r) => ({ status: r.status, body: ((await r.json()) as { error: { code: string; message: string } }).error })));
    expect(texts.map((t) => t.status)).toEqual([404, 404, 404]);
    expect(texts.map((t) => [t.body.code, t.body.message])).toEqual([['not_found', 'Order not found'], ['not_found', 'Order not found'], ['not_found', 'Order not found']]);

    const siteToken = buildOrdersApp({ orders: repo }).guestTokens;
    expect(siteToken).toBeDefined();
    expect((await orders().findOne({ _id: site }))?.customer_email).toBe('grace@example.com');
  });

  it('injection payloads in the lookup body are rejected without reaching Mongo', async () => {
    const calls: Call[] = [];
    const repo = repoFor(recording(db, calls));
    const { app } = buildOrdersApp({ orders: repo });
    await repo.insertPending(newOrder());
    calls.length = 0;
    const payloads: unknown[] = [
      { orderNumber: { $ne: '' }, email: 'ada@example.com' },
      { orderNumber: '123456789012', email: { $ne: '' } },
      { orderNumber: '123456789012', phone: { $regex: '.*' } },
      { orderNumber: { $gt: '' }, phone: { $gt: '' } },
      { orderNumber: '123456789012', email: 'a@b.co', $or: [{}] },
    ];
    let ip = 0;
    for (const payload of payloads) expect((await post(app, payload, `10.2.2.${String(ip++)}`)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('a token for another order is 403 and an unknown order id is 404', async () => {
    const repo = repoFor();
    const { app, guestTokens } = buildOrdersApp({ orders: repo });
    const a = await repo.insertPending(newOrder());
    const b = await repo.insertPending(newOrder());
    const tokenForB = guestTokens.issue(b.orderId).token;
    expect((await app.request(`/v1/orders/${a.orderId}`, { headers: { authorization: `Bearer ${tokenForB}` } })).status).toBe(403);
    const ghost = new ObjectId().toHexString();
    expect((await app.request(`/v1/orders/${ghost}`, { headers: { authorization: `Bearer ${guestTokens.issue(ghost).token}` } })).status).toBe(404);
  });
});

describe('verify-schema against a real collection', () => {
  const reads = (calls: Call[]) => new Set(calls.map((c) => c.method));

  it('compares the newest website order, prints no customer data, and only reads', async () => {
    const calls: Call[] = [];
    const real = recording(db, calls);
    const repo = repoFor();
    await seedForeign({ invoice_no: 'INV-TOP-SECRET', customer_name: 'Grace Hopper', tracking_number: '987654321098' });
    await repo.insertPending(newOrder());
    calls.length = 0;
    const result = await verifyOrdersSchema(real.collection('orders'), NOW);
    expect(reads(calls)).toEqual(new Set(['find', 'countDocuments']));
    expect(result.exitCode).toBe(1);
    const text = result.lines.join('\n');
    expect(text).toMatch(/invoice_no\s+string\s+LOOKS REQUIRED/);
    expect(text).toMatch(/order_status[\s\S]*order-processing/);
    expect(text).toContain('Orders created by this app so far: 1');
    for (const secret of ['INV-TOP-SECRET', 'Grace Hopper', 'grace@example.com', '987654321098', '+447700900999', '9 Low Road', 'LS1 1AA', 'Ada Lovelace', '123456789012']) {
      expect(text).not.toContain(secret);
    }
    expect(await orders().countDocuments({})).toBe(2);
  });

  it('skips app orders when choosing the newest website order and exits 2 on an empty collection', async () => {
    const repo = repoFor();
    await repo.insertPending(newOrder());
    expect((await verifyOrdersSchema(orders(), NOW)).exitCode).toBe(2);
    expect((await verifyOrdersSchema(db.client.db('orders_empty').collection('orders'), NOW)).exitCode).toBe(2);
  });
});
