import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentGateway } from '../../../src/domain/ports.js';
import { AppError } from '../../../src/lib/errors.js';
import { createDisabledGateway } from '../../../src/payments/stripe-gateway.js';
import { type ErrorBody, errorBody } from '../helpers.js';
import { buildHarness, type Harness, NOW, pricingFor } from './fakes.js';

const KEY = '0b0d9a4e-8f3b-4f64-9a52-3c6c1f7a2e10';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const body = () => ({
  lines: [{ productId: 'chicken-samosa', quantity: 4 }],
  contact: { name: 'Asha Patel', email: 'asha@example.com', phone: '07123 456789' },
  address: { line1: '1 High Street', city: 'London', postcode: 'sw1a 1aa' },
  slot: { date: '2026-10-28', window: 'morning' },
});

function post(h: Harness, payload: unknown, key: string | null = KEY, extra: Record<string, string> = {}) {
  return h.app.request('/v1/checkout/payment-intent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key === null ? {} : { 'idempotency-key': key }), ...extra },
    body: JSON.stringify(payload),
  });
}

interface Created {
  orderId: string;
  orderNumber: string;
  guestToken: string;
  clientSecret: string;
  pricing: { totalPence: number };
  lines: Record<string, unknown>[];
}

describe('POST /v1/checkout/payment-intent', () => {
  it('prices server-side, inserts the pending order, creates the intent and returns the contract body', async () => {
    const h = buildHarness();
    const res = await post(h, body());
    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotent-Replay')).toBeNull();
    const json = (await res.json()) as Created;

    // 4 x 450 = 1800 + 799 delivery
    expect(json.pricing.totalPence).toBe(2599);
    expect(Object.keys(json).sort()).toEqual(['clientSecret', 'guestToken', 'lines', 'orderId', 'orderNumber', 'pricing']);
    expect(json.lines).toEqual([
      { productId: 'chicken-samosa', name: 'Chicken Samosa', image: null, unitPricePence: 450, quantity: 4, lineTotalPence: 1800 },
    ]);
    expect(JSON.stringify(json)).not.toContain('sourceId');
    expect(h.deps.guestTokens.verify(json.guestToken, json.orderId)).toMatchObject({ ok: true });

    const order = h.orders.orders.get(json.orderId);
    expect(order).toMatchObject({
      sitePaymentStatus: 'payment-pending',
      paymentIntentId: 'pi_fake_000001',
      address: { postcode: 'SW1A 1AA' },
    });
    expect(order?.orderNumber).toMatch(/^\d{12}$/);
    const intent = h.gateway.intents.get('pi_fake_000001');
    expect(intent).toMatchObject({ amountPence: 2599, currency: 'gbp', orderId: json.orderId, receiptEmail: 'asha@example.com' });
    expect(json.clientSecret).toBe(intent?.clientSecret);
  });

  it('stores only the key hash and keeps secrets and PII out of logs and the idempotency record', async () => {
    const h = buildHarness();
    const json = (await (await post(h, body())).json()) as Created;
    const record = h.idempotency.records.get(sha256(KEY));
    expect(record).toBeDefined();
    expect(record?.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record?.status).toBe(201);
    expect(JSON.stringify(record)).not.toContain(json.guestToken);
    expect(JSON.stringify(record)).not.toContain(KEY);
    const logText = h.logs.text();
    for (const secret of [json.clientSecret, json.guestToken, 'asha@example.com', '07123', 'High Street', KEY]) {
      expect(logText).not.toContain(secret);
    }
  });

  it('derives the Stripe idempotency key from the key hash and the order, and passes the order total', async () => {
    const h = buildHarness();
    const spy = vi.spyOn(h.gateway, 'createPaymentIntent');
    const json = (await (await post(h, body())).json()) as Created;
    expect(spy.mock.calls[0]?.[0].idempotencyKey).toBe(`humi-pi-${sha256(KEY).slice(0, 32)}-${json.orderId}`);
    expect(spy.mock.calls[0]?.[0].idempotencyKey).not.toContain(KEY);
  });

  describe('idempotency', () => {
    it('replays the stored response with 200, the replay header and a freshly issued guest token', async () => {
      const h = buildHarness();
      const first = (await (await post(h, body())).json()) as Created;
      // Same logical request: key order, postcode case and email case differ.
      const again = { ...body(), slot: { window: 'morning', date: '2026-10-28' }, address: { ...body().address, postcode: 'SW1A1AA' } };
      const res = await post(h, again, KEY.toUpperCase());
      expect(res.status).toBe(200);
      expect(res.headers.get('Idempotent-Replay')).toBe('true');
      const replay = (await res.json()) as Created;
      expect(replay.orderId).toBe(first.orderId);
      expect(replay.clientSecret).toBe(first.clientSecret);
      expect(replay.guestToken).not.toBe('');
      expect(h.deps.guestTokens.verify(replay.guestToken, first.orderId)).toMatchObject({ ok: true });
      expect(h.orders.orders.size).toBe(1);
      expect(h.pricing.calls).toBe(1);
      expect(h.gateway.intents.size).toBe(1);
    });

    it('answers 409 idempotency_key_reuse when the same key carries a different body', async () => {
      const h = buildHarness();
      await post(h, body());
      const other = { ...body(), lines: [{ productId: 'chicken-samosa', quantity: 5 }] };
      const res = await post(h, other);
      expect(res.status).toBe(409);
      expect((await errorBody(res)).error.code).toBe('idempotency_key_reuse');
      expect(h.orders.orders.size).toBe(1);
    });

    it('refuses to replay a checkout whose order has since expired or vanished', async () => {
      const h = buildHarness();
      const first = (await (await post(h, body())).json()) as Created;
      await h.orders.applyPaymentTransition(first.orderId, { kind: 'cancelled', paymentIntentId: 'pi_fake_000001' });
      const res = await post(h, body());
      expect(res.status).toBe(409);
      expect((await errorBody(res)).error.code).toBe('checkout_expired');

      h.orders.orders.delete(first.orderId);
      expect((await errorBody(await post(h, body()))).error.code).toBe('checkout_expired');
    });

    it('does not trust a malformed stored response', async () => {
      const h = buildHarness();
      await post(h, body());
      const record = h.idempotency.records.get(sha256(KEY));
      if (!record) throw new Error('missing record');
      h.idempotency.records.set(sha256(KEY), { ...record, response: { orderId: 5 } });
      const res = await post(h, body());
      expect(res.status).toBe(500);
      expect((await errorBody(res)).error.code).toBe('internal_error');
    });

    it('10 parallel requests with one key create exactly one order, intent and claim; the rest replay it', async () => {
      const h = buildHarness();
      const responses = await Promise.all(Array.from({ length: 10 }, async () => post(h, body())));
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 200)).toHaveLength(9);
      const bodies = (await Promise.all(responses.map((r) => r.json()))) as Created[];
      expect(new Set(bodies.map((b) => b.orderId)).size).toBe(1);
      expect(new Set(bodies.map((b) => b.clientSecret)).size).toBe(1);
      expect(h.orders.orders.size).toBe(1);
      expect(h.gateway.intents.size).toBe(1);
      expect(h.idempotency.claims).toBe(1);
      expect([...h.orders.orders.values()][0]?.siteOrderStatus).toBe('order-pending');
      for (const r of responses.filter((x) => x.status === 200)) expect(r.headers.get('Idempotent-Replay')).toBe('true');
    });

    it('answers 409 idempotency_key_reuse, with no order, when a live claim holds a different body', async () => {
      const h = buildHarness();
      await h.idempotency.claim(sha256(KEY), 'different', NOW);
      const res = await post(h, body());
      expect(res.status).toBe(409);
      expect((await errorBody(res)).error.code).toBe('idempotency_key_reuse');
      expect(h.orders.orders.size).toBe(0);
    });

    it('answers 409 conflict with Retry-After if the winner is still in progress after the wait bound', async () => {
      const h = buildHarness({ checkout: { pollIntervalMs: 5, maxWaitMs: 30 } });
      const probe = buildHarness();
      await post(probe, body());
      const requestHash = probe.idempotency.records.get(sha256(KEY))?.requestHash ?? '';
      await h.idempotency.claim(sha256(KEY), requestHash, NOW);
      const res = await post(h, body());
      expect(res.status).toBe(409);
      expect((await errorBody(res)).error.code).toBe('conflict');
      expect(res.headers.get('Retry-After')).toBe('2');
      expect(h.orders.orders.size).toBe(0);
    });

    it('takes over a stale in-progress claim (older than 60 s)', async () => {
      const h = buildHarness();
      await h.idempotency.claim(sha256(KEY), 'old-hash', new Date(NOW.getTime() - 61_000));
      const res = await post(h, body());
      expect(res.status).toBe(201);
    });

    it('a loser proceeds on its own when the winner fails and releases the claim', async () => {
      const h = buildHarness();
      h.orders.failNext('insertPending');
      const [a, b] = await Promise.all([post(h, body()), post(h, body())]);
      expect([a.status, b.status].sort()).toEqual([201, 500]);
      expect(h.orders.orders.size).toBe(1);
    });

    it('conflicts rather than replaying when the claim is lost before completing', async () => {
      const h = buildHarness();
      vi.spyOn(h.idempotency, 'complete').mockResolvedValue(false);
      const res = await post(h, body());
      expect(res.status).toBe(409);
      expect([...h.orders.orders.values()][0]?.siteOrderStatus).toBe('order-cancelled');
      expect(h.gateway.intents.get('pi_fake_000001')?.status).toBe('canceled');
    });

    it('still releases the claim if releasing logs a failure', async () => {
      const h = buildHarness();
      h.orders.failNext('insertPending');
      vi.spyOn(h.idempotency, 'release').mockRejectedValue(new Error('mongo down'));
      expect((await post(h, body())).status).toBe(500);
      expect(h.logs.text()).toContain('could not release idempotency claim');
    });
  });

  describe('request validation', () => {
    it.each([
      ['missing', null],
      ['not a uuid', 'abc'],
      ['uuid v1', '0b0d9a4e-8f3b-1f64-9a52-3c6c1f7a2e10'],
    ])('rejects an Idempotency-Key that is %s with 400', async (_name, key) => {
      const h = buildHarness();
      const res = await post(h, body(), key);
      expect(res.status).toBe(400);
      const err = (await errorBody(res)).error;
      expect(err.code).toBe('validation_failed');
      expect(JSON.stringify(err.details)).toContain('Idempotency-Key');
      expect(h.orders.orders.size).toBe(0);
    });

    it('rejects invalid bodies without side effects', async () => {
      const h = buildHarness();
      for (const bad of [
        { ...body(), totalPence: 1 },
        { ...body(), lines: [] },
        { ...body(), address: { ...body().address, postcode: 'nope' } },
        { ...body(), contact: { ...body().contact, email: 'x' } },
        { ...body(), lines: [{ productId: 'a', quantity: 1, $where: '1' }] },
        { ...body(), __proto__: { admin: true }, constructor: 1 },
      ]) {
        const res = await post(h, bad);
        expect(res.status, JSON.stringify(bad)).toBe(400);
      }
      expect(h.orders.orders.size).toBe(0);
      expect(h.pricing.calls).toBe(0);
    });

    it('rejects malformed JSON and non-JSON content types', async () => {
      const h = buildHarness();
      const malformed = await h.app.request('/v1/checkout/payment-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': KEY },
        body: '{nope',
      });
      expect(malformed.status).toBe(400);
      const text = await h.app.request('/v1/checkout/payment-intent', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'idempotency-key': KEY },
        body: JSON.stringify(body()),
      });
      expect(text.status).toBe(415);
    });

    it('rejects slots in the past, beyond 14 days, and same-day windows inside the lead time', async () => {
      const h = buildHarness();
      for (const slot of [
        { date: '2026-10-25', window: 'morning' },
        { date: '2026-11-10', window: 'morning' },
        { date: '2026-10-26', window: 'morning' },
        { date: '2026-02-30', window: 'morning' },
      ]) {
        const res = await post(h, { ...body(), slot });
        expect(res.status, JSON.stringify(slot)).toBe(400);
        expect((await errorBody(res)).error.code).toBe('validation_failed');
      }
      expect((await post(h, { ...body(), slot: { date: '2026-10-26', window: 'afternoon' } }, '1b0d9a4e-8f3b-4f64-9a52-3c6c1f7a2e10')).status).toBe(201);
      expect(h.orders.orders.size).toBe(1);
    });

    it('evaluates the slot in Europe/London using the injected clock', async () => {
      // 23:30 UTC on 1 July is 00:30 on 2 July in London.
      const h = buildHarness({ now: new Date('2026-07-01T23:30:00Z') });
      const res = await post(h, { ...body(), slot: { date: '2026-07-01', window: 'evening' } });
      expect(res.status).toBe(400);
      const ok = await post(h, { ...body(), slot: { date: '2026-07-02', window: 'evening' } });
      expect(ok.status).toBe(201);
    });
  });

  describe('business rules (422)', () => {
    it('reports every unavailable line instead of dropping it', async () => {
      const h = buildHarness();
      const res = await post(h, { ...body(), lines: [{ productId: 'chicken-samosa', quantity: 1 }, { productId: 'ghost', quantity: 1 }] });
      expect(res.status).toBe(422);
      const err = (await errorBody(res)).error;
      expect(err.code).toBe('unavailable');
      expect(err.details).toEqual({ unavailable: [{ productId: 'ghost', reason: 'not_found' }] });
      expect(h.orders.orders.size).toBe(0);
    });

    it('rejects an invalid promo code', async () => {
      const h = buildHarness();
      const res = await post(h, { ...body(), promoCode: 'NOPE' });
      expect(res.status).toBe(422);
      expect((await errorBody(res)).error.code).toBe('invalid_promo');
      expect(h.orders.orders.size).toBe(0);
      const valid = await post(h, { ...body(), promoCode: 'humi15' }, '2b0d9a4e-8f3b-4f64-9a52-3c6c1f7a2e10');
      expect(valid.status).toBe(201);
      expect(((await valid.json()) as Created).pricing.totalPence).toBe(2599 - 270);
    });

    it('rejects totals below MIN_ORDER_PENCE', async () => {
      const h = buildHarness({ env: { MIN_ORDER_PENCE: '5000' } });
      const res = await post(h, body());
      expect(res.status).toBe(422);
      const err = (await errorBody(res)).error;
      expect(err.code).toBe('min_order');
      expect(err.details).toEqual({ minOrderPence: 5000, totalPence: 2599 });
      expect(h.orders.orders.size).toBe(0);
    });

    it('rejects totals Stripe cannot charge (under 30p) and empty priced baskets', async () => {
      const h = buildHarness();
      h.pricing.override = (input) => ({
        lines: [{ productId: 'chicken-samosa', sourceId: 'a'.repeat(24), name: 'x', image: null, unitPricePence: 1, quantity: input.lines[0]?.quantity ?? 1, lineTotalPence: 1 }],
        unavailable: [],
        pricing: pricingFor(10),
        promo: null,
      });
      const low = await post(h, body());
      expect(low.status).toBe(422);
      expect((await errorBody(low)).error.code).toBe('unprocessable');
      h.pricing.override = () => ({ lines: [], unavailable: [], pricing: pricingFor(0), promo: null });
      const empty = await post(h, body(), '3b0d9a4e-8f3b-4f64-9a52-3c6c1f7a2e10');
      expect(empty.status).toBe(422);
      expect(h.orders.orders.size).toBe(0);
    });

    it('answers 503 payment_provider_error before inserting anything when payments are disabled', async () => {
      const h = buildHarness({ gateway: createDisabledGateway() });
      const res = await post(h, body());
      expect(res.status).toBe(503);
      const err = (await errorBody(res)).error;
      expect(err).toMatchObject({ code: 'payment_provider_error', message: 'Payments are not configured' });
      expect(h.orders.orders.size).toBe(0);
      expect(h.pricing.calls).toBe(0);
    });
  });

  describe('failure after the order insert leaves no orphan', () => {
    const failingGateway = (h: Harness, error: Error): PaymentGateway => ({
      ...h.gateway,
      createPaymentIntent: () => Promise.reject(error),
    });

    it('cancels the order and returns the safe 502 when Stripe fails', async () => {
      const h = buildHarness();
      const stripeDown = new AppError(502, 'payment_provider_error', 'The payment provider is unavailable. Please try again.');
      const failing = buildHarness({ gateway: failingGateway(h, stripeDown) });
      const res = await post(failing, body());
      expect(res.status).toBe(502);
      expect((await errorBody(res)).error.code).toBe('payment_provider_error');
      const orders = [...failing.orders.orders.values()];
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({ siteOrderStatus: 'order-cancelled', sitePaymentStatus: 'payment-failed' });
      expect(await failing.orders.findStalePending(new Date('2100-01-01'), 10)).toHaveLength(0);
      expect(failing.idempotency.records.size).toBe(0); // claim released
      expect(failing.orders.transitions[0]?.transition).toEqual({ kind: 'cancelled', paymentIntentId: 'pi_none' });
    });

    it('wraps a non-AppError gateway failure as 502 and still cancels the order', async () => {
      const h = buildHarness();
      const failing = buildHarness({ gateway: failingGateway(h, new Error('socket hang up')) });
      const res = await post(failing, body());
      expect(res.status).toBe(502);
      expect([...failing.orders.orders.values()][0]?.siteOrderStatus).toBe('order-cancelled');
    });

    it('still returns the original error when cancelling the order also fails', async () => {
      const h = buildHarness();
      const failing = buildHarness({ gateway: failingGateway(h, new Error('down')) });
      failing.orders.failNext('applyPaymentTransition');
      const res = await post(failing, body());
      expect(res.status).toBe(502);
      expect(failing.logs.text()).toContain('expiry job will clean it up');
    });

    it('cancels both intent and order when attaching the intent fails', async () => {
      const h = buildHarness();
      h.orders.failNext('attachPaymentIntent');
      const res = await post(h, body());
      expect(res.status).toBe(500);
      expect([...h.orders.orders.values()][0]?.siteOrderStatus).toBe('order-cancelled');
      expect(h.gateway.intents.get('pi_fake_000001')?.status).toBe('canceled');
    });

    it('tolerates the intent cancellation failing during compensation', async () => {
      const h = buildHarness();
      h.orders.failNext('attachPaymentIntent');
      vi.spyOn(h.gateway, 'cancelPaymentIntent').mockRejectedValue(new Error('stripe down'));
      const res = await post(h, body());
      expect(res.status).toBe(500);
      expect([...h.orders.orders.values()][0]?.siteOrderStatus).toBe('order-cancelled');
      expect(h.logs.text()).toContain('could not cancel payment intent');
    });

    it('cancels everything when saving the idempotency record fails', async () => {
      const h = buildHarness();
      h.idempotency.failComplete = new Error('mongo down');
      const res = await post(h, body());
      expect(res.status).toBe(500);
      expect([...h.orders.orders.values()][0]?.siteOrderStatus).toBe('order-cancelled');
      expect(h.gateway.intents.get('pi_fake_000001')?.status).toBe('canceled');
    });

    it('creates no intent if the order insert fails', async () => {
      const h = buildHarness();
      h.orders.failNext('insertPending');
      const res = await post(h, body());
      expect(res.status).toBe(500);
      expect(h.gateway.intents.size).toBe(0);
    });

    it('a retry after a failed attempt gets a brand new intent, never a cancelled one', async () => {
      const h = buildHarness();
      h.idempotency.failComplete = new Error('mongo down');
      await post(h, body());
      h.idempotency.failComplete = undefined;
      const res = await post(h, body());
      expect(res.status).toBe(201);
      const created = (await res.json()) as Created;
      expect(created.clientSecret).toBe('pi_fake_000002_secret_fake');
      expect(h.gateway.intents.get('pi_fake_000002')?.status).toBe('requires_payment_method');
    });
  });

  it('rate limits to 10 requests per minute per IP, before any validation', async () => {
    const h = buildHarness();
    let last: Response | undefined;
    for (let i = 0; i < 11; i += 1) last = await post(h, { bad: true });
    expect(last?.status).toBe(429);
    const err = ((await last?.json()) as ErrorBody).error;
    expect(err.code).toBe('rate_limited');
    expect(last?.headers.get('Retry-After')).toBeTruthy();
  });
});
