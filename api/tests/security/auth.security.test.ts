import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGuestTokenService } from '../../src/auth/guest-token.js';
import { Keyring } from '../../src/auth/keyring.js';
import { buildHarness, freshIp, type Harness, type MongoFixture, NOW, seedProducts, startMongo } from './support.js';

let mongo: MongoFixture;
let h: Harness;
const keyring = new Keyring([['k1', randomBytes(32)]]);

beforeAll(async () => {
  mongo = await startMongo();
  await seedProducts(mongo.db);
  h = buildHarness(mongo, { keyring });
}, 120_000);

afterAll(async () => {
  await mongo.stop();
});

/** Error bodies minus the per-request id, so two responses can be compared for equality. */
async function shape(res: Response): Promise<{ status: number; body: unknown; www: string | null }> {
  const body = (await res.json()) as { error?: { requestId?: string } };
  if (body.error) delete body.error.requestId;
  return { status: res.status, body, www: res.headers.get('www-authenticate') };
}

const get = (h2: Harness, id: string, headers: Record<string, string> = {}, ip?: string) =>
  h2.call(`/v1/orders/${id}`, { headers }, ip);
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

function b64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

describe('guest token forgery and tampering', () => {
  it('rejects a payload re-pointed at another order without re-signing', async () => {
    const a = await h.placeOrder();
    const b = await h.placeOrder();
    const [version, kid, payload, mac] = a.guestToken.split('.');
    const decoded = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as Record<string, unknown>;
    const forged = [version, kid, b64({ ...decoded, oid: b.orderId }), mac].join('.');
    const res = await get(h, b.orderId, bearer(forged));
    expect(res.status).toBe(401);
  });

  it('rejects an extended expiry', async () => {
    const a = await h.placeOrder();
    const [version, kid, payload, mac] = a.guestToken.split('.');
    const decoded = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as { exp: number };
    const forged = [version, kid, b64({ ...decoded, exp: decoded.exp + 10_000_000 }), mac].join('.');
    expect((await get(h, a.orderId, bearer(forged))).status).toBe(401);
  });

  it.each([
    ['empty mac (alg=none style)', (t: string[]) => [t[0], t[1], t[2], ''].join('.')],
    ['missing mac segment', (t: string[]) => [t[0], t[1], t[2]].join('.')],
    ['kid swapped for "none"', (t: string[]) => [t[0], 'none', t[2], t[3]].join('.')],
    ['kid __proto__', (t: string[]) => [t[0], '__proto__', t[2], t[3]].join('.')],
    ['kid constructor', (t: string[]) => [t[0], 'constructor', t[2], t[3]].join('.')],
    ['kid toString', (t: string[]) => [t[0], 'toString', t[2], t[3]].join('.')],
    ['wrong version', (t: string[]) => ['hgt2', t[1], t[2], t[3]].join('.')],
    ['extra segment', (t: string[]) => [...t, 'x'].join('.')],
    ['mac of zero bytes', () => ['hgt1', 'k1', b64({ oid: 'x' }), Buffer.alloc(32).toString('base64url')].join('.')],
    ['alg none JWT', () => [b64({ alg: 'none', typ: 'JWT' }), b64({ oid: 'x', scope: 'guest-order' }), ''].join('.')],
  ])('rejects %s', async (_name, mutate) => {
    const a = await h.placeOrder();
    const forged = mutate(a.guestToken.split('.'));
    const res = await get(h, a.orderId, bearer(forged));
    expect(res.status).toBe(401);
  });

  it('rejects a token signed by a different key that reuses the kid', async () => {
    const a = await h.placeOrder();
    const other = createGuestTokenService({ keyring: new Keyring([['k1', randomBytes(32)]]), ttlSeconds: 3600, now: () => NOW.getTime() });
    expect((await get(h, a.orderId, bearer(other.issue(a.orderId).token))).status).toBe(401);
  });

  it('rejects an expired token and a token minted in the future', async () => {
    const a = await h.placeOrder();
    const past = createGuestTokenService({ keyring, ttlSeconds: 3600, now: () => NOW.getTime() - 2 * 3600_000 });
    const future = createGuestTokenService({ keyring, ttlSeconds: 3600, now: () => NOW.getTime() + 3600_000 });
    expect((await get(h, a.orderId, bearer(past.issue(a.orderId).token))).status).toBe(401);
    expect((await get(h, a.orderId, bearer(future.issue(a.orderId).token))).status).toBe(401);
  });

  it('accepts only the exact Bearer syntax and never reads the token from query, cookie or a second header', async () => {
    const a = await h.placeOrder();
    for (const headers of [
      { authorization: a.guestToken },
      { authorization: `bearer ${a.guestToken}` },
      { authorization: `Bearer  ${a.guestToken}` },
      { authorization: `Bearer ${a.guestToken} extra` },
      { authorization: `Basic ${a.guestToken}` },
      { cookie: `token=${a.guestToken}` },
      { 'x-guest-token': a.guestToken },
    ]) {
      expect((await get(h, a.orderId, headers)).status).toBe(401);
    }
    expect((await h.call(`/v1/orders/${a.orderId}?token=${a.guestToken}`)).status).toBe(401);
    expect((await get(h, a.orderId, bearer(a.guestToken))).status).toBe(200);
  });

  it('survives absurd Authorization values without a 5xx', async () => {
    const a = await h.placeOrder();
    for (const value of ['Bearer ' + 'A'.repeat(100_000), 'Bearer ', 'Bearer a.b.c.d', 'Bearer \u0000', 'Bearer ' + '.'.repeat(600)]) {
      let status: number;
      try {
        status = (await get(h, a.orderId, { authorization: value })).status;
      } catch {
        status = 400; // the Fetch layer itself refused an illegal header value
      }
      expect(status).toBeLessThan(500);
    }
  });
});

describe('IDOR and enumeration on GET /v1/orders/:id', () => {
  it('gives an unauthenticated caller the same 401 for existing, missing and malformed order ids', async () => {
    const a = await h.placeOrder();
    const results = await Promise.all(
      [a.orderId, new ObjectId().toHexString(), 'not-an-object-id', '0'.repeat(24), '%00', 'A'.repeat(200)].map(async (id) =>
        shape(await get(h, id)),
      ),
    );
    for (const r of results) expect(r).toEqual(results[0]);
    expect(results[0]?.status).toBe(401);
  });

  it('gives a holder of ANY valid token the same 403 for another existing order and a non-existent one', async () => {
    const a = await h.placeOrder();
    const b = await h.placeOrder();
    const existing = await shape(await get(h, b.orderId, bearer(a.guestToken)));
    const missing = await shape(await get(h, new ObjectId().toHexString(), bearer(a.guestToken)));
    const malformed = await shape(await get(h, 'zzzz', bearer(a.guestToken)));
    expect(existing.status).toBe(403);
    expect(missing).toEqual(existing);
    expect(malformed).toEqual(existing);
  });

  it('never returns another customer data to a token for a different order', async () => {
    const a = await h.placeOrder({ contact: { name: 'Alice Alpha', email: 'alice.alpha@example.com', phone: '07000 000001' } });
    const b = await h.placeOrder({ contact: { name: 'Bob Bravo', email: 'bob.bravo@example.com', phone: '07000 000002' } });
    const own = await (await get(h, a.orderId, bearer(a.guestToken))).text();
    expect(own).toContain('alice.alpha@example.com');
    expect(own).not.toContain('bob.bravo');
    const cross = await (await get(h, b.orderId, bearer(a.guestToken))).text();
    expect(cross).not.toContain('bob.bravo');
    expect(cross).not.toContain('Bob');
  });

  it('answers 404 for a validly signed token whose order is a website order (not created by the app)', async () => {
    const foreign = await h.orders.insertOne({
      tracking_number: '999999999999',
      customer_email: 'site@example.com',
      customer_name: 'Site Customer',
      order_status: 'order-pending',
      payment_status: 'payment-success',
      total: 10,
      created_at: NOW,
    });
    const token = h.guestTokens.issue(foreign.insertedId.toHexString()).token;
    const res = await get(h, foreign.insertedId.toHexString(), bearer(token));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('site@example.com');
  });

  it('sends private, non-cacheable responses for every authenticated or token-bearing route', async () => {
    const a = await h.placeOrder();
    expect(a.status).toBe(201);
    const order = await get(h, a.orderId, bearer(a.guestToken));
    const lookup = await h.call('/v1/orders/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderNumber: a.orderNumber, email: 'asha@example.com' }),
    });
    const unauth = await get(h, a.orderId);
    for (const res of [order, lookup, unauth]) {
      expect(res.headers.get('cache-control')).toMatch(/no-store/);
      expect(res.headers.get('cache-control')).not.toMatch(/public/);
    }
  });
});

describe('POST /v1/orders/lookup', () => {
  const post = (body: unknown, ip?: string) =>
    h.call('/v1/orders/lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, ip);

  it('answers a missing order, a wrong contact and a website order identically', async () => {
    const a = await h.placeOrder();
    await h.orders.insertOne({
      tracking_number: '555555555555',
      customer_email: 'site@example.com',
      customer_contact: '07999 999999',
      order_status: 'order-pending',
      payment_status: 'payment-pending',
      created_at: NOW,
    });
    const missing = await shape(await post({ orderNumber: '111111111111', email: 'asha@example.com' }));
    const wrong = await shape(await post({ orderNumber: a.orderNumber, email: 'wrong@example.com' }));
    const foreignRight = await shape(await post({ orderNumber: '555555555555', email: 'site@example.com' }));
    expect(missing.status).toBe(404);
    expect(wrong).toEqual(missing);
    expect(foreignRight).toEqual(missing);
  });

  it('accepts a matching email or phone (normalised) and returns a token that opens only that order', async () => {
    const a = await h.placeOrder();
    const byEmail = await post({ orderNumber: a.orderNumber, email: ' ASHA@Example.com ' });
    expect(byEmail.status).toBe(200);
    const { orderId, guestToken } = (await byEmail.json()) as { orderId: string; guestToken: string };
    expect(orderId).toBe(a.orderId);
    expect((await get(h, orderId, bearer(guestToken))).status).toBe(200);
    const byPhone = await post({ orderNumber: a.orderNumber, phone: '+44 7123 456789' });
    expect(byPhone.status).toBe(200);
    // a wrong second factor must not be rescued by a right first one
    const mixed = await post({ orderNumber: a.orderNumber, email: 'asha@example.com', phone: '07000000000' });
    expect(mixed.status).toBe(404);
  });

  it('rejects operator objects, arrays and odd order numbers before they reach Mongo', async () => {
    for (const body of [
      { orderNumber: { $ne: null }, email: 'a@b.co' },
      { orderNumber: { $gt: '' }, email: 'a@b.co' },
      { orderNumber: ['1', '2'], email: 'a@b.co' },
      { orderNumber: '123456789012', email: { $ne: null } },
      { orderNumber: '123456789012', phone: { $regex: '.*' } },
      { orderNumber: '123456789012\u0000', email: 'a@b.co' },
      { orderNumber: '12345678901x', email: 'a@b.co' },
      { orderNumber: '123456789012', email: 'a@b.co', 'x.y': 1 },
      JSON.parse('{"orderNumber":"123456789012","email":"a@b.co","__proto__":{"a":1}}') as unknown,
    ]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('limits one IP to 5 attempts a minute', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      statuses.push((await post({ orderNumber: `4000000000${String(10 + i)}`, email: 'a@b.co' }, ip)).status);
    }
    expect(statuses.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('limits guesses per order number across rotating IPs, whether or not the order exists', async () => {
    const real = await h.placeOrder();
    for (const number of [real.orderNumber, '777000000001']) {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        statuses.push((await post({ orderNumber: number, email: 'guess@example.com' }, freshIp())).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    }
  });

  it('does not take measurably different time for a missing order, a wrong contact and a website order', async () => {
    const SAMPLES = 40;
    const mine: string[] = [];
    for (let i = 0; i < SAMPLES; i += 1) mine.push((await h.placeOrder()).orderNumber);
    const foreign: string[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const number = `8${String(i).padStart(11, '0')}`;
      foreign.push(number);
      await h.orders.insertOne({ tracking_number: number, customer_email: 'site@example.com', customer_contact: '07999 999999', created_at: NOW });
    }
    const missing = Array.from({ length: SAMPLES }, (_, i) => `9${String(i).padStart(11, '0')}`);

    async function median(numbers: string[]): Promise<number> {
      const times: number[] = [];
      for (const orderNumber of numbers) {
        const started = performance.now();
        await post({ orderNumber, email: 'nobody@example.com' }, freshIp());
        times.push(performance.now() - started);
      }
      times.sort((x, y) => x - y);
      return times[Math.floor(times.length / 2)] ?? 0;
    }

    // Warm up, then interleave nothing fancy: medians over 40 samples each.
    await median(missing.slice(0, 5).map((n) => `6${n.slice(1)}`));
    const [tMissing, tWrong, tForeign] = [await median(missing), await median(mine), await median(foreign)];
    // Not a proof (see SECURITY-AUDIT.md): it catches gross short-circuits such as skipping the comparison.
    const spread = Math.max(tMissing, tWrong, tForeign) - Math.min(tMissing, tWrong, tForeign);
    expect(spread).toBeLessThan(5);
  }, 60_000);
});
