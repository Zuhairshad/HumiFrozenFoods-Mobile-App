import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectError, expectNoLeaks, expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, type Harness } from '../../support/harness.js';
import type { CheckoutBody, ProductBody, QuoteBody } from '../../support/types.js';

let h: Harness;
let disabled: Harness;

beforeAll(async () => {
  h = await createHarness();
  disabled = await createHarness({ payments: 'disabled' });
  await h.addProduct({ slug: 'e2e-last-3', name: 'E2E LAST THREE', price: 2, quantity: 3 });
  await h.addProduct({ slug: 'e2e-penny', name: 'E2E TENPENCE', price: 0.1 });
  await h.addProduct({ slug: 'e2e-draft', name: 'E2E DRAFT', status: 'draft' });
}, 180_000);

afterAll(async () => {
  await expectSiteDataIntact(h);
  await expectSiteDataIntact(disabled);
  await h.close();
  await disabled.close();
});

beforeEach(() => {
  h.clock.reset();
  h.control.failCreate = null;
  h.control.failCancel = null;
});

describe('happy path', () => {
  it('creates a pending order in the site `orders` collection and a PaymentIntent for the quoted total', async () => {
    const before = await h.countOrders();
    const quote = (
      await h.post('/v1/checkout/quote', {
        lines: [
          { productId: 'aloo-tikki', quantity: 2 },
          { productId: 'chicken-seekh-kebab', quantity: 1 },
        ],
      })
    ).json<QuoteBody>();

    const { res } = await h.checkout();
    expect(res.status, res.text).toBe(201);
    expect(res.headers.get('idempotent-replay')).toBeNull();
    const body = res.json<CheckoutBody>();

    // --- HTTP response
    expect(Object.keys(body).sort()).toEqual(['clientSecret', 'guestToken', 'lines', 'orderId', 'orderNumber', 'pricing']);
    expect(body.orderId).toMatch(/^[0-9a-f]{24}$/);
    expect(body.orderNumber).toMatch(/^\d{12}$/);
    expect(body.pricing).toEqual(quote.pricing);
    expect(body.pricing.totalPence).toBe(3609); // 2 x 730 + 1350 + 799
    // The quote's lines additionally carry `sourceId` (the public product ObjectId); the checkout response omits it.
    expect(body.lines).toEqual(quote.lines.map((line) => Object.fromEntries(Object.entries(line).filter(([k]) => k !== 'sourceId'))));
    for (const line of body.lines) expect(line).not.toHaveProperty('sourceId');
    expect(body.clientSecret).toMatch(/^pi_fake_\d+_secret_fake$/);
    expect(h.deps.guestTokens.verify(body.guestToken, body.orderId)).toMatchObject({ ok: true });
    expectNoLeaks(res);

    // --- PaymentIntent
    const intent = h.gateway.intents.get(h.intentIdFor(body.orderId));
    expect(intent).toMatchObject({
      amountPence: 3609,
      currency: 'gbp',
      orderId: body.orderId,
      orderNumber: body.orderNumber,
      receiptEmail: 'asha.patel@example.com',
      status: 'requires_payment_method',
    });

    // --- database
    expect(await h.countOrders()).toBe(before + 1);
    const doc = await h.requireOrderDoc(body.orderId);
    const aloo = (await h.get('/v1/products/aloo-tikki')).json<ProductBody>();
    const seekh = (await h.get('/v1/products/chicken-seekh-kebab')).json<ProductBody>();
    expect(doc).toMatchObject({
      tracking_number: body.orderNumber,
      amount: 28.1,
      sales_tax: 0,
      delivery_fee: 7.99,
      discount: 0,
      paid_total: 36.09,
      total: 36.09,
      coupon_id: null,
      delivery_method: 'shipping',
      store_id: null,
      pickup_location: null,
      customer_contact: '07700 900123',
      customer_name: 'Asha Patel',
      first_name: 'Asha',
      last_name: 'Patel',
      customer_email: 'asha.patel@example.com',
      payment_gateway: 'STRIPE',
      payment_sub_gateway: '',
      use_wallet_points: false,
      isFullWalletPayment: false,
      language: 'en',
      order_status: 'order-pending',
      payment_status: 'payment-pending',
    });
    expect(doc['tracking_number']).toMatch(/^\d{12}$/);
    expect(doc['note']).toBe('Leave with the neighbour\nDelivery: ' + h.slotDate(1) + ' afternoon');
    const products = doc['products'] as Record<string, unknown>[];
    expect(products).toHaveLength(2);
    expect(products[0]?.['product_id']).toBeInstanceOf(ObjectId);
    expect((products[0]?.['product_id'] as ObjectId).toHexString()).toBe(aloo.sourceId);
    expect((products[1]?.['product_id'] as ObjectId).toHexString()).toBe(seekh.sourceId);
    expect(products[0]).toMatchObject({ order_quantity: 2, unit_price: 7.3, subtotal: 14.6, name: 'ALOO TIKKI' });
    expect(products[1]).toMatchObject({ order_quantity: 1, unit_price: 13.5, subtotal: 13.5 });
    for (const p of products) {
      // Pounds as numbers that are exact to the penny.
      for (const field of ['unit_price', 'subtotal'] as const) {
        expect(typeof p[field]).toBe('number');
        expect(Math.round((p[field] as number) * 100) / 100).toBe(p[field]);
        expect(Number.isInteger(Math.round((p[field] as number) * 100))).toBe(true);
      }
    }
    expect(doc['shipping_address']).toEqual({ city: 'London', country: '', street_address: '12 Baker Street, Flat 3', post_code: 'SW1A 1AA', location: null });
    expect(doc['billing_address']).toEqual(doc['shipping_address']);
    expect(doc['payment_intent']).toEqual({ id: intent?.id, client_secret_redacted: true });
    expect(doc['created_at']).toEqual(h.clock.now());
    expect(doc['updated_at']).toBeInstanceOf(Date);
    expect(doc['app_meta']).toMatchObject({
      source: 'mobile-app',
      slot: { date: h.slotDate(1), window: 'afternoon' },
      promo_code: null,
      product_slugs: ['aloo-tikki', 'chicken-seekh-kebab'],
      address_line2: 'Flat 3',
    });
    expect(JSON.stringify(doc)).not.toContain(body.clientSecret);
    expect(JSON.stringify(doc)).not.toContain(body.guestToken);
  });

  it('applies a promo code, stores the code and the discount, and charges the discounted total', async () => {
    const { res } = await h.checkout({ promoCode: 'humi15' });
    expect(res.status, res.text).toBe(201);
    const body = res.json<CheckoutBody>();
    expect(body.pricing).toMatchObject({ subtotalPence: 2810, discountPence: 422, deliveryPence: 799, totalPence: 3187, promoCode: 'HUMI15' });
    const doc = await h.requireOrderDoc(body.orderId);
    expect(doc).toMatchObject({ amount: 28.1, discount: 4.22, delivery_fee: 7.99, total: 31.87, paid_total: 31.87 });
    expect(doc['app_meta']).toMatchObject({ promo_code: 'HUMI15' });
    expect(h.gateway.intents.get(h.intentIdFor(body.orderId))?.amountPence).toBe(3187);
  });

  it('gives free delivery at the threshold and charges nothing for delivery', async () => {
    const { res } = await h.checkout({ lines: [{ productId: 'chicken-chapli-kebab', quantity: 4 }] }); // 4 x 1400 = 5600
    const body = res.json<CheckoutBody>();
    expect(body.pricing).toMatchObject({ subtotalPence: 5600, deliveryPence: 0, totalPence: 5600 });
    expect(await h.requireOrderDoc(body.orderId)).toMatchObject({ delivery_fee: 0, total: 56 });
  });

  it('stores one decimal place cleanly for awkward float prices', async () => {
    const body = await h.createOrder({ lines: [{ productId: 'e2e-penny', quantity: 3 }, { productId: 'aloo-tikki', quantity: 1 }] });
    const doc = await h.requireOrderDoc(body.orderId);
    const penny = (doc['products'] as Record<string, unknown>[])[0];
    expect(penny).toMatchObject({ unit_price: 0.1, subtotal: 0.3 });
    expect(body.pricing.subtotalPence).toBe(30 + 730);
  });

  it('keeps the order retrievable for the guest straight away', async () => {
    const created = await h.createOrder();
    const res = await h.get(`/v1/orders/${created.orderId}`, { token: created.guestToken });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({
      orderId: created.orderId,
      orderNumber: created.orderNumber,
      status: 'pending_payment',
      paymentStatus: 'pending',
      pricing: created.pricing,
    });
  });

  it('allocates distinct order numbers and intents for distinct orders', async () => {
    const [a, b] = [await h.createOrder(), await h.createOrder()];
    expect(a.orderId).not.toBe(b.orderId);
    expect(a.orderNumber).not.toBe(b.orderNumber);
    expect(a.clientSecret).not.toBe(b.clientSecret);
  });

  it('normalises contact and address input', async () => {
    const created = await h.createOrder({
      contact: { name: '  Jo   Bloggs ', email: ' JO@Example.COM ', phone: ' +44 (0)7700 900124 ' },
      address: { line1: ' 1 High St ', city: ' Leeds ', postcode: ' ls1  4ab ' },
      notes: '   ',
    });
    const doc = await h.requireOrderDoc(created.orderId);
    expect(doc).toMatchObject({ customer_email: 'jo@example.com', customer_contact: '+44 (0)7700 900124', first_name: 'Jo', last_name: 'Bloggs' });
    expect(doc['customer_name']).toEqual(expect.stringMatching(/^Jo\s+Bloggs$/));
    expect((doc['shipping_address'] as Record<string, unknown>)['post_code']).toBe('LS1 4AB');
    expect((doc['shipping_address'] as Record<string, unknown>)['street_address']).toBe('1 High St');
    expect(doc['note']).toBe(`Delivery: ${h.slotDate(1)} afternoon`);
  });
});

describe('idempotency', () => {
  it('replays the identical response (and header) for the same key and body, without a second order or intent', async () => {
    const key = randomUUID();
    const first = await h.checkout({}, { idempotencyKey: key });
    expect(first.res.status).toBe(201);
    const ordersBefore = await h.countOrders();
    const intentsBefore = h.gateway.intents.size;

    const replay = await h.post('/v1/checkout/payment-intent', first.body, { idempotencyKey: key });
    expect(replay.status).toBe(200);
    expect(replay.headers.get('idempotent-replay')).toBe('true');
    // Same clock second, so even the re-issued token is identical: the whole body matches byte for byte.
    expect(replay.text).toBe(first.res.text);

    expect(await h.countOrders()).toBe(ordersBefore);
    expect(h.gateway.intents.size).toBe(intentsBefore);
  });

  it('re-issues a fresh, valid guest token on replay', async () => {
    const created = await h.createOrder();
    h.clock.advanceMinutes(5);
    const replay = await h.post('/v1/checkout/payment-intent', h.checkoutBody({ slot: { date: h.slotDate(1), window: 'afternoon' } }), {
      idempotencyKey: created.key,
    });
    // The slot is computed from the (now advanced) clock but is the same calendar day, so the body is identical.
    expect(replay.status, replay.text).toBe(200);
    const again = replay.json<CheckoutBody>();
    expect({ ...again, guestToken: '' }).toEqual({ ...created, guestToken: '', key: undefined });
    expect(again.guestToken).not.toBe(created.guestToken);
    expect(h.deps.guestTokens.verify(again.guestToken, created.orderId)).toMatchObject({ ok: true });
  });

  it('treats the key case-insensitively', async () => {
    const key = randomUUID();
    const first = await h.checkout({}, { idempotencyKey: key });
    const replay = await h.post('/v1/checkout/payment-intent', first.body, { idempotencyKey: key.toUpperCase() });
    expect(replay.status).toBe(200);
    expect(replay.json<CheckoutBody>().orderId).toBe(first.res.json<CheckoutBody>().orderId);
  });

  it('is insensitive to JSON key order and whitespace in the body', async () => {
    const key = randomUUID();
    const first = await h.checkout({}, { idempotencyKey: key });
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(first.body).reverse()), null, 2);
    const replay = await h.request('POST', '/v1/checkout/payment-intent', { body: reordered, idempotencyKey: key });
    expect(replay.status, replay.text).toBe(200);
  });

  it('answers 409 idempotency_key_reuse for the same key with a different body, and creates nothing', async () => {
    const key = randomUUID();
    await h.checkout({}, { idempotencyKey: key });
    const ordersBefore = await h.countOrders();
    const changes: Record<string, unknown>[] = [
      { lines: [{ productId: 'aloo-tikki', quantity: 3 }] },
      { promoCode: 'HUMI15' },
      { notes: 'different' },
      { slot: { date: h.slotDate(2), window: 'evening' } },
    ];
    for (const change of changes) {
      const res = await h.post('/v1/checkout/payment-intent', h.checkoutBody(change), { idempotencyKey: key });
      expectError(res, 409, 'idempotency_key_reuse');
    }
    expect(await h.countOrders()).toBe(ordersBefore);
  });

  it('keys are independent: a new key with the same body creates a new order', async () => {
    const a = await h.createOrder();
    const b = await h.createOrder();
    expect(a.orderId).not.toBe(b.orderId);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a uuid', 'abc'],
    ['uuid v1', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
    ['bad variant', '4b0d9a4e-8f3b-4f64-7a52-3c6c1f7a2e10'],
    ['with suffix', `${randomUUID()}-x`],
    ['sql-ish', "' OR 1=1 --"],
  ])('400 when the Idempotency-Key is %s, and nothing is created', async (_name, key) => {
    const before = await h.countOrders();
    const res = await h.post('/v1/checkout/payment-intent', h.checkoutBody(), key === undefined ? {} : { headers: { 'idempotency-key': key } });
    const error = expectError(res, 400, 'validation_failed');
    expect(error.details).toEqual([{ path: 'Idempotency-Key', message: expect.any(String) as string }]);
    expect(await h.countOrders()).toBe(before);
  });

  it('answers 409 checkout_expired when replaying a key whose order was cancelled', async () => {
    const created = await h.createOrder();
    await h.deliver(h.paymentEvent('payment_intent.canceled', created));
    const res = await h.post('/v1/checkout/payment-intent', h.checkoutBody(), { idempotencyKey: created.key });
    expectError(res, 409, 'checkout_expired');
  });

  it('stores the idempotency record hashed (never the raw key) with a TTL index in place', async () => {
    const created = await h.createOrder();
    const docs = await h.db.collection('app_idempotency').find({}).toArray();
    expect(JSON.stringify(docs)).not.toContain(created.key);
    expect(JSON.stringify(docs)).not.toContain(created.guestToken);
    const indexes = await h.db.collection('app_idempotency').indexes();
    expect(indexes.some((i) => i['expireAfterSeconds'] === 86_400)).toBe(true);
  });
});

describe('request validation (nothing may be inserted)', () => {
  async function expectRejected(overrides: Record<string, unknown>, status = 400, code: string | undefined = 'validation_failed'): Promise<ReturnType<typeof expectError>> {
    const orders = await h.countOrders();
    const intents = h.gateway.intents.size;
    const { res } = await h.checkout(overrides);
    const error = expectError(res, status, code);
    expect(await h.countOrders(), 'an order was inserted').toBe(orders);
    expect(h.gateway.intents.size, 'an intent was created').toBe(intents);
    return error;
  }

  it.each([
    ['totalPence', { totalPence: 1 }],
    ['pricing', { pricing: { totalPence: 1 } }],
    ['subtotalPence', { subtotalPence: 1 }],
    ['deliveryPence', { deliveryPence: 0 }],
    ['discountPence', { discountPence: 999 }],
    ['amount', { amount: 1 }],
    ['unknown top-level key', { isAdmin: true }],
  ])('rejects the client-supplied field %s (strict schema)', async (_name, extra) => {
    await expectRejected(extra);
  });

  it('rejects client-supplied price fields on a line, and on contact/address/slot', async () => {
    await expectRejected({ lines: [{ productId: 'aloo-tikki', quantity: 1, unitPricePence: 1 }] });
    await expectRejected({ lines: [{ productId: 'aloo-tikki', quantity: 1, price: 0.01 }] });
    await expectRejected({ contact: { name: 'A B', email: 'a@b.co', phone: '07700 900123', role: 'admin' } });
    await expectRejected({ address: { line1: '1 St', city: 'X', postcode: 'SW1A 1AA', country: 'FR' } });
    await expectRejected({ slot: { date: h.slotDate(1), window: 'morning', fee: 0 } });
  });

  it('enforces quantity and line limits', async () => {
    await expectRejected({ lines: [{ productId: 'aloo-tikki', quantity: 21 }] });
    await expectRejected({ lines: [{ productId: 'aloo-tikki', quantity: 0 }] });
    await expectRejected({ lines: [{ productId: 'aloo-tikki', quantity: -1 }] });
    await expectRejected({ lines: [{ productId: 'aloo-tikki', quantity: 1.5 }] });
    await expectRejected({ lines: [] });
    await expectRejected({ lines: [{ productId: 'aloo-tikki', quantity: 11 }, { productId: 'aloo-tikki', quantity: 10 }] });
    const lines31 = [
      ...Array.from({ length: 20 }, () => ({ productId: 'aloo-tikki', quantity: 1 })),
      ...Array.from({ length: 11 }, () => ({ productId: 'chicken-seekh-kebab', quantity: 1 })),
    ];
    await expectRejected({ lines: lines31 });
  });

  it('accepts the maximum: 20 of a product and 30 lines', async () => {
    const lines30 = [
      ...Array.from({ length: 20 }, () => ({ productId: 'aloo-tikki', quantity: 1 })),
      ...Array.from({ length: 10 }, () => ({ productId: 'chicken-seekh-kebab', quantity: 1 })),
    ];
    const body = await h.createOrder({ lines: lines30 });
    expect(body.lines.map((l) => l.quantity)).toEqual([20, 10]);
    expect(body.pricing.subtotalPence).toBe(20 * 730 + 10 * 1350);
  });

  it.each([
    ['not a postcode', 'ZZZ 999'],
    ['US zip', '90210'],
    ['empty', ''],
    ['injection', '{"$ne":""}'],
    ['too long', 'SW1A 1AA SW1A 1AA'],
  ])('rejects an invalid postcode (%s) with the path address.postcode', async (_name, postcode) => {
    const error = await expectRejected({ address: { line1: '1 High St', city: 'London', postcode } });
    expect(error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'address.postcode' })]));
  });

  it('rejects bad contact details', async () => {
    const base = { name: 'Asha Patel', email: 'asha@example.com', phone: '07700 900123' };
    await expectRejected({ contact: { ...base, email: 'not-an-email' } });
    await expectRejected({ contact: { ...base, phone: '12345' } });
    await expectRejected({ contact: { ...base, phone: 'call me' } });
    await expectRejected({ contact: { ...base, name: '' } });
    await expectRejected({ contact: { ...base, name: 'x'.repeat(81) } });
    await expectRejected({ contact: { ...base, name: 'Line\nBreak' } });
    // Operator-shaped values are refused by the safe-key guard before schema validation.
    await expectRejected({ contact: { ...base, email: { $ne: null } } }, 400, 'unsafe_input');
  });

  it('rejects over-long notes and control characters', async () => {
    await expectRejected({ notes: 'n'.repeat(301) });
    await expectRejected({ notes: 'with\u0000nul' });
    await expectRejected({ address: { line1: 'x'.repeat(81), city: 'London', postcode: 'SW1A 1AA' } });
  });

  it('accepts 300 characters of notes and stores them losslessly', async () => {
    const notes = 'n'.repeat(300);
    const body = await h.createOrder({ notes });
    const order = (await h.get(`/v1/orders/${body.orderId}`, { token: body.guestToken })).json<{ notes?: string }>();
    expect(order.notes).toBe(notes);
  });

  it('rejects unknown and non-string product ids by reporting them unavailable (422), not by crashing', async () => {
    const error = await expectRejected({ lines: [{ productId: 'no-such-product', quantity: 1 }] }, 422, 'unavailable');
    expect(error.details).toEqual({ unavailable: [{ productId: 'no-such-product', reason: 'not_found' }] });
    await expectRejected({ lines: [{ productId: { $gt: '' }, quantity: 1 }] }, 400, 'unsafe_input');
  });
});

describe('delivery slot validation', () => {
  async function slotStatus(slot: unknown): Promise<{ status: number; text: string }> {
    const before = await h.countOrders();
    const { res } = await h.checkout({ slot });
    if (res.status !== 201) expect(await h.countOrders()).toBe(before);
    return res;
  }

  it('accepts tomorrow, and the last bookable day (today + 14)', async () => {
    expect((await slotStatus({ date: h.slotDate(1), window: 'morning' })).status).toBe(201);
    expect((await slotStatus({ date: h.slotDate(14), window: 'evening' })).status).toBe(201);
  });

  it('rejects a date in the past, today - 1, and more than 14 days ahead', async () => {
    for (const date of [h.slotDate(-1), h.slotDate(-30), h.slotDate(15), h.slotDate(400)]) {
      const res = await slotStatus({ date, window: 'afternoon' });
      expect(res.status, `${date}: ${res.text}`).toBe(400);
      expect(JSON.parse(res.text)).toMatchObject({ error: { code: 'validation_failed', details: [{ path: 'slot' }] } });
    }
  });

  it('rejects impossible and malformed dates and unknown windows', async () => {
    for (const slot of [
      { date: '2030-02-30', window: 'morning' },
      { date: '2030-13-01', window: 'morning' },
      { date: '04/03/2030', window: 'morning' },
      { date: '', window: 'morning' },
      { date: h.slotDate(1), window: 'midnight' },
      { date: h.slotDate(1) },
      null,
    ]) {
      expect((await slotStatus(slot)).status).toBe(400);
    }
  });

  it('today: the morning window is already closed at 09:00 London but the afternoon is open', async () => {
    const closed = await slotStatus({ date: h.slotDate(0), window: 'morning' });
    expect(closed.status).toBe(400);
    expect(closed.text).toContain('no longer available');
    expect((await slotStatus({ date: h.slotDate(0), window: 'afternoon' })).status).toBe(201);
    expect((await slotStatus({ date: h.slotDate(0), window: 'evening' })).status).toBe(201);
  });

  it('today: after the 15:00 cutoff every window is closed', async () => {
    h.clock.advanceMinutes(6 * 60 + 30); // 15:30
    for (const window of ['morning', 'afternoon', 'evening']) {
      expect((await slotStatus({ date: h.slotDate(0), window })).status).toBe(400);
    }
    expect((await slotStatus({ date: h.slotDate(1), window: 'morning' })).status).toBe(201);
  });

  it('today: windows need two hours of lead time, evaluated on the London hour (12:00 window open at 10:xx, closed from 11:00)', async () => {
    h.clock.advanceMinutes(90); // 10:30
    expect((await slotStatus({ date: h.slotDate(0), window: 'afternoon' })).status).toBe(201);
    h.clock.advanceMinutes(30); // 11:00
    expect((await slotStatus({ date: h.slotDate(0), window: 'afternoon' })).status).toBe(400);
    expect((await slotStatus({ date: h.slotDate(0), window: 'evening' })).status).toBe(201);
  });
});

describe('business rules (422, nothing inserted)', () => {
  async function expect422(overrides: Record<string, unknown>): Promise<ReturnType<typeof expectError>> {
    const orders = await h.countOrders();
    const intents = h.gateway.intents.size;
    const { res } = await h.checkout(overrides);
    const error = expectError(res, 422);
    expect(await h.countOrders()).toBe(orders);
    expect(h.gateway.intents.size).toBe(intents);
    return error;
  }

  it('invalid promo code -> 422 invalid_promo', async () => {
    const error = await expect422({ promoCode: 'NOPE' });
    expect(error.code).toBe('invalid_promo');
    expect(error.details).toEqual({ code: 'NOPE' });
    expect(error.message).toBe('That code is not valid.');
  });

  it('expired promo code -> 422 invalid_promo', async () => {
    const error = await expect422({ promoCode: 'EXPIRED5' });
    expect(error).toMatchObject({ code: 'invalid_promo', message: 'This code has expired.' });
  });

  it('a promo minimum spend that is not met -> 422 invalid_promo', async () => {
    expect((await expect422({ promoCode: 'BIGSPEND' })).code).toBe('invalid_promo');
  });

  it('out of stock (stock = 0 on a seeded product) -> 422', async () => {
    await h.withProductPatch('aloo-tikki', { quantity: 0 }, async () => {
      const error = await expect422({});
      expect(['out_of_stock', 'unavailable']).toContain(error.code);
      expect(error.details).toEqual({ unavailable: [{ productId: 'aloo-tikki', reason: 'out_of_stock' }] });
    });
    // Back in stock: the same request now succeeds.
    expect((await h.checkout()).res.status).toBe(201);
  });

  it('asking for more than the remaining stock -> 422, exactly the remaining stock -> 201', async () => {
    const error = await expect422({ lines: [{ productId: 'e2e-last-3', quantity: 4 }] });
    expect(error.details).toEqual({ unavailable: [{ productId: 'e2e-last-3', reason: 'out_of_stock' }] });
    expect((await h.checkout({ lines: [{ productId: 'e2e-last-3', quantity: 3 }, { productId: 'aloo-tikki', quantity: 1 }] })).res.status).toBe(201);
  });

  it('an unpublished product -> 422 and the draft is not revealed as such', async () => {
    const error = await expect422({ lines: [{ productId: 'e2e-draft', quantity: 1 }] });
    expect(error.code).toBe('unavailable');
    expect(JSON.stringify(error.details)).toMatch(/not_found|unpublished/);
  });

  it('one unavailable line rejects the whole order rather than dropping the line', async () => {
    const error = await expect422({ lines: [{ productId: 'aloo-tikki', quantity: 1 }, { productId: 'no-such', quantity: 1 }] });
    expect(error.details).toEqual({ unavailable: [{ productId: 'no-such', reason: 'not_found' }] });
  });

  it('a total below Stripe\'s 30p minimum is refused', async () => {
    const h2 = await createHarness({ env: { DELIVERY_FEE_PENCE: '0', FREE_DELIVERY_THRESHOLD_PENCE: '' } });
    try {
      await h2.addProduct({ slug: 'e2e-penny', name: 'E2E TENPENCE', price: 0.1 });
      const { res } = await h2.checkout({ lines: [{ productId: 'e2e-penny', quantity: 1 }] });
      expectError(res, 422, 'unprocessable');
      expect(await h2.countAppOrders()).toBe(0);
      expect((await h2.checkout({ lines: [{ productId: 'e2e-penny', quantity: 3 }] })).res.status).toBe(201);
    } finally {
      await h2.close();
    }
  }, 120_000);

  it('MIN_ORDER_PENCE is enforced on the total', async () => {
    const h2 = await createHarness({ env: { MIN_ORDER_PENCE: '5000', DELIVERY_FEE_PENCE: '0' } });
    try {
      const { res } = await h2.checkout({ lines: [{ productId: 'aloo-tikki', quantity: 2 }] }); // 1460
      const error = expectError(res, 422, 'min_order');
      expect(error.details).toEqual({ minOrderPence: 5000, totalPence: 1460 });
      expect(await h2.countAppOrders()).toBe(0);
      expect((await h2.checkout({ lines: [{ productId: 'aloo-tikki', quantity: 7 }] })).res.status).toBe(201); // 5110
    } finally {
      await h2.close();
    }
  }, 120_000);
});

describe('payment provider failures', () => {
  it('payments disabled -> 503 payment_provider_error and NO order is inserted', async () => {
    expect((await disabled.get('/v1/config')).json<{ payments: { enabled: boolean } }>().payments.enabled).toBe(false);
    const before = await disabled.countOrders();
    const { res } = await disabled.checkout();
    const error = expectError(res, 503, 'payment_provider_error');
    expect(error.message).toBe('Payments are not configured');
    expect(await disabled.countOrders()).toBe(before);
    expect(await disabled.countAppOrders()).toBe(0);
    expect(await disabled.db.collection('app_idempotency').countDocuments({})).toBe(0);
  });

  it('payments disabled still validates input first-class and serves the catalogue and quotes', async () => {
    expect((await disabled.get('/v1/products')).status).toBe(200);
    expect((await disabled.post('/v1/checkout/quote', { lines: [{ productId: 'aloo-tikki', quantity: 1 }] })).status).toBe(200);
    const res = await disabled.post('/v1/checkout/payment-intent', { nonsense: true }, { idempotencyKey: randomUUID() });
    expect(res.status).toBe(400);
  });

  it('Stripe failing after the insert -> order cancelled, 502, no leak of the provider error, key stays reusable', async () => {
    h.control.failCreate = new Error('stripe exploded: sk_live_SECRET123');
    const before = await h.countAppOrders();
    const key = randomUUID();
    const { res } = await h.checkout({}, { idempotencyKey: key });
    const error = expectError(res, 502, 'payment_provider_error');
    expect(res.text).not.toContain('exploded');
    expect(res.text).not.toContain('sk_live');
    expect(error.message).toBe('The payment provider is unavailable. Please try again.');

    // The order was inserted, then cancelled (contract: failure after insert always cancels).
    expect(await h.countAppOrders()).toBe(before + 1);
    const orphan = await h.db.collection('orders').findOne({ 'app_meta.source': 'mobile-app' }, { sort: { _id: -1 } });
    expect(orphan).toMatchObject({ order_status: 'order-cancelled', payment_status: 'payment-failed' });
    expect((orphan?.['payment_intent'] as { id: string | null }).id).toBeNull();
    expect(await h.db.collection('app_idempotency').countDocuments({ keyHash: { $exists: true }, 'response.orderId': String(orphan?.['_id']) })).toBe(0);
    // Not stored in logs verbatim either (the error is logged with its message under `err`, which is fine,
    // but the response must be clean; and the request must not have been recorded as completed).

    // The client can retry with the same key once Stripe recovers: a fresh order, 201.
    h.control.failCreate = null;
    const retry = await h.post('/v1/checkout/payment-intent', h.checkoutBody(), { idempotencyKey: key });
    expect(retry.status, retry.text).toBe(201);
    expect(retry.json<CheckoutBody>().orderId).not.toBe(String(orphan?.['_id']));
  });

  it('a Stripe failure never leaves a payable order: the cancelled order cannot be paid via the app flow', async () => {
    h.control.failCreate = new Error('boom');
    const { res } = await h.checkout();
    expect(res.status).toBe(502);
    const orphan = await h.db.collection('orders').findOne({ 'app_meta.source': 'mobile-app', order_status: 'order-cancelled' }, { sort: { _id: -1 } });
    expect(orphan).not.toBeNull();
    expect(h.gateway.intents.size).toBeGreaterThan(0);
    for (const intent of h.gateway.intents.values()) expect(intent.orderId).not.toBe(String(orphan?.['_id']));
  });

  it('cancelling the Stripe intent failing during cleanup still returns the original error class', async () => {
    h.control.failCreate = new Error('boom');
    h.control.failCancel = new Error('cancel boom');
    const { res } = await h.checkout();
    expectError(res, 502, 'payment_provider_error');
  });
});

describe('rate limiting', () => {
  it('allows 10 payment-intent attempts per minute per IP, then 429 with Retry-After; recovers after the window', async () => {
    const ip = '203.0.113.99';
    const statuses: number[] = [];
    for (let i = 0; i < 10; i += 1) statuses.push((await h.checkout({}, { ip })).res.status);
    expect(statuses).toEqual(Array.from({ length: 10 }, () => 201));
    const { res } = await h.checkout({}, { ip });
    expectError(res, 429, 'rate_limited');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await h.checkout({}, { ip: '203.0.113.100' })).res.status).toBe(201);
    h.clock.advanceMinutes(1.1);
    expect((await h.checkout({}, { ip })).res.status).toBe(201);
  });

  it('counts rejected requests against the budget too', async () => {
    const ip = '203.0.113.150';
    for (let i = 0; i < 10; i += 1) await h.checkout({ lines: [] }, { ip });
    expectError((await h.checkout({}, { ip })).res, 429, 'rate_limited');
  });
});

describe('protocol hygiene', () => {
  it('requires JSON content type and sends no-store', async () => {
    const res = await h.request('POST', '/v1/checkout/payment-intent', {
      body: JSON.stringify(h.checkoutBody()),
      headers: { 'content-type': 'text/plain', 'idempotency-key': randomUUID() },
    });
    expectError(res, 415);
    const ok = await h.checkout();
    expect(ok.res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await h.post('/v1/checkout/payment-intent', h.checkoutBody({ notes: 'x'.repeat(200_000) }), { idempotencyKey: randomUUID() });
    expectError(res, 413, 'payload_too_large');
  });

  it('does not echo submitted values (PII) in validation errors', async () => {
    const res = await h.post(
      '/v1/checkout/payment-intent',
      h.checkoutBody({ contact: { name: 'Secret Person', email: 'secret.person@leak.example', phone: 'abc' } }),
      { idempotencyKey: randomUUID() },
    );
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('secret.person@leak.example');
    expect(res.text).not.toContain('Secret Person');
  });
});
