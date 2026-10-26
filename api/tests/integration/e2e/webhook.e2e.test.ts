import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectError, expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, type Harness } from '../../support/harness.js';
import type { OrderBody, WebhookAck } from '../../support/types.js';

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

const statusOf = async (order: { orderId: string }): Promise<{ order_status: unknown; payment_status: unknown; updated_at: unknown }> => {
  const doc = await h.requireOrderDoc(order.orderId);
  return { order_status: doc['order_status'], payment_status: doc['payment_status'], updated_at: doc['updated_at'] };
};

describe('payment_intent.succeeded', () => {
  it('marks the order paid, leaves order_status alone by default and the app reports it as placed/paid', async () => {
    const order = await h.createOrder();
    const res = await h.postWebhook(h.paymentEvent('payment_intent.succeeded', order, { id: 'evt_ok_1' }));
    expect(res.status).toBe(200);
    expect(res.json<WebhookAck>()).toEqual({ received: true, outcome: 'applied' });

    expect(await statusOf(order)).toMatchObject({ order_status: 'order-pending', payment_status: 'payment-success' });
    const read = (await h.get(`/v1/orders/${order.orderId}`, { token: order.guestToken })).json<OrderBody>();
    expect(read).toMatchObject({ status: 'placed', paymentStatus: 'paid' });
    expect(await h.db.collection('webhook_events').countDocuments({ eventId: 'evt_ok_1' })).toBe(1);
  });

  it('PAID_ORDER_STATUS moves a paid order out of order-pending, but never overwrites a status staff already set', async () => {
    const h2 = await createHarness({ env: { PAID_ORDER_STATUS: 'order-processing' } });
    try {
      const a = await h2.createOrder();
      await h2.pay(a);
      expect((await h2.requireOrderDoc(a.orderId))['order_status']).toBe('order-processing');
      expect((await h2.get(`/v1/orders/${a.orderId}`, { token: a.guestToken })).json<OrderBody>().status).toBe('preparing');

      const b = await h2.createOrder();
      await h2.staffSetOrderStatus(b.orderId, 'order-out-for-delivery');
      await h2.pay(b);
      expect((await h2.requireOrderDoc(b.orderId))['order_status']).toBe('order-out-for-delivery');
    } finally {
      await h2.close();
    }
  }, 120_000);

  it('a duplicate delivery of the same event id has no further effect', async () => {
    const order = await h.createOrder();
    const event = h.paymentEvent('payment_intent.succeeded', order, { id: 'evt_dup_1' });
    expect((await h.deliver(event)).outcome).toBe('applied');
    const after = await statusOf(order);

    h.clock.advanceMinutes(10);
    for (let i = 0; i < 3; i += 1) expect(await h.deliver(event)).toEqual({ received: true, outcome: 'duplicate' });
    // updated_at did not move: nothing was written.
    expect(await statusOf(order)).toEqual(after);
    expect(await h.db.collection('webhook_events').countDocuments({ eventId: 'evt_dup_1' })).toBe(1);
  });

  it('a different event id for an already-paid order is also a no-op write', async () => {
    const order = await h.createOrder();
    await h.deliver(h.paymentEvent('payment_intent.succeeded', order, { id: 'evt_a' }));
    const after = await statusOf(order);
    h.clock.advanceMinutes(10);
    await h.deliver(h.paymentEvent('payment_intent.succeeded', order, { id: 'evt_b' }));
    expect(await statusOf(order)).toEqual(after);
  });

  it('amount mismatch: not paid, 200, and a payment_amount_mismatch error is logged', async () => {
    const order = await h.createOrder();
    const before = h.logsAt('error', 'payment_amount_mismatch').length;
    const ack = await h.deliver(h.paymentEvent('payment_intent.succeeded', order, { amount: order.pricing.totalPence - 1 }));
    expect(ack).toEqual({ received: true, outcome: 'ignored' });
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending' });
    const logged = h.logsAt('error', 'payment_amount_mismatch');
    expect(logged).toHaveLength(before + 1);
    expect(logged.at(-1)).toMatchObject({ orderId: order.orderId, expectedPence: order.pricing.totalPence, receivedPence: order.pricing.totalPence - 1 });
    // The order is still payable: the right amount afterwards settles it.
    expect((await h.pay(order)).outcome).toBe('applied');
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-success' });
  });

  it('over-payment and wrong currency are mismatches too', async () => {
    const over = await h.createOrder();
    expect((await h.deliver(h.paymentEvent('payment_intent.succeeded', over, { amount: over.pricing.totalPence + 1 }))).outcome).toBe('ignored');
    const usd = await h.createOrder();
    expect((await h.deliver(h.paymentEvent('payment_intent.succeeded', usd, { currency: 'usd' }))).outcome).toBe('ignored');
    const upper = await h.createOrder();
    expect((await h.deliver(h.paymentEvent('payment_intent.succeeded', upper, { currency: 'GBP' }))).outcome).toBe('applied');
    expect(await statusOf(over)).toMatchObject({ payment_status: 'payment-pending' });
    expect(await statusOf(usd)).toMatchObject({ payment_status: 'payment-pending' });
  });

  it('a different PaymentIntent id than the one stored on the order is ignored', async () => {
    const order = await h.createOrder();
    const ack = await h.deliver(h.paymentEvent('payment_intent.succeeded', order, { intentId: 'pi_somebody_elses' }));
    expect(ack.outcome).toBe('ignored');
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending' });
    expect(h.logsAt('warn', 'webhook_intent_mismatch').length).toBeGreaterThan(0);
  });
});

describe('events that are not ours', () => {
  it('ignores a PaymentIntent without metadata.source, even if it names one of our orders', async () => {
    const order = await h.createOrder();
    const metadatas: (Record<string, string> | null)[] = [null, {}, { orderId: order.orderId }, { orderId: order.orderId, source: 'website' }, { orderId: order.orderId, source: 'HUMI-MOBILE-APP' }];
    for (const [index, metadata] of metadatas.entries()) {
      const ack = await h.deliver(h.paymentEvent('payment_intent.succeeded', order, { metadata, id: `evt_foreign_${String(index)}` }));
      expect(ack).toEqual({ received: true, outcome: 'ignored' });
    }
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending' });
    // Foreign events are not recorded, so they can never shadow a real event with the same id.
    expect(await h.db.collection('webhook_events').countDocuments({ eventId: /^evt_foreign_/ })).toBe(0);
  });

  it('ignores unknown event types and unrelated intents with 200', async () => {
    const unknown = { id: 'evt_x', type: 'customer.created', data: { object: { id: 'cus_1' } } };
    expect(await h.deliver(unknown)).toEqual({ received: true, outcome: 'ignored' });
    const foreign = { id: 'evt_y', type: 'payment_intent.succeeded', data: { object: { id: 'pi_site', amount_received: 500, currency: 'gbp', metadata: { source: 'website', orderId: 'abc' } } } };
    expect(await h.deliver(foreign)).toEqual({ received: true, outcome: 'ignored' });
  });

  it('answers 200 for an unknown order id, a malformed one and a missing one', async () => {
    const order = await h.createOrder();
    for (const orderId of [new ObjectId().toHexString(), 'not-an-object-id', '$ne', '']) {
      const ack = await h.deliver(h.paymentEvent('payment_intent.succeeded', order, { metadata: { orderId, source: 'humi-mobile-app' } }));
      expect(ack.outcome).toBe('ignored');
    }
    const noId = await h.deliver(h.paymentEvent('payment_intent.succeeded', order, { metadata: { source: 'humi-mobile-app' } }));
    expect(noId.outcome).toBe('ignored');
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending' });
  });

  it('never modifies a website order, even when an event with our source names it', async () => {
    const [website] = [...h.seededOrderHashes().keys()];
    const pendingSite = await h.db.collection('orders').findOne({ tracking_number: '660011223344' });
    expect(pendingSite).not.toBeNull();
    const id = String(pendingSite?.['_id']);
    expect(website).toBeDefined();
    for (const type of ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled'] as const) {
      const ack = await h.deliver(
        h.paymentEvent(type, { orderId: id, orderNumber: '660011223344', pricing: { totalPence: 1959 } }, { intentId: 'pi_x', amount: 1959 }),
      );
      expect(ack.outcome).toBe('ignored');
    }
    const refund = await h.deliver(h.refundEvent({ orderId: id, orderNumber: '660011223344', pricing: { totalPence: 1959 } }));
    expect(refund.outcome).toBe('ignored');
    expect(await h.siteOrdersNow()).toEqual(h.seededOrderHashes());
  });
});

describe('failure, cancellation and refund', () => {
  it('payment_failed on a pending order marks the payment failed but keeps the order retryable', async () => {
    const order = await h.createOrder();
    await h.deliver(h.paymentEvent('payment_intent.payment_failed', order));
    expect(await statusOf(order)).toMatchObject({ order_status: 'order-pending', payment_status: 'payment-failed' });
    const read = (await h.get(`/v1/orders/${order.orderId}`, { token: order.guestToken })).json<OrderBody>();
    expect(read).toMatchObject({ status: 'pending_payment', paymentStatus: 'failed' });
    // The customer retries in the PaymentSheet and succeeds.
    await h.pay(order);
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-success' });
  });

  it('payment_failed after succeeded can never downgrade a paid order', async () => {
    const order = await h.createOrder();
    await h.pay(order);
    const ack = await h.deliver(h.paymentEvent('payment_intent.payment_failed', order));
    expect(ack.received).toBe(true);
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-success' });
    await h.deliver(h.paymentEvent('payment_intent.canceled', order));
    expect(await statusOf(order)).toMatchObject({ order_status: 'order-pending', payment_status: 'payment-success' });
  });

  it('payment_intent.canceled cancels the order', async () => {
    const order = await h.createOrder();
    await h.deliver(h.paymentEvent('payment_intent.canceled', order));
    expect(await statusOf(order)).toMatchObject({ order_status: 'order-cancelled', payment_status: 'payment-failed' });
    const read = (await h.get(`/v1/orders/${order.orderId}`, { token: order.guestToken })).json<OrderBody>();
    expect(read).toMatchObject({ status: 'cancelled', paymentStatus: 'failed' });
  });

  it('money arriving for an already-cancelled order is flagged for a human (payment_not_applied)', async () => {
    const order = await h.createOrder();
    await h.deliver(h.paymentEvent('payment_intent.canceled', order));
    const before = h.logsAt('error', 'payment_not_applied').length;
    await h.pay(order);
    expect(h.logsAt('error', 'payment_not_applied')).toHaveLength(before + 1);
    // The order must not silently come back to life.
    expect((await h.requireOrderDoc(order.orderId))['order_status']).toBe('order-cancelled');
  });

  it('a full charge.refunded moves a paid order to refunded', async () => {
    const order = await h.createOrder();
    await h.pay(order);
    await h.deliver(h.refundEvent(order));
    expect(await statusOf(order)).toMatchObject({ order_status: 'order-refunded', payment_status: 'payment-refunded' });
    const read = (await h.get(`/v1/orders/${order.orderId}`, { token: order.guestToken })).json<OrderBody>();
    expect(read).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
  });

  it('a partial refund leaves the order paid; a refund before payment changes nothing; refunded is terminal', async () => {
    const order = await h.createOrder();
    await h.deliver(h.refundEvent(order, { refunded: 100 }));
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending' });
    await h.deliver(h.refundEvent(order)); // full, but never paid
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending', order_status: 'order-pending' });
    await h.pay(order);
    await h.deliver(h.refundEvent(order, { refunded: 100 }));
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-success' });
    await h.deliver(h.refundEvent(order));
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-refunded' });
    // A replayed success must not resurrect a refunded order.
    await h.deliver(h.paymentEvent('payment_intent.succeeded', order));
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-refunded', order_status: 'order-refunded' });
  });
});

describe('signature verification', () => {
  it('rejects a bad signature with 400 and processes nothing', async () => {
    const order = await h.createOrder();
    const event = h.paymentEvent('payment_intent.succeeded', order, { id: 'evt_badsig' });
    const raw = JSON.stringify(event);
    const good = h.signWebhook(raw);
    const flipped = good.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
    for (const signature of [flipped, 't=1,v1=deadbeef', 'garbage', 'v1=abc', `t=${String(Math.floor(h.clock.epochMs() / 1000))}`, '']) {
      const res = await h.postWebhook(event, { signature });
      expectError(res, 400, 'invalid_signature');
    }
    expectError(await h.postWebhook(event, { signature: null }), 400, 'invalid_signature');
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending' });
    expect(await h.db.collection('webhook_events').countDocuments({ eventId: 'evt_badsig' })).toBe(0);
  });

  it('rejects a body altered after signing', async () => {
    const order = await h.createOrder();
    const event = h.paymentEvent('payment_intent.succeeded', order);
    const signature = h.signWebhook(JSON.stringify(event));
    const tampered = JSON.stringify(event).replace(`"amount_received":${String(order.pricing.totalPence)}`, '"amount_received":1');
    const res = await h.postWebhook(null, { raw: `${tampered} `, signature });
    expectError(res, 400, 'invalid_signature');
  });

  it('rejects a signature made with a different secret', async () => {
    const order = await h.createOrder();
    const raw = JSON.stringify(h.paymentEvent('payment_intent.succeeded', order));
    const { createHmac } = await import('node:crypto');
    const t = Math.floor(h.clock.epochMs() / 1000);
    const forged = `t=${String(t)},v1=${createHmac('sha256', 'whsec_attacker').update(`${String(t)}.${raw}`).digest('hex')}`;
    expectError(await h.postWebhook(null, { raw, signature: forged }), 400, 'invalid_signature');
  });

  it('rejects a stale timestamp (older than 300 s) but accepts one inside the tolerance', async () => {
    const order = await h.createOrder();
    const event = h.paymentEvent('payment_intent.succeeded', order);
    const now = Math.floor(h.clock.epochMs() / 1000);
    expectError(await h.postWebhook(event, { timestamp: now - 301 }), 400, 'invalid_signature');
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending' });
    const ok = await h.postWebhook(event, { timestamp: now - 299 });
    expect(ok.status).toBe(200);
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-success' });
  });

  it('a correctly signed replay becomes stale as time passes', async () => {
    const order = await h.createOrder();
    const raw = JSON.stringify(h.paymentEvent('payment_intent.succeeded', order));
    const signature = h.signWebhook(raw);
    h.clock.advanceMinutes(6);
    expectError(await h.postWebhook(null, { raw, signature }), 400, 'invalid_signature');
  });

  it('treats a signed body that is not JSON as an invalid signature (400) and a signed body of the wrong shape as a 5xx so Stripe retries', async () => {
    expectError(await h.postWebhook(null, { raw: 'not json' }), 400, 'invalid_signature');
    const shape = await h.postWebhook({ id: 'evt_shape', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } });
    expect(shape.status).toBeGreaterThanOrEqual(500);
    expect(shape.text).not.toMatch(/stack|at \w+ \(/);
    expectError(await h.postWebhook({ nothing: true }), 500);
  });

  it('does not require JSON content type negotiation tricks: a non-JSON content type is refused before verification', async () => {
    const order = await h.createOrder();
    const raw = JSON.stringify(h.paymentEvent('payment_intent.succeeded', order));
    const res = await h.request('POST', '/v1/webhooks/stripe', { body: raw, headers: { 'content-type': 'text/plain', 'stripe-signature': h.signWebhook(raw) } });
    expect(res.status).toBe(415);
    expect(await statusOf(order)).toMatchObject({ payment_status: 'payment-pending' });
  });
});

describe('webhook endpoint limits', () => {
  it('is exempt from the global per-IP budget so Stripe bursts are not throttled', async () => {
    const ip = '54.187.174.169';
    const event = { id: 'evt_burst', type: 'customer.created', data: { object: { id: 'cus_1' } } };
    const statuses = new Set<number>();
    for (let i = 0; i < 150; i += 1) statuses.add((await h.postWebhook(event, { ip })).status);
    expect([...statuses]).toEqual([200]);
  });
});
