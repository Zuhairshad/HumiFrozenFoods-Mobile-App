import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { buildRuntime } from '../../src/bootstrap.js';
import { createProductionApp } from '../../src/composition.js';
import { ConfigError, loadConfig } from '../../src/config/env.js';
import { defaultIndexes } from '../../src/db/indexes.js';
import { closeDatabase } from '../../src/db/client.js';
import { expirePendingOrders } from '../../src/jobs/expire-pending.js';
import { assertClientIpConfigured } from '../../src/lib/client-ip.js';
import { MemoryRateLimitStore } from '../../src/lib/rate-limit-store.js';
import { testDeps } from '../unit/helpers.js';
import { buildHarness, freshIp, type Harness, type MongoFixture, NOW, seedProducts, startMongo, succeededEvent, walk } from './support.js';

let mongo: MongoFixture;
let h: Harness;

beforeAll(async () => {
  mongo = await startMongo();
  await seedProducts(mongo.db);
}, 120_000);
afterAll(async () => {
  await closeDatabase();
  await mongo.stop();
});

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const PROD_ENV = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/x',
  PUBLIC_API_BASE: 'https://api.example.com',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  GUEST_TOKEN_KEYS: `k1:${randomBytes(32).toString('base64url')}`,
};

describe('data exposure', () => {
  const FORBIDDEN_KEYS = ['b2b_pricing', 'sold_quantity', 'sku', '__v', 'paymentIntentId', 'payment_intent', 'client_secret', 'stock', 'visibility', 'createdByApp', 'siteOrderStatus', 'sitePaymentStatus', 'app_meta', '_id'];

  it('never leaks internal fields or secrets in any response of a full flow, and clientSecret appears only in the checkout response', async () => {
    h = buildHarness(mongo, { env: { ALLOWED_ORIGINS: 'https://app.example.com' } });
    const responses: { name: string; text: string; json: unknown }[] = [];
    const grab = async (name: string, res: Response) => {
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* non-json */ }
      responses.push({ name, text, json: parsed });
      return parsed as Record<string, unknown>;
    };
    await grab('config', await h.call('/v1/config'));
    await grab('products', await h.call('/v1/products?limit=100'));
    await grab('product', await h.call('/v1/products/aloo-tikki'));
    await grab('collections', await h.call('/v1/collections'));
    await grab('quote', await h.call('/v1/checkout/quote', json({ lines: [{ productId: 'aloo-tikki', quantity: 2 }], promoCode: 'HUMI15' })));
    const placed = await h.placeOrder();
    const order = await grab('order', await h.call(`/v1/orders/${placed.orderId}`, { headers: { authorization: `Bearer ${placed.guestToken}` } }));
    await grab('lookup', await h.call('/v1/orders/lookup', json({ orderNumber: placed.orderNumber, email: 'asha@example.com' })));
    await grab('enquiry', await h.call('/v1/enquiries', json({ type: 'contact', name: 'Al', email: 'a@example.com', message: 'hello there friend' })));
    await grab('version', await h.call('/v1/version'));
    await grab('health', await h.call('/healthz'));
    await grab('ready', await h.call('/readyz'));
    await grab('404', await h.call('/v1/nothing'));
    await grab('401', await h.call(`/v1/orders/${placed.orderId}`));
    expect(order['orderId']).toBe(placed.orderId);

    for (const r of responses) {
      walk(r.json, (key, _leaf, path) => {
        if (key === null) return;
        expect(FORBIDDEN_KEYS, `${r.name} ${path}`).not.toContain(key);
        if (r.name !== 'quote' && r.name !== 'order' && r.name !== 'lookup') expect(key, `${r.name} ${path}`).not.toBe('quantity');
        expect(key, `${r.name} ${path}`).not.toMatch(/client_?secret/i);
      });
      expect(r.text, r.name).not.toMatch(/pi_fake_|_secret_|mongodb(\+srv)?:\/\/|sk_(test|live)|whsec_|node_modules|at .*\(.*:\d+:\d+\)|MongoServerError/);
    }
    const livePrices = JSON.stringify(responses.find((r) => r.name === 'products')?.json);
    expect(livePrices).not.toContain('"b2b_');
    expect(JSON.stringify(order)).not.toContain(placed.clientSecret);
  });

  it('error envelopes are opaque in production: no driver messages, stacks or connection strings', async () => {
    const prodHarness = buildHarness(mongo, { env: { ...PROD_ENV, MONGODB_URI: mongo.server.getUri() } });
    prodHarness.deps.orders.insertPending = () => Promise.reject(new Error('MongoServerError: auth failed mongodb://admin:hunter2@cluster0.example.net'));
    const res = await prodHarness.call('/v1/checkout/payment-intent', json(prodHarness.checkoutBody(), { 'idempotency-key': crypto.randomUUID() }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/hunter2|mongodb|MongoServerError|stack| at /);
    expect(JSON.parse(text)).toMatchObject({ error: { code: 'internal_error' } });
    // the secret must not reach logs of other fields either: it is the error message itself, so it is logged (documented), but never echoed.
  });

  it('readyz hides the driver error when the database is down', async () => {
    const app = createApp(testDeps({ database: { ping: () => Promise.reject(new Error('mongodb://u:p@h failed')) } }));
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/mongodb|u:p/);
  });
});

describe('security headers, CORS and caching', () => {
  it('sets hardening headers on success, error and 404 responses; only catalogue reads are public-cacheable', async () => {
    const placed = await h.placeOrder();
    const cases: [string, Response][] = [
      ['products', await h.call('/v1/products')],
      ['404', await h.call('/v1/nope')],
      ['401', await h.call(`/v1/orders/${placed.orderId}`)],
      ['400', await h.call('/v1/products?x=1')],
      ['order', await h.call(`/v1/orders/${placed.orderId}`, { headers: { authorization: `Bearer ${placed.guestToken}` } })],
      ['healthz', await h.call('/healthz')],
    ];
    for (const [name, res] of cases) {
      expect(res.headers.get('strict-transport-security'), name).toContain('max-age');
      expect(res.headers.get('x-content-type-options'), name).toBe('nosniff');
      expect(res.headers.get('x-frame-options'), name).toBe('DENY');
      expect(res.headers.get('referrer-policy'), name).toBe('no-referrer');
      expect(res.headers.get('content-security-policy'), name).toContain("default-src 'none'");
      expect(res.headers.get('x-powered-by'), name).toBeNull();
      if (name !== 'products') expect(res.headers.get('cache-control'), name).toMatch(/no-store/);
    }
    expect(cases[0]?.[1].headers.get('cache-control')).toMatch(/^public/);
  });

  it('CORS: only exact allow-listed origins get headers; others cannot write', async () => {
    const cors = buildHarness(mongo, { env: { ALLOWED_ORIGINS: 'https://app.example.com' } });
    const withOrigin = (origin: string, init: RequestInit = {}) => cors.call('/v1/products', { ...init, headers: { origin, ...(init.headers as Record<string, string> | undefined) } });
    const ok = await withOrigin('https://app.example.com');
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
    expect(ok.headers.get('access-control-allow-credentials')).toBeNull();
    for (const origin of ['https://evil.example', 'null', 'https://app.example.com.evil.example', 'http://app.example.com', 'https://APP.example.com', 'https://app.example.com:444']) {
      const res = await withOrigin(origin);
      expect(res.headers.get('access-control-allow-origin'), origin).toBeNull();
      const write = await cors.call('/v1/checkout/quote', { ...json({ lines: [] }), headers: { origin, 'content-type': 'application/json' } });
      expect(write.status, origin).toBe(403);
      const pre = await cors.call('/v1/checkout/quote', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
      expect(pre.headers.get('access-control-allow-origin'), origin).toBeNull();
    }
    const star = await cors.call('/v1/products', { headers: { origin: '*' } });
    expect(star.headers.get('access-control-allow-origin')).toBeNull();
    const none = buildHarness(mongo);
    expect((await none.call('/v1/products', { headers: { origin: 'https://app.example.com' } })).headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('logs never contain secrets or personal data', () => {
  it('feeds canaries through every route and finds none in the captured trace-level logs', async () => {
    const canary = {
      name: 'CANARYNAME Zed', email: 'canary.email@example.com', phone: '07999 123456', line1: 'CANARYSTREET', city: 'CANARYCITY',
      notes: 'CANARYNOTES', message: 'CANARYMESSAGE for the enquiry', stripeKey: 'sk_test_CANARYSTRIPEKEY', whsec: 'whsec_CANARYWEBHOOK', mongoPw: 'CANARYMONGOPW',
    };
    const keyMaterial = randomBytes(32).toString('base64url');
    const l = buildHarness(mongo, {
      env: { STRIPE_SECRET_KEY: canary.stripeKey, STRIPE_WEBHOOK_SECRET: canary.whsec, MONGODB_URI: `mongodb://u:${canary.mongoPw}@127.0.0.1/x`, GUEST_TOKEN_KEYS: `k9:${keyMaterial}` },
    });
    const key = crypto.randomUUID();
    const placed = await l.placeOrder({
      contact: { name: canary.name, email: canary.email, phone: canary.phone },
      address: { line1: canary.line1, city: canary.city, postcode: 'SW1A 1AA' },
      notes: canary.notes,
    }, key);
    await l.call('/v1/checkout/payment-intent', json(l.checkoutBody({ contact: { name: canary.name, email: canary.email, phone: canary.phone } }), { 'idempotency-key': key }));
    await l.call(`/v1/orders/${placed.orderId}`, { headers: { authorization: `Bearer ${placed.guestToken}` } });
    await l.call(`/v1/orders/${placed.orderId}`, { headers: { authorization: `Bearer ${placed.guestToken}x` } });
    await l.call('/v1/orders/lookup', json({ orderNumber: placed.orderNumber, email: canary.email }));
    await l.call('/v1/orders/lookup', json({ orderNumber: placed.orderNumber, email: 'nope@example.com' }));
    await l.call('/v1/enquiries', json({ type: 'contact', name: canary.name, email: canary.email, message: canary.message }));
    await l.call('/v1/enquiries', json({ type: 'contact', name: canary.name, email: canary.email, message: canary.message, website: 'bot' }));
    await l.call('/v1/checkout/payment-intent', json({ ...l.checkoutBody(), contact: { name: canary.name, email: 'bad', phone: canary.phone } }, { 'idempotency-key': key }));
    const pi = (await mongo.db.collection('orders').findOne({ _id: new ObjectId(placed.orderId) }))?.['payment_intent'] as { id: string };
    const raw = JSON.stringify(succeededEvent('evt_log_1', placed, pi.id, { amount: 1 }));
    const sig = l.sign(raw);
    await l.call('/v1/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body: raw });
    await l.call('/v1/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, body: raw });
    await expirePendingOrders({ ...l.deps, clock: { now: () => new Date(NOW.getTime() + 86_400_000) } });
    l.deps.orders.insertPending = () => Promise.reject(new Error('boom'));
    await l.call('/v1/checkout/payment-intent', json(l.checkoutBody(), { 'idempotency-key': crypto.randomUUID() }));

    const logs = l.logs.text();
    expect(logs.length).toBeGreaterThan(500);
    for (const secret of [canary.name, 'CANARYNAME', canary.email, '07999 123456', '07999123456', canary.line1, canary.city, canary.notes, canary.message, canary.stripeKey, canary.whsec, canary.mongoPw, keyMaterial, placed.guestToken, placed.clientSecret, key, 'bad', sig]) {
      if (secret === 'bad') continue;
      expect(logs, secret).not.toContain(secret);
    }
  });
});

describe('abuse resistance', () => {
  it('ignores X-Forwarded-For for rate limiting unless TRUSTED_IP_HEADER names it', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 125; i += 1) {
      statuses.push((await h.call('/v1/version', { headers: { 'x-forwarded-for': `1.2.3.${String(i)}`, 'x-real-ip': `9.9.9.${String(i)}` } }, ip)).status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);

    const trusting = buildHarness(mongo, { env: { TRUSTED_IP_HEADER: 'x-real-ip' } });
    const a: number[] = [];
    for (let i = 0; i < 125; i += 1) {
      a.push((await trusting.call('/v1/version', { headers: { 'x-forwarded-for': '5.5.5.5', 'x-real-ip': '7.7.7.7' } }, freshIp())).status);
    }
    expect(a.filter((s) => s === 429).length).toBeGreaterThan(0); // keyed on x-real-ip, not on the rotating sockets
    const b = await trusting.call('/v1/version', { headers: { 'x-real-ip': '8.8.8.8' } }, freshIp());
    expect(b.status).toBe(200);
  });

  it('refuses to run serverless in production without a trusted IP header (otherwise every client shares one bucket)', () => {
    expect(() => { assertClientIpConfigured(loadConfig(PROD_ENV)); }).toThrow(ConfigError);
    expect(() => { assertClientIpConfigured(loadConfig({ ...PROD_ENV, TRUSTED_IP_HEADER: 'x-real-ip' })); }).not.toThrow();
    expect(() => { assertClientIpConfigured(loadConfig({ NODE_ENV: 'test', MONGODB_URI: PROD_ENV.MONGODB_URI })); }).not.toThrow();
  });

  it('without a socket address or trusted header all callers share one bucket (why the guard above exists)', async () => {
    const app = createApp(testDeps());
    for (let i = 0; i < 125; i += 1) await app.request('/v1/x');
    expect((await app.request('/v1/x')).status).toBe(429);
  });

  it('bounds the in-memory rate limit store', async () => {
    const store = new MemoryRateLimitStore({ maxKeys: 100 });
    for (let i = 0; i < 5000; i += 1) await store.hit(`k${String(i)}`, 60_000);
    // the oldest keys were evicted (counter restarts at 1), recent ones remain counted
    expect((await store.hit('k0', 60_000)).count).toBe(1);
    expect((await store.hit('k4999', 60_000)).count).toBe(2);
  });

  it('times out a stalled handler and a request body that never finishes', async () => {
    const t = buildHarness(mongo, { env: { REQUEST_TIMEOUT_MS: '150' } });
    t.deps.pricing.quote = () => new Promise(() => undefined);
    const started = performance.now();
    const res = await t.call('/v1/checkout/quote', json({ lines: [] }));
    expect(res.status).toBe(504);
    expect(performance.now() - started).toBeLessThan(2000);
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('{"lines":')); } });
    const slow = await t.call('/v1/enquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' });
    expect(slow.status).toBe(504);
  });

  it('refuses oversized and chunked oversized bodies on checkout', async () => {
    const big = JSON.stringify({ lines: [], pad: 'x'.repeat(110_000) });
    expect((await h.call('/v1/checkout/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: big })).status).toBe(413);
    const chunk = new TextEncoder().encode('x'.repeat(40_000));
    let n = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (n >= 4) { c.close(); return; } n += 1; c.enqueue(chunk); } });
    const res = await h.call('/v1/checkout/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' });
    expect(res.status).toBe(413);
  });

  it('spends no Stripe calls on replays, validation failures or business rejections', async () => {
    const before = h.gateway.intents.size;
    const key = crypto.randomUUID();
    await h.placeOrder(undefined, key);
    expect(h.gateway.intents.size).toBe(before + 1);
    await h.placeOrder(undefined, key);
    await h.placeOrder({ promoCode: 'NOPE' });
    await h.placeOrder({ lines: [] });
    expect(h.gateway.intents.size).toBe(before + 1);
  });

  it('limits enquiries to 5 per hour per IP and does not store duplicates', async () => {
    const ip = freshIp();
    const body = { type: 'contact', name: 'Spam Bot', email: 'spam@example.com', message: 'buy cheap things now' };
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await h.call('/v1/enquiries', json({ ...body, message: `${body.message} ${String(i)}` }), ip)).status);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429, 429]);
  });
});

describe('MongoDB write allow-list and bounded reads', () => {
  it('only inserts orders, only updates app-created orders, never deletes or changes schema, across a full flow', async () => {
    const w = buildHarness(mongo);
    mongo.commands.length = 0;
    const a = await w.placeOrder();
    const key = crypto.randomUUID();
    await w.placeOrder(undefined, key);
    await w.placeOrder(undefined, key);
    const raceKey = crypto.randomUUID();
    await Promise.all(Array.from({ length: 4 }, () => w.placeOrder(undefined, raceKey, freshIp())));
    const pi = (await w.orders.findOne({ _id: new ObjectId(a.orderId) }))?.['payment_intent'] as { id: string };
    const total = (a.body['pricing'] as { totalPence: number }).totalPence;
    await w.webhook(succeededEvent('evt_w_1', a, pi.id, { amount: total }));
    const meta = { orderId: a.orderId, source: 'humi-mobile-app' };
    await w.webhook({ id: 'evt_w_2', type: 'payment_intent.payment_failed', data: { object: { id: pi.id, metadata: meta } } });
    await w.webhook({ id: 'evt_w_3', type: 'charge.refunded', data: { object: { amount: 5, amount_refunded: 5, payment_intent: pi.id, metadata: meta } } });
    await w.call('/v1/orders/lookup', json({ orderNumber: a.orderNumber, email: 'asha@example.com' }));
    await w.call('/v1/enquiries', json({ type: 'contact', name: 'Al', email: 'a@example.com', message: 'hello there friend' }));
    await w.call('/v1/products?q=chicken&collection=kebabs');
    await w.call('/v1/collections');
    await w.call('/readyz');
    await w.orders.insertOne({ tracking_number: '202020202020', order_status: 'order-pending', payment_status: 'payment-pending', created_at: new Date(0) });
    await expirePendingOrders({ ...w.deps, clock: { now: () => new Date(NOW.getTime() + 86_400_000) } });

    const seen = new Set(mongo.commands.map((c) => c.commandName));
    const ALLOWED = new Set(['find', 'insert', 'update', 'findAndModify', 'aggregate', 'getMore', 'ping', 'hello', 'isMaster', 'endSessions', 'killCursors', 'saslStart', 'saslContinue', 'buildInfo']);
    for (const name of seen) expect(ALLOWED.has(name), `unexpected command ${name}`).toBe(true);
    const ours = mongo.commands.filter((c) => c.databaseName === 'security_test');
    const OWN = new Set(['app_idempotency', 'webhook_events', 'app_enquiries']);
    let ordersInserts = 0;
    for (const c of ours) {
      const coll = String(c.command[c.commandName]);
      if (c.commandName === 'insert') {
        if (coll === 'orders') {
          for (const d of c.command['documents'] as { app_meta?: { source?: string }; tracking_number: string }[]) {
            if (d.tracking_number === '202020202020') continue; // the test's own seeded website order
            ordersInserts += 1;
            expect(d.app_meta?.source).toBe('mobile-app');
          }
        } else expect(OWN.has(coll), `insert into ${coll}`).toBe(true);
      }
      if ((c.commandName === 'update' || c.commandName === 'findAndModify') && coll === 'app_idempotency') continue;
      if (c.commandName === 'update') {
        expect(coll).toBe('orders');
        for (const u of c.command['updates'] as { q: Record<string, unknown> }[]) expect(u.q['app_meta.source']).toBe('mobile-app');
      }
      if (c.commandName === 'findAndModify') {
        expect(coll).toBe('orders');
        expect((c.command['query'] as Record<string, unknown>)['app_meta.source']).toBe('mobile-app');
      }
      if (c.commandName === 'aggregate') {
        expect(JSON.stringify(c.command['pipeline'])).not.toMatch(/\$out|\$merge/);
      }
      expect(coll, 'products is read-only').not.toBe(c.commandName === 'find' || c.commandName === 'aggregate' ? '__none__' : 'products');
    }
    expect(ordersInserts).toBeGreaterThanOrEqual(3);
    expect(seen.has('update') || seen.has('findAndModify')).toBe(true);
  });

  it('gives every read of the shared orders and products collections a maxTimeMS', async () => {
    const w = buildHarness(mongo);
    mongo.commands.length = 0;
    const a = await w.placeOrder();
    await w.call('/v1/orders/lookup', json({ orderNumber: a.orderNumber, email: 'asha@example.com' }));
    await w.call(`/v1/orders/${a.orderId}`, { headers: { authorization: `Bearer ${a.guestToken}` } });
    await w.call('/v1/products');
    await expirePendingOrders({ ...w.deps, clock: { now: () => new Date(NOW.getTime() + 86_400_000) } });
    const reads = mongo.commands.filter((c) => ['find', 'aggregate'].includes(c.commandName) && ['orders', 'products'].includes(String(c.command[c.commandName])));
    expect(reads.length).toBeGreaterThan(4);
    for (const c of reads) expect(c.command['maxTimeMS'], `${c.commandName} ${String(c.command[c.commandName])} ${JSON.stringify(c.command['filter'] ?? c.command['pipeline'])}`).toBeGreaterThan(0);
  });

  it('index management only ever touches the three collections the API owns', () => {
    expect(defaultIndexes.map((s) => s.collection).sort()).toEqual(['app_enquiries', 'app_idempotency', 'webhook_events']);
  });
});

describe('production safety', () => {
  it('fails closed with no Stripe configuration: 503, no order written, webhook refused, config says payments disabled', async () => {
    const runtime = buildRuntime(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', MONGODB_URI: mongo.server.getUri(), MONGODB_DB: 'security_prod' }));
    const app = createProductionApp(runtime);
    const before = await mongo.client.db('security_prod').collection('orders').countDocuments({});
    const ip = { incoming: { socket: { remoteAddress: freshIp() } } };
    const res = await app.request('/v1/checkout/payment-intent', json({ lines: [{ productId: 'aloo-tikki', quantity: 1 }], contact: { name: 'Al', email: 'a@example.com', phone: '07123 456789' }, address: { line1: '1 St', city: 'X', postcode: 'SW1A 1AA' }, slot: { date: '2026-10-27', window: 'morning' } }, { 'idempotency-key': crypto.randomUUID() }), ip);
    expect(res.status).toBe(503);
    expect(await mongo.client.db('security_prod').collection('orders').countDocuments({})).toBe(before);
    expect((await app.request('/v1/webhooks/stripe', json({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: {} } }, { 'stripe-signature': 't=1,v1=00' }), ip)).status).toBe(400);
    const cfg = (await (await app.request('/v1/config', {}, ip)).json()) as { payments: { enabled: boolean } };
    expect(cfg.payments.enabled).toBe(false);
  });

  it('production config refuses to start without Stripe, token keys or a public base, and never echoes values', () => {
    for (const drop of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'GUEST_TOKEN_KEYS', 'PUBLIC_API_BASE']) {
      const env = Object.fromEntries(Object.entries(PROD_ENV).filter(([k]) => k !== drop));
      expect(() => loadConfig(env), drop).toThrow(new RegExp(drop));
    }
    expect(() => loadConfig({ ...PROD_ENV, STRIPE_SECRET_KEY: 'pk_live_SECRETVALUE' })).toThrow(/STRIPE_SECRET_KEY/);
    try { loadConfig({ ...PROD_ENV, STRIPE_SECRET_KEY: 'pk_live_SECRETVALUE' }); } catch (e) { expect(String(e)).not.toContain('SECRETVALUE'); }
  });

  it('treats a Vercel production deployment as production even when NODE_ENV is missing or wrong', () => {
    const env = { MONGODB_URI: PROD_ENV.MONGODB_URI, VERCEL_ENV: 'production' };
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig({ ...env, NODE_ENV: 'development' })).toThrow(ConfigError);
    expect(loadConfig({ ...PROD_ENV, VERCEL_ENV: 'production' }).isProduction).toBe(true);
    expect(loadConfig({ MONGODB_URI: PROD_ENV.MONGODB_URI, VERCEL_ENV: 'preview' }).isProduction).toBe(false);
  });

  it('keeps dev-only code (fake gateway, dev mock server) out of the production import graph', () => {
    const root = new URL('../../src/', import.meta.url).pathname;
    const files: string[] = [];
    const walkDir = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walkDir(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walkDir(root);
    const importers = files.filter((f) => /fake-gateway|dev-mock-server/.test(readFileSync(f, 'utf8').split('\n').filter((l) => /^\s*(import|export)\b.*from/.test(l)).join('\n')));
    expect(importers.map((f) => f.slice(root.length)).filter((f) => !f.startsWith('scripts/dev-mock-server') && f !== 'payments/fake-gateway.ts')).toEqual([]);
    const prodEntries = ['composition.ts', 'bootstrap.ts', 'vercel.ts', 'index.ts'].map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
    expect(prodEntries).not.toMatch(/fake-gateway|dev-mock|createFakeGateway/);
  });
});
