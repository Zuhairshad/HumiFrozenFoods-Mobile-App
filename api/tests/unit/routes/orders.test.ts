import * as nodeCrypto from 'node:crypto';
import type * as NodeCrypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { createGuestTokenService, type GuestTokenService } from '../../../src/auth/guest-token.js';
import { Keyring } from '../../../src/auth/keyring.js';
import { randomBytes } from 'node:crypto';
import { errorBody } from '../helpers.js';
import { buildOrdersApp } from '../orders/app-fixture.js';
import { type FakeOrders, fakeOrders, newOrder, storedWebsiteOrder } from '../orders/fixtures.js';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeCrypto>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

function build(options: { orders?: FakeOrders; guestTokens?: GuestTokenService; env?: Record<string, string> } = {}) {
  const orders = options.orders ?? fakeOrders();
  return { ...buildOrdersApp({ ...options, orders }), orders };
}

async function seed(env?: Record<string, string>) {
  const ctx = build(env ? { env } : {});
  const order = await ctx.orders.insertPending(newOrder());
  return { ...ctx, order };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const post = (app: ReturnType<typeof build>['app'], body: unknown, ip = '10.0.0.1') =>
  app.request('/v1/orders/lookup', { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('GET /v1/orders/:orderId', () => {
  it('returns the public order for a matching token', async () => {
    const { app, order, guestTokens } = await seed();
    const res = await app.request(`/v1/orders/${order.orderId}`, { headers: bearer(guestTokens.issue(order.orderId).token) });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ orderId: order.orderId, orderNumber: '123456789012', status: 'pending_payment', paymentStatus: 'pending' });
    expect(Object.keys(body)).not.toEqual(expect.arrayContaining(['siteOrderStatus', 'paymentIntentId', 'createdByApp']));
    expect(JSON.stringify(body)).not.toMatch(/siteOrderStatus|sitePaymentStatus|paymentIntentId|createdByApp|client_secret/);
  });

  it('never reveals the payment intent id', async () => {
    const { app, orders, order, guestTokens } = await seed();
    orders.seed({ ...order, paymentIntentId: 'pi_super_secret' });
    const res = await app.request(`/v1/orders/${order.orderId}`, { headers: bearer(guestTokens.issue(order.orderId).token) });
    expect(await res.text()).not.toContain('pi_super_secret');
  });

  it.each([
    ['no header', undefined],
    ['wrong scheme', 'Basic abc'],
    ['garbage', 'Bearer abc.def'],
    ['empty', 'Bearer '],
    ['injection object as header text', 'Bearer {"$ne":""}'],
  ])('401 for %s', async (_label, header) => {
    const { app, order } = await seed();
    const res = await app.request(`/v1/orders/${order.orderId}`, header ? { headers: { authorization: header } } : undefined);
    expect(res.status).toBe(401);
    expect((await errorBody(res)).error.code).toBe('invalid_token');
  });

  it('401 for an expired token and a token signed by an unknown key', async () => {
    const { app, order } = await seed();
    let nowMs = Date.now();
    const clocked = createGuestTokenService({ keyring: new Keyring([['t1', randomBytes(32)]]), ttlSeconds: 60, now: () => nowMs });
    const other = build({ guestTokens: clocked });
    const created = await other.orders.insertPending(newOrder());
    const { token } = clocked.issue(created.orderId);
    nowMs += 61_000;
    expect((await other.app.request(`/v1/orders/${created.orderId}`, { headers: bearer(token) })).status).toBe(401);
    expect((await app.request(`/v1/orders/${order.orderId}`, { headers: bearer(token) })).status).toBe(401);
  });

  it('401 for a replayed token whose signature was altered', async () => {
    const { app, order, guestTokens } = await seed();
    const { token } = guestTokens.issue(order.orderId);
    const tampered = `${token.slice(0, -2)}${token.endsWith('AA') ? 'BB' : 'AA'}`;
    expect((await app.request(`/v1/orders/${order.orderId}`, { headers: bearer(tampered) })).status).toBe(401);
  });

  it('403 for a valid token issued for another order', async () => {
    const { app, order, orders, guestTokens } = await seed();
    const other = await orders.insertPending(newOrder({ orderNumber: '999999999999' }));
    const res = await app.request(`/v1/orders/${order.orderId}`, { headers: bearer(guestTokens.issue(other.orderId).token) });
    expect(res.status).toBe(403);
    expect((await errorBody(res)).error.code).toBe('wrong_order');
  });

  it('does not touch the repository for any rejected request', async () => {
    const { app, order, orders, guestTokens } = await seed();
    const calls = orders.calls;
    await app.request(`/v1/orders/${order.orderId}`);
    await app.request(`/v1/orders/${order.orderId}`, { headers: bearer(guestTokens.issue('other-order').token) });
    expect(calls).toEqual([]);
  });

  it('404 for an unknown order with a valid-looking token', async () => {
    const { app, guestTokens } = await seed();
    const id = new ObjectId().toHexString();
    const res = await app.request(`/v1/orders/${id}`, { headers: bearer(guestTokens.issue(id).token) });
    expect(res.status).toBe(404);
    expect((await errorBody(res)).error.code).toBe('not_found');
  });

  it('404 when the token id is not an ObjectId, without querying', async () => {
    const { app, orders, guestTokens } = await seed();
    const res = await app.request('/v1/orders/not_an_object_id', { headers: bearer(guestTokens.issue('not_an_object_id').token) });
    expect(res.status).toBe(404);
    expect(orders.calls).toEqual([]);
  });

  it('404 for a website order even with a validly signed token', async () => {
    const { app, orders, guestTokens } = await seed();
    const site = storedWebsiteOrder();
    orders.seed(site);
    const res = await app.request(`/v1/orders/${site.orderId}`, { headers: bearer(guestTokens.issue(site.orderId).token) });
    expect(res.status).toBe(404);
  });
});

describe('POST /v1/orders/lookup', () => {
  it('issues a token for matching email (case-insensitive) and the token opens that order', async () => {
    const { app, order } = await seed();
    const res = await post(app, { orderNumber: order.orderNumber, email: '  ADA@example.COM ' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orderId: string; guestToken: string };
    expect(Object.keys(body).sort()).toEqual(['guestToken', 'orderId']);
    expect(body.orderId).toBe(order.orderId);
    const read = await app.request(`/v1/orders/${body.orderId}`, { headers: bearer(body.guestToken) });
    expect(read.status).toBe(200);
  });

  it.each(['07700 900123', '+44 7700-900123', '(0)7700900123'])('matches phone %s by last ten digits', async (phone) => {
    const { app, order } = await seed();
    expect((await post(app, { orderNumber: order.orderNumber, phone })).status).toBe(200);
  });

  it('requires both fields to match when both are given', async () => {
    const { app, order } = await seed();
    expect((await post(app, { orderNumber: order.orderNumber, email: 'ada@example.com', phone: '07700 900123' })).status).toBe(200);
    expect((await post(app, { orderNumber: order.orderNumber, email: 'ada@example.com', phone: '07700 000000' })).status).toBe(404);
  });

  it('answers identically for no such order, wrong contact and a website order', async () => {
    const { app, orders, order } = await seed();
    const site = storedWebsiteOrder();
    orders.seed(site);
    const missing = await post(app, { orderNumber: '000000000001', email: 'ada@example.com' });
    const wrong = await post(app, { orderNumber: order.orderNumber, email: 'eve@example.com' });
    const website = await post(app, { orderNumber: site.orderNumber, email: site.contact.email });
    for (const res of [missing, wrong, website]) expect(res.status).toBe(404);
    const bodies = await Promise.all([missing, wrong, website].map(async (r) => (await errorBody(r)).error));
    const normalised = bodies.map((b) => ({ code: b.code, message: b.message }));
    expect(normalised[1]).toEqual(normalised[0]);
    expect(normalised[2]).toEqual(normalised[0]);
    expect(normalised[0]).toMatchObject({ code: 'not_found', message: 'Order not found' });
  });

  it('runs the same constant-time comparisons for a miss as for a mismatch', async () => {
    const compare = vi.mocked(nodeCrypto.timingSafeEqual);
    const { app, order } = await seed();
    const count = async (body: Record<string, string>) => {
      compare.mockClear();
      await post(app, body);
      return compare.mock.calls.length;
    };
    const miss = await count({ orderNumber: '000000000002', email: 'a@b.co' });
    const mismatch = await count({ orderNumber: order.orderNumber, email: 'a@b.co' });
    expect(miss).toBe(1);
    expect(mismatch).toBe(miss);
    const missBoth = await count({ orderNumber: '000000000002', email: 'a@b.co', phone: '07700900123' });
    const mismatchBoth = await count({ orderNumber: order.orderNumber, email: 'a@b.co', phone: '07700900123' });
    expect(missBoth).toBe(2);
    expect(mismatchBoth).toBe(missBoth);
  });

  it('does not log contact details or order numbers', async () => {
    const lines: string[] = [];
    const { app, order } = await seed();
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });
    await post(app, { orderNumber: order.orderNumber, email: 'ada@example.com' });
    await post(app, { orderNumber: order.orderNumber, email: 'eve@example.com' });
    spy.mockRestore();
    expect(lines.join('')).not.toMatch(/ada@example|eve@example|123456789012/);
  });

  describe('input hardening', () => {
    const bad: [string, unknown][] = [
      ['operator in orderNumber', { orderNumber: { $ne: '' }, email: 'a@b.co' }],
      ['operator in email', { orderNumber: '123456789012', email: { $ne: '' } }],
      ['operator in phone', { orderNumber: '123456789012', phone: { $gt: '' } }],
      ['nested operator', { orderNumber: '123456789012', email: 'a@b.co', extra: { $where: '1' } }],
      ['dotted key', { orderNumber: '123456789012', 'email.x': 'a@b.co' }],
      ['proto key', JSON.parse('{"orderNumber":"1","email":"a@b.co","__proto__":{"x":1}}') as unknown],
      ['unknown field', { orderNumber: '123456789012', email: 'a@b.co', admin: true }],
      ['array orderNumber', { orderNumber: ['1'], email: 'a@b.co' }],
      ['number orderNumber', { orderNumber: 123456789012, email: 'a@b.co' }],
      ['no contact', { orderNumber: '123456789012' }],
      ['empty strings', { orderNumber: '123456789012', email: '', phone: '' }],
      ['letters in orderNumber', { orderNumber: '12AB', email: 'a@b.co' }],
      ['regex in orderNumber', { orderNumber: '.*', email: 'a@b.co' }],
      ['oversize orderNumber', { orderNumber: '1'.repeat(25), email: 'a@b.co' }],
      ['oversize email', { orderNumber: '1', email: `${'a'.repeat(250)}@b.co` }],
      ['bad email', { orderNumber: '1', email: 'not-an-email' }],
      ['short phone', { orderNumber: '1', phone: '123' }],
      ['phone without digits', { orderNumber: '1', phone: '+++-----(' }],
      ['phone with letters', { orderNumber: '1', phone: '0770abc9001' }],
      ['control chars', { orderNumber: '12\n34', email: 'a@b.co' }],
      ['array body', [{ orderNumber: '1', email: 'a@b.co' }]],
      ['null body', 'null'],
      ['malformed json', '{"orderNumber":'],
    ];
    it.each(bad)('400 for %s, before any lookup', async (_label, body) => {
      const { app, orders } = await seed();
      const res = await post(app, body);
      expect(res.status).toBe(400);
      expect(orders.calls).toEqual([]);
    });

    it('415 for a non-JSON content type', async () => {
      const { app } = await seed();
      const res = await app.request('/v1/orders/lookup', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
      expect(res.status).toBe(415);
    });

    it('413 for an oversize body', async () => {
      const { app } = await seed();
      const res = await post(app, JSON.stringify({ orderNumber: '1', email: 'a@b.co', pad: 'x'.repeat(200_000) }));
      expect(res.status).toBe(413);
    });

    it('only ever passes validated strings to the repository', async () => {
      const { app, deps } = await seed();
      const spy = vi.spyOn(deps.orders, 'findByOrderNumber');
      await post(app, { orderNumber: ' 12-34 ', email: 'a@b.co' });
      expect(spy).toHaveBeenCalledWith('12-34');
    });
  });

  describe('rate limits', () => {
    it('allows 5 per minute per IP, then 429 with Retry-After', async () => {
      const { app } = await seed();
      for (let i = 0; i < 5; i += 1) expect((await post(app, { orderNumber: `10000000000${String(i)}`, email: 'a@b.co' }, '1.1.1.1')).status).toBe(404);
      const limited = await post(app, { orderNumber: '100000000009', email: 'a@b.co' }, '1.1.1.1');
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      expect((await errorBody(limited)).error.code).toBe('rate_limited');
      expect((await post(app, { orderNumber: '100000000009', email: 'a@b.co' }, '2.2.2.2')).status).toBe(404);
    });

    it('counts invalid requests against the IP budget too', async () => {
      const { app } = await seed();
      for (let i = 0; i < 5; i += 1) expect((await post(app, { nope: true }, '3.3.3.3')).status).toBe(400);
      expect((await post(app, { orderNumber: '1', email: 'a@b.co' }, '3.3.3.3')).status).toBe(429);
    });

    it('allows 10 per hour per order number across IPs, then 429', async () => {
      const { app } = await seed();
      for (let i = 0; i < 10; i += 1) expect((await post(app, { orderNumber: '777777777777', email: 'a@b.co' }, `9.9.9.${String(i)}`)).status).toBe(404);
      const limited = await post(app, { orderNumber: '777777777777', email: 'a@b.co' }, '9.9.9.200');
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(60);
      expect((await post(app, { orderNumber: '777777777778', email: 'a@b.co' }, '9.9.9.201')).status).toBe(404);
    });

    it('applies the per-number budget before the lookup runs', async () => {
      const { app, deps } = await seed();
      const spy = vi.spyOn(deps.orders, 'findByOrderNumber');
      for (let i = 0; i < 10; i += 1) await post(app, { orderNumber: '888888888888', email: 'a@b.co' }, `8.8.8.${String(i)}`);
      spy.mockClear();
      await post(app, { orderNumber: '888888888888', email: 'a@b.co' }, '8.8.8.99');
      expect(spy).not.toHaveBeenCalled();
    });

    it('fails closed when the limiter store breaks', async () => {
      const { app, deps } = await seed();
      vi.spyOn(deps.rateLimitStore, 'hit').mockRejectedValue(new Error('redis down'));
      const res = await post(app, { orderNumber: '1', email: 'a@b.co' });
      expect(res.status).toBe(500);
    });
  });
});
