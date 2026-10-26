import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, type Harness } from '../../support/harness.js';
import type { CheckoutBody, WebhookAck } from '../../support/types.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
}, 120_000);

afterAll(async () => {
  await expectSiteDataIntact(h);
  await h.close();
});

beforeEach(() => {
  h.clock.reset();
});

const PARALLEL = 20;

describe('parallel identical payment-intent requests (same Idempotency-Key)', () => {
  it('produce exactly one live order, one 201, and identical order identity in every response', async () => {
    const key = randomUUID();
    const body = h.checkoutBody();
    const ordersBefore = await h.countOrders();

    // Distinct client IPs: the per-IP budget (10/min) is a separate concern, tested elsewhere.
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => h.post('/v1/checkout/payment-intent', body, { idempotencyKey: key })),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201), `statuses: ${statuses.join(',')}`).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(PARALLEL - 1);
    const bodies = responses.map((r) => r.json<CheckoutBody>());
    const winner = bodies[statuses.indexOf(201)];
    expect(winner).toBeDefined();
    for (const b of bodies) {
      expect(b.orderId).toBe(winner?.orderId);
      expect(b.orderNumber).toBe(winner?.orderNumber);
      expect(b.clientSecret).toBe(winner?.clientSecret);
      expect(b.pricing).toEqual(winner?.pricing);
      expect(b.lines).toEqual(winner?.lines);
    }
    for (const r of responses) expect(r.headers.get('idempotent-replay') === 'true').toBe(r.status === 200);

    // The one order that the idempotency record points at is live and payable ...
    const live = await h.orderDoc(winner?.orderId ?? '');
    expect(live).toMatchObject({ order_status: 'order-pending', payment_status: 'payment-pending' });
    expect(await h.db.collection('app_idempotency').countDocuments({})).toBeGreaterThan(0);
    const liveIntents = [...h.gateway.intents.values()].filter((i) => i.status === 'requires_payment_method' && i.orderId === winner?.orderId);
    expect(liveIntents).toHaveLength(1);

    // ... and nothing else payable was left behind by the losers of the race.
    const created = await h.countOrders();
    const stillPayable = await h.countAppOrders({ payment_status: 'payment-pending', order_status: 'order-pending' });
    expect(stillPayable).toBeGreaterThanOrEqual(1);
    const mine = await h.db
      .collection('orders')
      .find({ 'app_meta.source': 'mobile-app', 'app_meta.idempotency_key_hash': (live?.['app_meta'] as { idempotency_key_hash: string }).idempotency_key_hash })
      .toArray();
    const payable = mine.filter((o) => o['order_status'] === 'order-pending');
    expect(payable, 'exactly one payable order for one idempotency key').toHaveLength(1);
    expect(created - ordersBefore).toBe(mine.length);
  });

  it('with two different bodies on one key: one body wins, the other is a 409, and only one order is payable', async () => {
    const key = randomUUID();
    const a = h.checkoutBody();
    const b = h.checkoutBody({ lines: [{ productId: 'aloo-tikki', quantity: 5 }] });
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) => h.post('/v1/checkout/payment-intent', i % 2 === 0 ? a : b, { idempotencyKey: key })),
    );
    const ok = responses.filter((r) => r.status === 200 || r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);
    expect(ok.length + conflicts.length, responses.map((r) => r.status).join(',')).toBe(PARALLEL);
    expect(new Set(ok.map((r) => r.json<CheckoutBody>().orderId)).size).toBe(1);
    expect(new Set(ok.map((r) => r.json<CheckoutBody>().pricing.totalPence)).size).toBe(1);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    const orderId = ok[0]?.json<CheckoutBody>().orderId ?? '';
    const doc = await h.requireOrderDoc(orderId);
    const hash = (doc['app_meta'] as { idempotency_key_hash: string }).idempotency_key_hash;
    const payable = await h.countAppOrders({ 'app_meta.idempotency_key_hash': hash, order_status: 'order-pending' });
    expect(payable).toBe(1);
  });
});

describe('idempotency race: one key, many parallel requests', () => {
  // The key is claimed (unique index, state in_progress) before any order is inserted; losers wait for the
  // winner's record and replay it, so the owner's orders collection never sees cancelled duplicates.
  it('leaves exactly ONE order document and identical responses for one idempotency key', async () => {
    const key = randomUUID();
    const body = h.checkoutBody();
    const ordersBefore = await h.countOrders();
    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => h.post('/v1/checkout/payment-intent', body, { idempotencyKey: key })),
    );
    expect(responses.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await h.countOrders()).toBe(ordersBefore + 1);
    const bodies = responses.map((r) => r.json<{ orderId: string; clientSecret: string; pricing: unknown }>());
    expect(new Set(bodies.map((b) => b.orderId)).size).toBe(1);
    expect(new Set(bodies.map((b) => b.clientSecret)).size).toBe(1);
    expect(new Set(bodies.map((b) => JSON.stringify(b.pricing))).size).toBe(1);
  });
});

describe('parallel webhook deliveries of the same event', () => {
  it('apply exactly one transition and record the event once', async () => {
    const order = await h.createOrder();
    const event = h.paymentEvent('payment_intent.succeeded', order, { id: 'evt_race_paid' });
    const raw = JSON.stringify(event);
    const signature = h.signWebhook(raw);

    const responses = await Promise.all(
      Array.from({ length: PARALLEL }, () => h.postWebhook(null, { raw, signature })),
    );
    expect(responses.map((r) => r.status)).toEqual(Array.from({ length: PARALLEL }, () => 200));
    const outcomes = responses.map((r) => r.json<WebhookAck>().outcome);
    expect(outcomes.filter((o) => o === 'applied')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'duplicate')).toHaveLength(PARALLEL - 1);

    expect(await h.db.collection('webhook_events').countDocuments({ eventId: 'evt_race_paid' })).toBe(1);
    const doc = await h.requireOrderDoc(order.orderId);
    expect(doc).toMatchObject({ payment_status: 'payment-success', order_status: 'order-pending' });
    expect(h.logsAt('error', 'payment_not_applied').filter((l) => l['orderId'] === order.orderId)).toHaveLength(0);
  });

  it('a success racing a failure for the same order always ends paid', async () => {
    const order = await h.createOrder();
    const events = [
      ...Array.from({ length: 5 }, (_, i) => h.paymentEvent('payment_intent.payment_failed', order, { id: `evt_f_${String(i)}` })),
      ...Array.from({ length: 5 }, (_, i) => h.paymentEvent('payment_intent.succeeded', order, { id: `evt_s_${String(i)}` })),
    ];
    const shuffled = [...events].sort(() => Math.random() - 0.5);
    const responses = await Promise.all(shuffled.map((e) => h.postWebhook(e)));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    // Failure then success is allowed (retry), success then failure must not downgrade: either order ends paid.
    expect((await h.requireOrderDoc(order.orderId))['payment_status']).toBe('payment-success');
  });
});

describe('parallel different carts', () => {
  const carts = [
    [{ productId: 'aloo-tikki', quantity: 1 }],
    [{ productId: 'chicken-seekh-kebab', quantity: 2 }],
    [{ productId: 'meat-samosa-large', quantity: 3 }, { productId: 'aloo-tikki', quantity: 1 }],
    [{ productId: 'vegetable-spring-rolls', quantity: 4 }],
    [{ productId: 'chicken-chapli-kebab', quantity: 5 }],
    [{ productId: 'punjabi-samosa-roti', quantity: 6 }, { productId: 'meat-crispy-samosa', quantity: 2 }],
    [{ productId: 'tandoori-chicken-samosa', quantity: 1 }],
    [{ productId: 'meat-shami-kebabs', quantity: 7 }],
  ];

  it('do not interfere: each order has its own total, lines, number, intent and payment state', async () => {
    const ordersBefore = await h.countOrders();
    const results = await Promise.all(
      carts.map((lines, i) =>
        h.checkout(
          { lines, contact: { name: `Customer ${String(i)}`, email: `customer${String(i)}@example.com`, phone: `0770090${String(1000 + i)}` } },
        ),
      ),
    );
    expect(results.map((r) => r.res.status)).toEqual(carts.map(() => 201));
    const bodies = results.map((r) => r.res.json<CheckoutBody>());
    expect(await h.countOrders()).toBe(ordersBefore + carts.length);
    expect(new Set(bodies.map((b) => b.orderId)).size).toBe(carts.length);
    expect(new Set(bodies.map((b) => b.orderNumber)).size).toBe(carts.length);
    expect(new Set(bodies.map((b) => b.clientSecret)).size).toBe(carts.length);

    for (const [i, body] of bodies.entries()) {
      const cart = carts[i] ?? [];
      const quote = (await h.post('/v1/checkout/quote', { lines: cart })).json<{ pricing: CheckoutBody['pricing'] }>();
      expect(body.pricing, `cart ${String(i)}`).toEqual(quote.pricing);
      expect(body.lines.map((l) => [l.productId, l.quantity])).toEqual(cart.map((l) => [l.productId, l.quantity]));
      const doc = await h.requireOrderDoc(body.orderId);
      expect(doc).toMatchObject({ customer_email: `customer${String(i)}@example.com`, total: body.pricing.totalPence / 100 });
      expect(h.gateway.intents.get(h.intentIdFor(body.orderId))?.amountPence).toBe(body.pricing.totalPence);
    }

    // Pay half of them concurrently, send a mismatching amount for another, and fail one.
    const acks = await Promise.all([
      ...bodies.slice(0, 4).map((b) => h.pay(b)),
      h.deliver(h.paymentEvent('payment_intent.succeeded', bodies[4] as CheckoutBody, { amount: 1 })),
      h.deliver(h.paymentEvent('payment_intent.payment_failed', bodies[5] as CheckoutBody)),
    ]);
    expect(acks.map((a) => a.outcome)).toEqual(['applied', 'applied', 'applied', 'applied', 'ignored', 'applied']);
    const states = await Promise.all(bodies.map(async (b) => (await h.requireOrderDoc(b.orderId))['payment_status'] as unknown));
    expect(states).toEqual([
      'payment-success',
      'payment-success',
      'payment-success',
      'payment-success',
      'payment-pending',
      'payment-failed',
      'payment-pending',
      'payment-pending',
    ]);
  });

  it('keep stock-limited products consistent: no request is accepted beyond what each cart individually allows', async () => {
    await h.addProduct({ slug: 'e2e-last-3', name: 'E2E LAST THREE', price: 2, quantity: 3 });
    const ok = await Promise.all(Array.from({ length: 6 }, () => h.checkout({ lines: [{ productId: 'e2e-last-3', quantity: 3 }] })));
    const over = await Promise.all(Array.from({ length: 6 }, () => h.checkout({ lines: [{ productId: 'e2e-last-3', quantity: 4 }] })));
    expect(ok.every((r) => r.res.status === 201)).toBe(true);
    expect(over.every((r) => r.res.status === 422)).toBe(true);
  });
});
