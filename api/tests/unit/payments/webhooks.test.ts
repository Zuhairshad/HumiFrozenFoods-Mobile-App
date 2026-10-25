import { describe, expect, it, vi } from 'vitest';
import { errorBody } from '../helpers.js';
import { buildHarness, type Harness, NOW, pricingFor } from './fakes.js';

const ORDER_ID = 'a1'.repeat(12);
const INTENT = 'pi_fake_000001';

function envelope(id: string, type: string, object: Record<string, unknown>): string {
  return JSON.stringify({ id, object: 'event', type, data: { object } });
}

const ours = { orderId: ORDER_ID, orderNumber: '123456789012', source: 'humi-mobile-app' };
const succeeded = (id = 'evt_s', over: Record<string, unknown> = {}) =>
  envelope(id, 'payment_intent.succeeded', { id: INTENT, amount_received: 2000, currency: 'gbp', metadata: ours, ...over });
const failed = (id = 'evt_f') => envelope(id, 'payment_intent.payment_failed', { id: INTENT, metadata: ours });
const canceled = (id = 'evt_c') => envelope(id, 'payment_intent.canceled', { id: INTENT, metadata: ours });
const refunded = (id = 'evt_r', amountRefunded = 2000) =>
  envelope(id, 'charge.refunded', { id: 'ch_1', amount: 2000, amount_refunded: amountRefunded, payment_intent: INTENT, metadata: ours });

function setup(): Harness {
  const h = buildHarness();
  h.orders.seed({ orderId: ORDER_ID, paymentIntentId: INTENT, pricing: pricingFor(2000) });
  return h;
}

function send(h: Harness, raw: string, header: string | null = h.gateway.sign(raw), contentType = 'application/json') {
  return h.app.request('/v1/webhooks/stripe', {
    method: 'POST',
    headers: { 'content-type': contentType, ...(header === null ? {} : { 'stripe-signature': header }) },
    body: raw,
  });
}

const order = (h: Harness) => h.orders.orders.get(ORDER_ID);
const logLines = (h: Harness) => h.logs.lines();

describe('POST /v1/webhooks/stripe signature handling', () => {
  it('answers 400 for missing, malformed, wrong-secret, tampered and stale signatures and processes nothing', async () => {
    const h = setup();
    const raw = succeeded();
    const stale = h.gateway.sign(raw, Math.floor(NOW.getTime() / 1000) - 3600);
    const cases: (string | null)[] = [null, 'garbage', h.gateway.sign(raw).replace(/v1=(.)/, (_m, c: string) => `v1=${c === '0' ? '1' : '0'}`), stale];
    for (const header of cases) {
      const res = await send(h, raw, header);
      expect(res.status, String(header)).toBe(400);
      expect((await errorBody(res)).error.code).toBe('invalid_signature');
    }
    const tampered = await send(h, succeeded('evt_s', { amount_received: 1 }), h.gateway.sign(raw));
    expect(tampered.status).toBe(400);
    expect(order(h)?.sitePaymentStatus).toBe('payment-pending');
    expect(h.orders.transitions).toHaveLength(0);
    expect(h.webhookEvents.ids.size).toBe(0);
  });

  it('verifies the raw bytes: re-serialised JSON with the same content is rejected', async () => {
    const h = setup();
    const raw = succeeded();
    const reserialised = JSON.stringify(JSON.parse(raw), null, 2);
    expect((await send(h, reserialised, h.gateway.sign(raw))).status).toBe(400);
  });

  it('is not subject to JSON-only content type rules beyond the global one', async () => {
    const h = setup();
    expect((await send(h, succeeded(), undefined, 'text/plain')).status).toBe(415);
  });
});

describe('POST /v1/webhooks/stripe payment_intent.succeeded', () => {
  it('marks the order paid and records the event', async () => {
    const h = setup();
    const res = await send(h, succeeded());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: 'applied' });
    expect(order(h)).toMatchObject({ sitePaymentStatus: 'payment-success', siteOrderStatus: 'order-pending' });
    expect(h.webhookEvents.ids.has('evt_s')).toBe(true);
  });

  it('ignores duplicate deliveries without changing state again', async () => {
    const h = setup();
    await send(h, succeeded());
    const before = order(h);
    const res = await send(h, succeeded());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: 'duplicate' });
    expect(order(h)).toEqual(before);
    expect(h.webhookEvents.ids.size).toBe(1);
  });

  it('does not pay when the amount differs (tamper or partial capture) and logs payment_amount_mismatch', async () => {
    const h = setup();
    for (const amount of [1999, 2001, 0, 20000]) {
      const res = await send(h, succeeded(`evt_${String(amount)}`, { amount_received: amount }));
      expect(res.status).toBe(200);
    }
    expect(order(h)?.sitePaymentStatus).toBe('payment-pending');
    const errors = logLines(h).filter((l) => l.msg === 'payment_amount_mismatch');
    expect(errors).toHaveLength(4);
    expect(errors[0]).toMatchObject({ level: 50, orderId: ORDER_ID, expectedPence: 2000, receivedPence: 1999 });
    expect(h.webhookEvents.ids.size).toBe(0);
  });

  it('does not pay when the currency is not gbp', async () => {
    const h = setup();
    const res = await send(h, succeeded('evt_usd', { currency: 'USD' }));
    expect(res.status).toBe(200);
    expect(order(h)?.sitePaymentStatus).toBe('payment-pending');
    expect(logLines(h).some((l) => l.msg === 'payment_amount_mismatch')).toBe(true);
  });

  it('does not pay when the intent id differs from the one stored on the order', async () => {
    const h = setup();
    const res = await send(h, succeeded('evt_other', { id: 'pi_someone_elses' }));
    expect(res.status).toBe(200);
    expect(order(h)?.sitePaymentStatus).toBe('payment-pending');
    expect(logLines(h).some((l) => l.msg === 'webhook_intent_mismatch')).toBe(true);
  });

  it('does not pay an order that has no intent attached yet', async () => {
    const h = setup();
    h.orders.seed({ orderId: ORDER_ID, paymentIntentId: null, pricing: pricingFor(2000) });
    expect((await send(h, succeeded())).status).toBe(200);
    expect(order(h)?.sitePaymentStatus).toBe('payment-pending');
  });

  it('logs payment_not_applied when money arrives for an order the expiry job already cancelled', async () => {
    const h = setup();
    await h.orders.applyPaymentTransition(ORDER_ID, { kind: 'cancelled', paymentIntentId: INTENT });
    const res = await send(h, succeeded());
    expect(res.status).toBe(200);
    expect(logLines(h).some((l) => l.msg === 'payment_not_applied' && l.level === 50)).toBe(true);
  });

  it('logs payment_not_applied when the repository refuses the transition', async () => {
    const h = setup();
    h.orders.seed({ orderId: ORDER_ID, sitePaymentStatus: 'payment-refunded', siteOrderStatus: 'order-refunded', paymentIntentId: INTENT, pricing: pricingFor(2000) });
    await send(h, succeeded());
    expect(order(h)?.sitePaymentStatus).toBe('payment-refunded');
    expect(logLines(h).some((l) => l.msg === 'payment_not_applied')).toBe(true);
  });
});

describe('POST /v1/webhooks/stripe other events', () => {
  it('failed -> payment-failed, order stays retryable', async () => {
    const h = setup();
    expect((await send(h, failed())).status).toBe(200);
    expect(order(h)).toMatchObject({ sitePaymentStatus: 'payment-failed', siteOrderStatus: 'order-pending' });
    // A retry by the customer can still succeed.
    await send(h, succeeded());
    expect(order(h)?.sitePaymentStatus).toBe('payment-success');
  });

  it('a late payment_failed never overwrites payment-success (out-of-order delivery)', async () => {
    const h = setup();
    await send(h, succeeded());
    const res = await send(h, failed());
    expect(res.status).toBe(200);
    expect(order(h)?.sitePaymentStatus).toBe('payment-success');
  });

  it('a late payment_intent.canceled cannot cancel a paid order', async () => {
    const h = setup();
    await send(h, succeeded());
    await send(h, canceled());
    expect(order(h)).toMatchObject({ sitePaymentStatus: 'payment-success', siteOrderStatus: 'order-pending' });
  });

  it('canceled -> order-cancelled with payment-failed', async () => {
    const h = setup();
    await send(h, canceled());
    expect(order(h)).toMatchObject({ siteOrderStatus: 'order-cancelled', sitePaymentStatus: 'payment-failed' });
  });

  it('full refund of a paid order -> payment-refunded and order-refunded; a partial refund changes nothing', async () => {
    const h = setup();
    await send(h, succeeded());
    expect((await send(h, refunded('evt_part', 500))).status).toBe(200);
    expect(order(h)?.sitePaymentStatus).toBe('payment-success');
    expect((await send(h, refunded())).status).toBe(200);
    expect(order(h)).toMatchObject({ sitePaymentStatus: 'payment-refunded', siteOrderStatus: 'order-refunded' });
  });

  it('a refund on an unpaid order is not applied', async () => {
    const h = setup();
    await send(h, refunded());
    expect(order(h)?.sitePaymentStatus).toBe('payment-pending');
  });

  it('a refund with no payment intent is ignored', async () => {
    const h = setup();
    const raw = envelope('evt_x', 'charge.refunded', { id: 'ch_9', amount: 2000, amount_refunded: 2000, payment_intent: null, metadata: ours });
    expect((await send(h, raw)).status).toBe(200);
    expect(h.orders.transitions).toHaveLength(0);
  });

  it('ignores unrelated event types with 200', async () => {
    const h = setup();
    const res = await send(h, envelope('evt_u', 'customer.created', { id: 'cus_1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: 'ignored' });
    expect(h.webhookEvents.ids.size).toBe(0);
  });
});

describe('POST /v1/webhooks/stripe foreign and unknown objects', () => {
  it('never touches PaymentIntents that are not from the mobile app, even if they name one of our orders', async () => {
    const h = setup();
    for (const metadata of [{}, { orderId: ORDER_ID }, { orderId: ORDER_ID, source: 'website' }, { orderId: ORDER_ID, source: 'HUMI-MOBILE-APP' }]) {
      const res = await send(h, succeeded('evt_foreign', { metadata }));
      expect(res.status).toBe(200);
    }
    expect(h.orders.transitions).toHaveLength(0);
    expect(order(h)?.sitePaymentStatus).toBe('payment-pending');
    expect(h.webhookEvents.ids.size).toBe(0);
  });

  it('answers 200 and warns for unknown orders, invalid ids and orders the app did not create', async () => {
    const h = setup();
    expect((await send(h, succeeded('evt_1', { metadata: { ...ours, orderId: 'b2'.repeat(12) } }))).status).toBe(200);
    expect((await send(h, succeeded('evt_2', { metadata: { ...ours, orderId: '$ne' } }))).status).toBe(200);
    expect((await send(h, succeeded('evt_3', { metadata: { source: 'humi-mobile-app' } }))).status).toBe(200);
    h.orders.seed({ orderId: 'c3'.repeat(12), createdByApp: false });
    expect((await send(h, succeeded('evt_4', { metadata: { ...ours, orderId: 'c3'.repeat(12) } }))).status).toBe(200);
    expect(logLines(h).filter((l) => l.msg === 'webhook_order_unknown')).toHaveLength(4);
    expect(h.orders.transitions).toHaveLength(0);
  });

  it('warns and answers 200 when the repository reports the order as unknown at apply time', async () => {
    const h = setup();
    vi.spyOn(h.orders, 'applyPaymentTransition').mockResolvedValue(null);
    expect((await send(h, succeeded())).status).toBe(200);
    expect(h.webhookEvents.ids.size).toBe(0);
  });
});

describe('POST /v1/webhooks/stripe transient failures are retryable', () => {
  it('returns 5xx without recording the event, and the retry then succeeds', async () => {
    const h = setup();
    h.orders.failNext('applyPaymentTransition');
    const first = await send(h, succeeded());
    expect(first.status).toBe(500);
    expect(h.webhookEvents.ids.size).toBe(0);
    expect(order(h)?.sitePaymentStatus).toBe('payment-pending');

    const retry = await send(h, succeeded());
    expect(retry.status).toBe(200);
    expect(order(h)?.sitePaymentStatus).toBe('payment-success');
    expect(h.webhookEvents.ids.has('evt_s')).toBe(true);
  });

  it('returns 5xx when the order lookup fails', async () => {
    const h = setup();
    h.orders.failNext('findById');
    expect((await send(h, succeeded())).status).toBe(500);
    expect(h.webhookEvents.ids.size).toBe(0);
  });

  it('returns 5xx if recording fails after processing; the redelivery is an idempotent no-op that records', async () => {
    const h = setup();
    h.webhookEvents.failNext = new Error('mongo down');
    expect((await send(h, succeeded())).status).toBe(500);
    expect(order(h)?.sitePaymentStatus).toBe('payment-success');
    const retry = await send(h, succeeded());
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ received: true, outcome: 'applied' });
    expect(order(h)?.sitePaymentStatus).toBe('payment-success');
  });

  it('returns 5xx for a signed event with an unexpected shape rather than silently dropping it', async () => {
    const h = setup();
    expect((await send(h, envelope('evt_bad', 'payment_intent.succeeded', { id: INTENT }))).status).toBe(500);
  });

  it('concurrent deliveries of one event both succeed and the order ends paid once', async () => {
    const h = setup();
    const [a, b] = await Promise.all([send(h, succeeded()), send(h, succeeded())]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(order(h)?.sitePaymentStatus).toBe('payment-success');
    expect(h.webhookEvents.ids.size).toBe(1);
  });
});
