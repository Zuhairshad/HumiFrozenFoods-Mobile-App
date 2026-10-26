import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { errorSignature, expectError, expectNoLeaks, expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, GUEST_TOKEN_TTL_SECONDS, type Harness } from '../../support/harness.js';
import { SITE_CUSTOMER } from '../../support/seed.js';
import type { CheckoutBody, OrderBody } from '../../support/types.js';

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

const readOrder = (order: { orderId: string }, token?: string) =>
  h.get(`/v1/orders/${order.orderId}`, token === undefined ? {} : { token });

describe('GET /v1/orders/:orderId', () => {
  it('returns the public order for the holder of its guest token', async () => {
    const created = await h.createOrder({ promoCode: 'HUMI15' });
    const res = await readOrder(created, created.guestToken);
    expect(res.status, res.text).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const order = res.json<OrderBody>();
    expect(Object.keys(order).sort()).toEqual(['address', 'contact', 'lines', 'notes', 'orderId', 'orderNumber', 'paymentStatus', 'placedAt', 'pricing', 'slot', 'status']);
    expect(order).toMatchObject({
      orderId: created.orderId,
      orderNumber: created.orderNumber,
      placedAt: h.clock.now().toISOString(),
      status: 'pending_payment',
      paymentStatus: 'pending',
      contact: { name: 'Asha Patel', email: 'asha.patel@example.com', phone: '07700 900123' },
      address: { line1: '12 Baker Street', line2: 'Flat 3', city: 'London', postcode: 'SW1A 1AA' },
      slot: { date: h.slotDate(1), window: 'afternoon' },
      notes: 'Leave with the neighbour',
    });
    expect(order.pricing).toEqual(created.pricing);
    expect(order.lines.map((l) => [l.productId, l.quantity, l.unitPricePence, l.lineTotalPence])).toEqual([
      ['aloo-tikki', 2, 730, 1460],
      ['chicken-seekh-kebab', 1, 1350, 1350],
    ]);
    // Internal fields stay internal.
    for (const forbidden of ['clientSecret', 'guestToken', 'paymentIntent', 'payment_intent', 'app_meta', 'createdByApp', 'siteOrderStatus']) {
      expect(res.text).not.toContain(forbidden);
    }
    expect(res.text).not.toContain(created.clientSecret);
    expectNoLeaks(res);
  });

  it('round-trips notes without the internal "Delivery:" line, and omits notes when none were given', async () => {
    const created = await h.createOrder({ notes: undefined });
    const order = (await readOrder(created, created.guestToken)).json<OrderBody>();
    expect(order.notes).toBeUndefined();
    expect(order.slot.date).toBe(h.slotDate(1));
  });

  it('401 without a token, with the same body whether or not the order exists', async () => {
    const created = await h.createOrder();
    const real = await readOrder(created);
    const fake = await h.get(`/v1/orders/${new ObjectId().toHexString()}`);
    const junk = await h.get('/v1/orders/not-an-id');
    for (const res of [real, fake, junk]) expectError(res, 401, 'invalid_token');
    expect(errorSignature(real)).toEqual(errorSignature(fake));
    expect(errorSignature(real)).toEqual(errorSignature(junk));
  });

  it('403 wrong_order for a valid token that belongs to a different order', async () => {
    const a = await h.createOrder();
    const b = await h.createOrder();
    const res = await readOrder(b, a.guestToken);
    expectError(res, 403, 'wrong_order');
    expect(res.text).not.toContain(b.orderNumber);
    expect(res.text).not.toContain('asha.patel');
  });

  it('401 for tampered, truncated, foreign-key, malformed and expired tokens', async () => {
    const created = await h.createOrder();
    const [version, kid, payload, mac] = created.guestToken.split('.') as [string, string, string, string];
    // Change the FIRST signature character (all 6 bits significant). Changing the last one is not a tamper:
    // its low two bits are padding, so some "edits" decode to the very same signature.
    const flippedMac = `${mac.startsWith('A') ? 'B' : 'A'}${mac.slice(1)}`;
    const forgedPayload = Buffer.from(JSON.stringify({ oid: created.orderId, scope: 'guest-order', iat: 0, exp: 9_999_999_999 })).toString('base64url');
    const tokens = [
      `${version}.${kid}.${payload}.${flippedMac}`,
      `${version}.${kid}.${forgedPayload}.${mac}`,
      `${version}.other.${payload}.${mac}`,
      `${version}.${kid}.${payload}`,
      created.guestToken.slice(0, -5),
      `${created.guestToken}x`,
      'garbage',
      'a.b.c.d',
      'x'.repeat(600),
    ];
    for (const token of tokens) expectError(await readOrder(created, token), 401, 'invalid_token');
    // Non-bearer schemes and doubled headers are refused too.
    expectError(await h.get(`/v1/orders/${created.orderId}`, { headers: { authorization: `Basic ${created.guestToken}` } }), 401);
    expectError(await h.get(`/v1/orders/${created.orderId}`, { headers: { authorization: created.guestToken } }), 401);
    // The untouched token still works.
    expect((await readOrder(created, created.guestToken)).status).toBe(200);
  });

  it('401 once the token has expired, and a replay re-issues a working one', async () => {
    const created = await h.createOrder();
    h.clock.advance((GUEST_TOKEN_TTL_SECONDS - 1) * 1000);
    expect((await readOrder(created, created.guestToken)).status).toBe(200);
    h.clock.advance(2000);
    expectError(await readOrder(created, created.guestToken), 401, 'invalid_token');
    // Lookup (order number + contact) is the recovery path for an expired token.
    const lookup = await h.post('/v1/orders/lookup', { orderNumber: created.orderNumber, email: 'asha.patel@example.com' });
    expect(lookup.status).toBe(200);
    expect((await readOrder(created, lookup.json<{ guestToken: string }>().guestToken)).status).toBe(200);
  });

  it('404 even with a valid token when the id is not an app order (website orders are never readable)', async () => {
    const website = await h.db.collection('orders').findOne({ tracking_number: '482915037264' });
    const id = String(website?.['_id']);
    const token = h.deps.guestTokens.issue(id).token; // only possible with the server key
    const res = await h.get(`/v1/orders/${id}`, { token });
    expectError(res, 404, 'not_found');
    expect(res.text).not.toContain('Sam');
    expect(res.text).not.toContain('sam.site');
    // Likewise for a well-formed id that does not exist.
    const ghost = new ObjectId().toHexString();
    expectError(await h.get(`/v1/orders/${ghost}`, { token: h.deps.guestTokens.issue(ghost).token }), 404, 'not_found');
  });

  it('reports the order lifecycle through status/paymentStatus as payments and staff move it along', async () => {
    const order = await h.createOrder();
    const status = async (): Promise<[string, string]> => {
      const body = (await readOrder(order, order.guestToken)).json<OrderBody>();
      return [body.status, body.paymentStatus];
    };
    expect(await status()).toEqual(['pending_payment', 'pending']);
    await h.deliver(h.paymentEvent('payment_intent.payment_failed', order));
    expect(await status()).toEqual(['pending_payment', 'failed']);
    await h.pay(order);
    expect(await status()).toEqual(['placed', 'paid']);
    for (const [siteStatus, expected] of [
      ['order-processing', 'preparing'],
      ['order-at-local-facility', 'preparing'],
      ['order-out-for-delivery', 'out-for-delivery'],
      ['order-completed', 'delivered'],
    ] as const) {
      await h.staffSetOrderStatus(order.orderId, siteStatus);
      expect(await status()).toEqual([expected, 'paid']);
    }
    // A redelivered success must not drag a completed order back.
    await h.deliver(h.paymentEvent('payment_intent.succeeded', order));
    expect((await h.requireOrderDoc(order.orderId))['order_status']).toBe('order-completed');
  });

  it('tolerates hand-edited admin data without a 500', async () => {
    const order = await h.createOrder();
    await h.db.collection('orders').updateOne(
      { _id: new ObjectId(order.orderId) },
      { $set: { order_status: 'order-banana', payment_status: 'payment-mystery', note: 42, delivery_fee: '7.99' } },
    );
    const res = await readOrder(order, order.guestToken);
    expect(res.status, res.text).toBe(200);
    expect(res.json<OrderBody>()).toMatchObject({ status: 'pending_payment', paymentStatus: 'pending' });
  });
});

describe('POST /v1/orders/lookup', () => {
  async function fresh(contact: Partial<{ name: string; email: string; phone: string }> = {}): Promise<CheckoutBody & { key: string }> {
    return h.createOrder({ contact: { name: 'Asha Patel', email: 'Asha.Patel@Example.com', phone: '07700 900123', ...contact } });
  }
  const lookup = (body: unknown, ip?: string) => h.post('/v1/orders/lookup', body, ip === undefined ? {} : { ip });

  it('issues a working guest token for the correct order number and email', async () => {
    const order = await fresh();
    const res = await lookup({ orderNumber: order.orderNumber, email: 'asha.patel@example.com' });
    expect(res.status, res.text).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = res.json<{ orderId: string; guestToken: string }>();
    expect(Object.keys(body).sort()).toEqual(['guestToken', 'orderId']);
    expect(body.orderId).toBe(order.orderId);
    const read = await readOrder(order, body.guestToken);
    expect(read.status).toBe(200);
    expect(read.json<OrderBody>().orderNumber).toBe(order.orderNumber);
  });

  it('matches email case-insensitively and ignores surrounding whitespace', async () => {
    const order = await fresh();
    for (const email of ['ASHA.PATEL@EXAMPLE.COM', 'asha.patel@example.com', '  Asha.Patel@Example.Com  ']) {
      expect((await lookup({ orderNumber: order.orderNumber, email })).status, email).toBe(200);
    }
  });

  it.each([
    '07700 900123',
    '07700900123',
    '+44 7700 900123',
    '+447700900123',
    '(077) 00-900123',
    ' 07700-900-123 ',
  ])('matches the phone number written as %s', async (phone) => {
    const order = await fresh();
    expect((await lookup({ orderNumber: order.orderNumber, phone })).status).toBe(200);
  });

  it('requires every supplied contact field to match', async () => {
    const order = await fresh();
    expect((await lookup({ orderNumber: order.orderNumber, email: 'asha.patel@example.com', phone: '07700 900123' })).status).toBe(200);
    expect((await lookup({ orderNumber: order.orderNumber, email: 'asha.patel@example.com', phone: '07700 900999' })).status).toBe(404);
    expect((await lookup({ orderNumber: order.orderNumber, email: 'someone@else.com', phone: '07700 900123' })).status).toBe(404);
  });

  it('a wrong contact and an unknown order number are indistinguishable', async () => {
    const order = await fresh();
    const wrongEmail = await lookup({ orderNumber: order.orderNumber, email: 'nobody@example.com' });
    const wrongPhone = await lookup({ orderNumber: order.orderNumber, phone: '07999 999999' });
    const unknownNumber = await lookup({ orderNumber: '999999999999', email: 'asha.patel@example.com' });
    const unknownNumberPhone = await lookup({ orderNumber: '999999999998', phone: '07700 900123' });
    for (const res of [wrongEmail, wrongPhone, unknownNumber, unknownNumberPhone]) expectError(res, 404, 'not_found');
    const signature = errorSignature(wrongEmail);
    for (const res of [wrongPhone, unknownNumber, unknownNumberPhone]) expect(errorSignature(res)).toEqual(signature);
    // Even the byte length of the body matches once the per-request id is removed.
    const normalised = (res: { text: string }): string => res.text.replace(/"requestId":"[^"]+"/, '"requestId":"-"');
    expect(normalised(wrongEmail)).toBe(normalised(unknownNumber));
    expect(normalised(wrongPhone)).toBe(normalised(unknownNumberPhone));
    expect(wrongEmail.text).not.toContain(order.orderId);
  });

  it('does not accept a partial email or phone (no prefix/suffix/regex matching)', async () => {
    const order = await fresh();
    for (const email of ['asha.patel@example.co', 'sha.patel@example.com', 'asha.patel@example.com.evil.io']) {
      expect((await lookup({ orderNumber: order.orderNumber, email })).status, email).toBe(404);
    }
    expect((await lookup({ orderNumber: order.orderNumber, phone: '900123' })).status).toBe(400); // too short to be a phone
    expect((await lookup({ orderNumber: order.orderNumber, phone: '07700 900124' })).status).toBe(404);
  });

  it('rejects malformed input with 400 (never 500) and ignores operator injection', async () => {
    for (const body of [
      {},
      { orderNumber: '123456789012' },
      { orderNumber: 'ABC', email: 'a@b.co' },
      { orderNumber: { $ne: null }, email: 'a@b.co' },
      { orderNumber: '123456789012', email: { $ne: null } },
      { orderNumber: '123456789012', email: 'not-an-email' },
      { orderNumber: '123456789012', phone: '1' },
      { orderNumber: '1'.repeat(30), email: 'a@b.co' },
      { orderNumber: '123456789012', email: 'a@b.co', extra: 1 },
    ]) {
      const res = await lookup(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expectError(res, 400);
    }
  });

  it('never returns website-created orders, with the same answer as for a missing order', async () => {
    const missing = await lookup({ orderNumber: '999999999997', email: SITE_CUSTOMER.email });
    const byEmail = await lookup({ orderNumber: '482915037264', email: SITE_CUSTOMER.email });
    const byPhone = await lookup({ orderNumber: '482915037264', phone: SITE_CUSTOMER.phone });
    const both = await lookup({ orderNumber: '482915037264', email: SITE_CUSTOMER.email, phone: SITE_CUSTOMER.phone });
    const second = await lookup({ orderNumber: '175000012399', email: 'priya.web@example.com' });
    const pending = await lookup({ orderNumber: '660011223344', email: 'old.pending@example.com' });
    for (const res of [missing, byEmail, byPhone, both, second, pending]) {
      expectError(res, 404, 'not_found');
      expect(errorSignature(res)).toEqual(errorSignature(missing));
      expect(res.text).not.toContain('guestToken');
    }
  });

  it('rate limits to 5 per minute per IP (429 + Retry-After) and recovers', async () => {
    const ip = '192.0.2.10';
    const body = { orderNumber: '999999999996', email: 'nobody@example.com' };
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await lookup(body, ip)).status);
    expect(statuses).toEqual([404, 404, 404, 404, 404]);
    const limited = await lookup(body, ip);
    expectError(limited, 429, 'rate_limited');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(limited.headers.get('ratelimit-remaining')).toBe('0');
    // A correct lookup from the throttled IP is refused too: no oracle through the limit.
    const order = await fresh();
    expectError(await lookup({ orderNumber: order.orderNumber, email: 'asha.patel@example.com' }, ip), 429, 'rate_limited');
    expect((await lookup(body, '192.0.2.11')).status).toBe(404);
    h.clock.advanceMinutes(1.1);
    expect((await lookup(body, ip)).status).toBe(404);
  });

  it('rate limits guessing of one order number across many IPs: 10 per hour per order number', async () => {
    const order = await fresh();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await lookup({ orderNumber: order.orderNumber, email: `guess${String(i)}@example.com` })).status);
    expect(statuses).toEqual([...Array.from({ length: 10 }, () => 404), 429, 429]);
    // Even the right contact is refused now: the budget is per order number, not per answer.
    expectError(await lookup({ orderNumber: order.orderNumber, email: 'asha.patel@example.com' }), 429, 'rate_limited');
    // A different order number is unaffected, and the budget returns after an hour.
    const other = await fresh();
    expect((await lookup({ orderNumber: other.orderNumber, email: 'asha.patel@example.com' })).status).toBe(200);
    h.clock.advanceMinutes(61);
    expect((await lookup({ orderNumber: order.orderNumber, email: 'asha.patel@example.com' })).status).toBe(200);
  });
});
