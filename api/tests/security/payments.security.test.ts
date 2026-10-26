import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expirePendingOrders } from '../../src/jobs/expire-pending.js';
import { buildHarness, freshIp, type Harness, type MongoFixture, NOW, seedProducts, startMongo, succeededEvent } from './support.js';

let mongo: MongoFixture;
let h: Harness;

beforeAll(async () => {
  mongo = await startMongo();
  await seedProducts(mongo.db);
  h = buildHarness(mongo);
}, 120_000);

afterAll(async () => {
  await mongo.stop();
});

const post = (body: unknown, headers: Record<string, string>, ip?: string) =>
  h.call('/v1/checkout/payment-intent', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }, ip);
const uuid = (): string => crypto.randomUUID();
const intentOf = async (orderId: string): Promise<string> => {
  const doc = await h.orders.findOne({ _id: new ObjectId(orderId) });
  return (doc?.['payment_intent'] as { id: string }).id;
};
const state = async (orderId: string) => {
  const doc = await h.orders.findOne({ _id: new ObjectId(orderId) });
  return { order: doc?.['order_status'] as string, payment: doc?.['payment_status'] as string, updated: doc?.['updated_at'] as Date };
};
const totalOf = (placed: { body: Record<string, unknown> }): number => (placed.body['pricing'] as { totalPence: number }).totalPence;

describe('idempotency keys', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a uuid', 'abc'],
    ['uuid v1', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
    ['wrong variant', '6ba7b810-9dad-41d1-c0b4-00c04fd430c8'],
    ['uuid plus suffix', `${uuid()}x`],
    ['trailing junk', `${uuid()}-`],
    ['very long', 'a'.repeat(5000)],
    ['sql-ish', "' OR 1=1 --"],
  ])('rejects a %s key and creates nothing', async (_name, value) => {
    const before = await h.orders.countDocuments({});
    const res = await post(h.checkoutBody(), value === undefined ? {} : { 'idempotency-key': value });
    expect(res.status).toBe(400);
    expect(await h.orders.countDocuments({})).toBe(before);
  });

  it('replays the same response for same key and same body, with a fresh token and no second order', async () => {
    const key = uuid();
    const first = await h.placeOrder(undefined, key);
    const orders = await h.orders.countDocuments({});
    const res = await post(h.checkoutBody(), { 'idempotency-key': key.toUpperCase() });
    expect(res.status).toBe(200);
    expect(res.headers.get('idempotent-replay')).toBe('true');
    const replay = (await res.json()) as { orderId: string; orderNumber: string; clientSecret: string; guestToken: string };
    expect(replay.orderId).toBe(first.orderId);
    expect(replay.clientSecret).toBe(first.clientSecret);
    expect(await h.orders.countDocuments({})).toBe(orders);
    // key order inside the JSON must not matter
    const reordered = { slot: h.checkoutBody()['slot'], address: h.checkoutBody()['address'], contact: h.checkoutBody()['contact'], lines: h.checkoutBody()['lines'] };
    const again = await post(reordered, { 'idempotency-key': key });
    expect(again.status).toBe(200);
  });

  it('does not hand another customer an earlier order: same key with a different body is a bare 409', async () => {
    const key = uuid();
    const victim = await h.placeOrder({ contact: { name: 'Victim Vera', email: 'vera@example.com', phone: '07000 111222' } }, key);
    const attacker = await post(
      h.checkoutBody({ contact: { name: 'Mallory', email: 'mallory@example.com', phone: '07000 333444' } }),
      { 'idempotency-key': key },
    );
    expect(attacker.status).toBe(409);
    const text = await attacker.text();
    expect(text).toContain('idempotency_key_reuse');
    for (const secret of [victim.orderId, victim.orderNumber, victim.guestToken, victim.clientSecret, 'vera@example.com', 'Vera']) {
      expect(text).not.toContain(secret);
    }
  });

  it('only replays credentials to a caller who knows the key AND the exact request body', async () => {
    const key = uuid();
    const placed = await h.placeOrder(undefined, key);
    const variants = [
      h.checkoutBody({ lines: [{ productId: 'chicken-samosa-large', quantity: 3 }] }),
      h.checkoutBody({ notes: 'x' }),
      h.checkoutBody({ promoCode: 'HUMI15' }),
      h.checkoutBody({ slot: { date: '2026-10-28', window: 'afternoon' } }),
    ];
    for (const body of variants) {
      const res = await post(body, { 'idempotency-key': key });
      expect(res.status).toBe(409);
      expect(await res.text()).not.toContain(placed.clientSecret);
    }
  });

  it('does not store the raw key or the client secret on the order document', async () => {
    const key = uuid();
    const placed = await h.placeOrder(undefined, key);
    const doc = JSON.stringify(await h.orders.findOne({ _id: new ObjectId(placed.orderId) }));
    expect(doc).not.toContain(key);
    expect(doc).not.toContain(placed.clientSecret);
    expect(doc).not.toContain('secret_fake');
  });

  it('answers 409 checkout_expired (not stale credentials) once the order was cancelled', async () => {
    const key = uuid();
    const placed = await h.placeOrder(undefined, key);
    await expirePendingOrders({ ...h.deps, clock: { now: () => new Date(NOW.getTime() + 24 * 3600_000) } });
    const res = await post(h.checkoutBody(), { 'idempotency-key': key });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('checkout_expired');
    expect((await state(placed.orderId)).order).toBe('order-cancelled');
  });
});

describe('races', () => {
  it('collapses 12 parallel identical requests into one live order and one live PaymentIntent', async () => {
    const key = uuid();
    const body = h.checkoutBody({ contact: { name: 'Racer One', email: 'racer1@example.com', phone: '07000 555001' } });
    const responses = await Promise.all(Array.from({ length: 12 }, () => post(body, { 'idempotency-key': key }, freshIp())));
    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.every((s) => s === 200 || s === 201)).toBe(true);
    expect(statuses.filter((s) => s === 201).length).toBe(1);
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as { orderId: string; clientSecret: string }[];
    expect(new Set(bodies.map((b) => b.orderId)).size).toBe(1);
    expect(new Set(bodies.map((b) => b.clientSecret)).size).toBe(1);

    const docs = await h.orders.find({ customer_email: 'racer1@example.com' }).toArray();
    const live = docs.filter((d) => d['order_status'] !== 'order-cancelled');
    expect(live).toHaveLength(1);
    expect(String(live[0]?.['_id'])).toBe(bodies[0]?.orderId);
    // every loser's PaymentIntent was cancelled; exactly one stays payable
    const payable = [...h.gateway.intents.values()].filter((i) => i.receiptEmail === 'racer1@example.com' && i.status !== 'canceled');
    expect(payable).toHaveLength(1);
  });

  it('lets only one of 8 parallel requests with the same key but different bodies create an order', async () => {
    const key = uuid();
    const responses = await Promise.all(
      Array.from({ length: 8 }, (_v, i) =>
        post(h.checkoutBody({ contact: { name: 'Racer Two', email: `racer2-${String(i)}@example.com`, phone: '07000 555002' } }), { 'idempotency-key': key }, freshIp()),
      ),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    const docs = await h.orders.find({ customer_email: { $regex: '^racer2-' } }).toArray();
    expect(docs.filter((d) => d['order_status'] !== 'order-cancelled')).toHaveLength(1);
    const payable = [...h.gateway.intents.values()].filter((i) => i.receiptEmail.startsWith('racer2-') && i.status !== 'canceled');
    expect(payable).toHaveLength(1);
  });

  it('gives 15 parallel requests with different keys 15 distinct orders and order numbers', async () => {
    const placed = await Promise.all(Array.from({ length: 15 }, () => h.placeOrder()));
    expect(placed.every((p) => p.status === 201)).toBe(true);
    expect(new Set(placed.map((p) => p.orderNumber)).size).toBe(15);
    expect(new Set(placed.map((p) => p.orderId)).size).toBe(15);
  });

  it('applies 12 parallel copies of one succeeded event once and reports the rest as duplicates', async () => {
    const placed = await h.placeOrder();
    const event = succeededEvent(`evt_${uuid()}`, placed, await intentOf(placed.orderId), { amount: totalOf(placed) });
    const results = await Promise.all(Array.from({ length: 12 }, () => h.webhook(event, freshIp())));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const outcomes = (await Promise.all(results.map((r) => r.json()))) as { outcome: string }[];
    expect(outcomes.filter((o) => o.outcome === 'applied')).toHaveLength(1);
    expect(outcomes.filter((o) => o.outcome === 'duplicate')).toHaveLength(11);
    expect((await state(placed.orderId)).payment).toBe('payment-success');
  });
});

describe('Stripe webhook authenticity', () => {
  const raw = (event: unknown): string => JSON.stringify(event);
  const send = (body: string, headers: Record<string, string>, ip?: string) =>
    h.call('/v1/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body }, ip);
  let placed: Awaited<ReturnType<Harness['placeOrder']>>;
  let intent: string;
  let event: Record<string, unknown>;

  beforeAll(async () => {
    placed = await h.placeOrder();
    intent = await intentOf(placed.orderId);
    event = succeededEvent('evt_auth_1', placed, intent, { amount: totalOf(placed) });
  });

  it.each([
    ['no signature header', () => ({})],
    ['empty signature', () => ({ 'stripe-signature': '' })],
    ['garbage', () => ({ 'stripe-signature': 'garbage' })],
    ['t only', () => ({ 'stripe-signature': 't=1' })],
    ['v1 only', () => ({ 'stripe-signature': 'v1=abcd' })],
    ['empty parts', () => ({ 'stripe-signature': 't=,v1=' })],
    ['non-numeric timestamp', () => ({ 'stripe-signature': 't=abc,v1=00' })],
    ['wrong secret (zero mac)', () => ({ 'stripe-signature': `t=${String(Math.floor(NOW.getTime() / 1000))},v1=${'0'.repeat(64)}` })],
    ['10 KB header', () => ({ 'stripe-signature': 'a'.repeat(10_000) })],
    ['signature for a different body', () => ({ 'stripe-signature': h.sign(raw({ ...event, id: 'other' })) })],
    ['timestamp 301 s old', () => ({ 'stripe-signature': h.sign(raw(event), Math.floor(NOW.getTime() / 1000) - 301) })],
    ['timestamp a year old', () => ({ 'stripe-signature': h.sign(raw(event), Math.floor(NOW.getTime() / 1000) - 31_536_000) })],
  ])('rejects %s with 400 and processes nothing', async (_name, headers) => {
    const res = await send(raw(event), headers());
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_signature');
    expect((await state(placed.orderId)).payment).toBe('payment-pending');
  });

  it('rejects a body that differs by one byte or by whitespace from the signed bytes', async () => {
    const signed = h.sign(raw(event));
    expect((await send(raw(event) + ' ', { 'stripe-signature': signed })).status).toBe(400);
    expect((await send(JSON.stringify(event, null, 2), { 'stripe-signature': signed })).status).toBe(400);
    expect((await send(raw(event).replace('evt_auth_1', 'evt_auth_2'), { 'stripe-signature': signed })).status).toBe(400);
    expect((await state(placed.orderId)).payment).toBe('payment-pending');
  });

  it('refuses oversized bodies, including chunked bodies with no Content-Length', async () => {
    const big = 'x'.repeat(200_000);
    expect((await send(big, { 'stripe-signature': h.sign(big) })).status).toBe(413);
    const chunk = new TextEncoder().encode('y'.repeat(50_000));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 6) { controller.close(); return; }
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const res = await h.call('/v1/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=00' },
      body: stream,
      duplex: 'half',
    });
    expect(res.status).toBe(413);
  });

  it('refuses non-POST methods and non-JSON content types', async () => {
    expect((await h.call('/v1/webhooks/stripe')).status).toBe(405);
    expect((await h.call('/v1/webhooks/stripe', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(405);
    const res = await h.call('/v1/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'text/plain', 'stripe-signature': h.sign(raw(event)) }, body: raw(event) });
    expect(res.status).toBe(415);
  });

  it('accepts the genuinely signed event exactly once, and a replay changes nothing', async () => {
    const first = await send(raw(event), { 'stripe-signature': h.sign(raw(event)) });
    expect(((await first.json()) as { outcome: string }).outcome).toBe('applied');
    const before = await state(placed.orderId);
    expect(before.payment).toBe('payment-success');
    const replay = await send(raw(event), { 'stripe-signature': h.sign(raw(event)) });
    expect(((await replay.json()) as { outcome: string }).outcome).toBe('duplicate');
    const after = await state(placed.orderId);
    expect(after.updated.getTime()).toBe(before.updated.getTime());
  });
});

describe('webhook logic does not trust anything but a verified event for our own, matching order', () => {
  async function fresh(): Promise<{ placed: Awaited<ReturnType<Harness['placeOrder']>>; intent: string }> {
    const placed = await h.placeOrder();
    return { placed, intent: await intentOf(placed.orderId) };
  }
  let seq = 0;
  const id = (): string => `evt_logic_${String((seq += 1))}`;
  const outcome = async (res: Response): Promise<string> => ((await res.json()) as { outcome: string }).outcome;

  it('ignores events without our source marker, with a bad orderId, or for a website order', async () => {
    const { placed, intent } = await fresh();
    const total = totalOf(placed);
    const noSource = await h.webhook(succeededEvent(id(), placed, intent, { amount: total, metadata: { orderId: placed.orderId } }));
    expect(await outcome(noSource)).toBe('ignored');
    const wrongSource = await h.webhook(succeededEvent(id(), placed, intent, { amount: total, metadata: { orderId: placed.orderId, source: 'website' } }));
    expect(await outcome(wrongSource)).toBe('ignored');
    for (const orderId of ['{"$ne":1}', 'x', '', '0'.repeat(23), 'g'.repeat(24), new ObjectId().toHexString()]) {
      const res = await h.webhook(succeededEvent(id(), placed, intent, { amount: total, metadata: { orderId, source: 'humi-mobile-app' } }));
      expect(await outcome(res), orderId).toBe('ignored');
    }
    const site = await h.orders.insertOne({ tracking_number: '121212121212', order_status: 'order-pending', payment_status: 'payment-pending', total: 10, created_at: NOW, payment_intent: { id: intent } });
    const foreign = await h.webhook(succeededEvent(id(), placed, intent, { amount: 1000, metadata: { orderId: site.insertedId.toHexString(), source: 'humi-mobile-app' } }));
    expect(await outcome(foreign)).toBe('ignored');
    const siteDoc = await h.orders.findOne({ _id: site.insertedId });
    expect(siteDoc?.['payment_status']).toBe('payment-pending');
    expect((await state(placed.orderId)).payment).toBe('payment-pending');
  });

  it('ignores an event whose PaymentIntent is not the one stored on the order', async () => {
    const a = await fresh();
    const b = await fresh();
    const res = await h.webhook(succeededEvent(id(), a.placed, b.intent, { amount: totalOf(a.placed) }));
    expect(await outcome(res)).toBe('ignored');
    expect((await state(a.placed.orderId)).payment).toBe('payment-pending');
    expect((await state(b.placed.orderId)).payment).toBe('payment-pending');
  });

  it.each([
    ['one penny short', (t: number) => ({ amount: t - 1 })],
    ['zero', () => ({ amount: 0 })],
    ['overpaid', (t: number) => ({ amount: t + 1 })],
    ['wrong currency', (t: number) => ({ amount: t, currency: 'usd' })],
  ])('does not mark paid when the amount is %s and logs payment_amount_mismatch', async (_name, make) => {
    const { placed, intent } = await fresh();
    const res = await h.webhook(succeededEvent(id(), placed, intent, make(totalOf(placed))));
    expect(res.status).toBe(200);
    expect(await outcome(res)).toBe('ignored');
    expect((await state(placed.orderId)).payment).toBe('payment-pending');
    expect(h.logs.lines().some((l) => l['msg'] === 'payment_amount_mismatch' && l['orderId'] === placed.orderId)).toBe(true);
  });

  it('is monotonic: paid is never downgraded by failed/cancelled, only moved to refunded; refunded never reverts', async () => {
    const { placed, intent } = await fresh();
    const meta = { orderId: placed.orderId, orderNumber: placed.orderNumber, source: 'humi-mobile-app' };
    const ev = (type: string, object: Record<string, unknown>) => ({ id: id(), type, data: { object } });
    await h.webhook(succeededEvent(id(), placed, intent, { amount: totalOf(placed) }));
    expect((await state(placed.orderId)).payment).toBe('payment-success');
    await h.webhook(ev('payment_intent.payment_failed', { id: intent, metadata: meta }));
    await h.webhook(ev('payment_intent.canceled', { id: intent, metadata: meta }));
    expect(await state(placed.orderId)).toMatchObject({ payment: 'payment-success', order: 'order-pending' });
    // a partial refund is not a state change
    await h.webhook(ev('charge.refunded', { amount: 1000, amount_refunded: 500, payment_intent: intent, metadata: meta }));
    expect((await state(placed.orderId)).payment).toBe('payment-success');
    await h.webhook(ev('charge.refunded', { amount: 1000, amount_refunded: 1000, payment_intent: intent, metadata: meta }));
    expect(await state(placed.orderId)).toMatchObject({ payment: 'payment-refunded', order: 'order-refunded' });
    await h.webhook(succeededEvent(id(), placed, intent, { amount: totalOf(placed) }));
    expect((await state(placed.orderId)).payment).toBe('payment-refunded');
  });

  it('refund events for another order or intent cannot refund this order', async () => {
    const a = await fresh();
    const b = await fresh();
    await h.webhook(succeededEvent(id(), a.placed, a.intent, { amount: totalOf(a.placed) }));
    const res = await h.webhook({
      id: id(),
      type: 'charge.refunded',
      data: { object: { amount: 1000, amount_refunded: 1000, payment_intent: b.intent, metadata: { orderId: a.placed.orderId, source: 'humi-mobile-app' } } },
    });
    expect(await outcome(res)).toBe('ignored');
    expect((await state(a.placed.orderId)).payment).toBe('payment-success');
  });

  it('ignores unknown event types and malformed-but-signed payloads without 4xx loops', async () => {
    const unknown = await h.webhook({ id: id(), type: 'customer.created', data: { object: {} } });
    expect(await outcome(unknown)).toBe('ignored');
    const malformed = await h.webhook({ id: id(), type: 'payment_intent.succeeded', data: { object: { id: 5 } } });
    expect(malformed.status).toBe(500); // retried and noticed, never silently dropped
    const noEnvelope = await h.webhook({ nonsense: true });
    expect(noEnvelope.status).toBeGreaterThanOrEqual(400);
  });

  it('paid-after-cancel: a late success on an order the expiry job cancelled keeps the payment record and raises payment_not_applied', async () => {
    const { placed, intent } = await fresh();
    await expirePendingOrders({ ...h.deps, clock: { now: () => new Date(NOW.getTime() + 24 * 3600_000) } });
    expect(await state(placed.orderId)).toMatchObject({ order: 'order-cancelled', payment: 'payment-failed' });
    const res = await h.webhook(succeededEvent(id(), placed, intent, { amount: totalOf(placed) }));
    expect(res.status).toBe(200);
    // Accepted risk (SECURITY-AUDIT.md F-14): money is recorded as received but the order stays cancelled for a human to resolve.
    expect(await state(placed.orderId)).toMatchObject({ order: 'order-cancelled', payment: 'payment-success' });
    expect(h.logs.lines().some((l) => l['msg'] === 'payment_not_applied' && l['level'] === 50)).toBe(true);
  });

  it('expiry never touches paid orders', async () => {
    const { placed, intent } = await fresh();
    await h.webhook(succeededEvent(id(), placed, intent, { amount: totalOf(placed) }));
    await expirePendingOrders({ ...h.deps, clock: { now: () => new Date(NOW.getTime() + 24 * 3600_000) } });
    expect(await state(placed.orderId)).toMatchObject({ order: 'order-pending', payment: 'payment-success' });
  });

  it('expiry never touches website orders', async () => {
    const site = await h.orders.insertOne({ tracking_number: '343434343434', order_status: 'order-pending', payment_status: 'payment-pending', total: 10, created_at: new Date(0) });
    const result = await expirePendingOrders({ ...h.deps, clock: { now: () => new Date(NOW.getTime() + 24 * 3600_000) } });
    expect(result.errors).toBe(0);
    expect((await h.orders.findOne({ _id: site.insertedId }))?.['order_status']).toBe('order-pending');
  });
});
