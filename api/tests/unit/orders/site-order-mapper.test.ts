import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import type { NewOrder, PricedLine } from '../../../src/domain/types.js';
import { BadRequestError } from '../../../src/lib/errors.js';
import { fromSiteDocument, toSiteDocument } from '../../../src/orders/site-order-mapper.js';
import { newOrder, NOW, websiteDoc } from './fixtures.js';

const ctx = { now: NOW };

describe('toSiteDocument', () => {
  it('produces the contract section 4 document', () => {
    const doc = toSiteDocument(newOrder(), ctx);
    expect(doc).toEqual({
      tracking_number: '123456789012',
      products: [
        { product_id: new ObjectId('6985bc5e0000000000000001'), order_quantity: 2, unit_price: 5.99, subtotal: 11.98, name: 'Punjabi Samosa Roti', image: 'https://img.example/a.jpg' },
        { product_id: new ObjectId('6985bc5e0000000000000002'), order_quantity: 1, unit_price: 14, subtotal: 14, name: 'Seekh Kebab', image: null },
      ],
      amount: 25.98,
      sales_tax: 0,
      delivery_fee: 7.99,
      discount: 0,
      paid_total: 33.97,
      total: 33.97,
      coupon_id: null,
      delivery_method: 'shipping',
      store_id: null,
      pickup_location: null,
      customer_contact: '+44 7700 900123',
      customer_name: 'Ada Lovelace',
      first_name: 'Ada',
      last_name: 'Lovelace',
      customer_email: 'Ada@Example.com',
      note: 'Leave with neighbour\nDelivery: 2026-03-05 afternoon',
      payment_gateway: 'STRIPE',
      payment_sub_gateway: '',
      use_wallet_points: false,
      isFullWalletPayment: false,
      billing_address: { city: 'London', country: '', street_address: '1 High Street, Flat 2', post_code: 'AB1 2CD', location: null },
      shipping_address: { city: 'London', country: '', street_address: '1 High Street, Flat 2', post_code: 'AB1 2CD', location: null },
      language: 'en',
      order_status: 'order-pending',
      payment_status: 'payment-pending',
      payment_intent: { id: null, client_secret_redacted: true },
      created_at: NOW,
      updated_at: NOW,
      app_meta: {
        source: 'mobile-app',
        slot: { date: '2026-03-05', window: 'afternoon' },
        promo_code: null,
        idempotency_key_hash: 'a'.repeat(64),
        app_version: '1.2.3',
        product_slugs: ['punjabi-samosa-roti', 'seekh-kebab'],
        address_line2: 'Flat 2',
      },
    });
  });

  it('stores ObjectId product ids and distinct billing/shipping objects', () => {
    const doc = toSiteDocument(newOrder(), ctx);
    expect(doc.products.every((p) => p.product_id instanceof ObjectId)).toBe(true);
    expect(doc.billing_address).not.toBe(doc.shipping_address);
  });

  it('puts only the delivery line in the note when there are no user notes', () => {
    const { notes: _omit, ...rest } = newOrder();
    expect(toSiteDocument(rest, ctx).note).toBe('Delivery: 2026-03-05 afternoon');
  });

  it('omits optional keys instead of writing undefined', () => {
    const { appVersion: _a, ...rest } = newOrder({ address: { line1: '1 High Street', city: 'London', postcode: 'AB1 2CD' } });
    const doc = toSiteDocument(rest, ctx);
    expect(doc.shipping_address.street_address).toBe('1 High Street');
    expect('app_version' in doc.app_meta).toBe(false);
    expect('address_line2' in doc.app_meta).toBe(false);
  });

  it('records the promo code', () => {
    const order = newOrder({ pricing: { ...newOrder().pricing, promoCode: 'HUMI15' } });
    expect(toSiteDocument(order, ctx).app_meta.promo_code).toBe('HUMI15');
  });

  it.each([
    ['Ada Lovelace', 'Ada', 'Lovelace'],
    ['Cher', 'Cher', ''],
    ['  Mary   Ann  Smith ', 'Mary', 'Ann Smith'],
    ['Zoë Müller-Åberg', 'Zoë', 'Müller-Åberg'],
    ['a\tb', 'a', 'b'],
    ['', '', ''],
    ['   ', '', ''],
  ])('splits %j into %j / %j', (name, first, last) => {
    const doc = toSiteDocument(newOrder({ contact: { ...newOrder().contact, name } }), ctx);
    expect([doc.first_name, doc.last_name]).toEqual([first, last]);
    expect(doc.customer_name).toBe(name.trim());
  });

  it.each([
    [0, 0],
    [1, 0.01],
    [10, 0.1],
    [29, 0.29],
    [599, 5.99],
    [799, 7.99],
    [1005, 10.05],
    [1999, 19.99],
    [123456789, 1234567.89],
  ])('converts %i pence to %d pounds exactly', (p, expected) => {
    const order = newOrder({
      lines: [{ ...newOrder().lines[0]!, unitPricePence: p, quantity: 1, lineTotalPence: p }],
      pricing: { ...newOrder().pricing, subtotalPence: p, deliveryPence: 0, totalPence: p },
    });
    const doc = toSiteDocument(order, ctx);
    expect(doc.amount).toBe(expected);
    expect(doc.total).toBe(expected);
    expect(Math.round(doc.amount * 100)).toBe(p);
  });

  it('is exact for every price from 0.00 to 200.00', () => {
    for (let p = 0; p <= 20_000; p += 1) {
      const order = newOrder({
        lines: [{ ...newOrder().lines[0]!, unitPricePence: p, quantity: 1, lineTotalPence: p }],
        pricing: { ...newOrder().pricing, subtotalPence: p, deliveryPence: 0, totalPence: p },
      });
      expect(toSiteDocument(order, ctx).amount).toBe(Number((p / 100).toFixed(2)));
    }
  });

  describe('refuses to write inconsistent or hostile orders', () => {
    const base = newOrder();
    const line = base.lines[0] as PricedLine;
    const cases: [string, NewOrder][] = [
      ['no lines', { ...base, lines: [], pricing: { ...base.pricing, subtotalPence: 0, totalPence: 799 } }],
      ['line total mismatch', { ...base, lines: [{ ...line, lineTotalPence: 1 }, base.lines[1] as PricedLine] }],
      ['subtotal mismatch', { ...base, pricing: { ...base.pricing, subtotalPence: 1 } }],
      ['total mismatch', { ...base, pricing: { ...base.pricing, totalPence: 1 } }],
      ['negative discount', { ...base, pricing: { ...base.pricing, discountPence: -5, totalPence: 3402 } }],
      ['zero quantity', { ...base, lines: [{ ...line, quantity: 0, lineTotalPence: 0 }, base.lines[1] as PricedLine], pricing: { ...base.pricing, subtotalPence: 1400, totalPence: 2199 } }],
      ['fractional quantity', { ...base, lines: [{ ...line, quantity: 1.5, lineTotalPence: 898.5 }, base.lines[1] as PricedLine] }],
      ['bad order number', { ...base, orderNumber: '12 34' }],
      ['operator order number', { ...base, orderNumber: '$ne' }],
    ];
    it.each(cases)('%s', (_label, order) => {
      expect(() => toSiteDocument(order, ctx)).toThrow(RangeError);
    });

    it('rejects a malformed product id', () => {
      const order = newOrder({ lines: [{ ...line, sourceId: 'not-an-object-id' }, base.lines[1] as PricedLine] });
      expect(() => toSiteDocument(order, ctx)).toThrow(BadRequestError);
    });

    it('accepts a discount that brings the total to zero', () => {
      const order = newOrder({ pricing: { ...base.pricing, discountPence: 3397, totalPence: 0 } });
      expect(toSiteDocument(order, ctx).total).toBe(0);
    });
  });
});

describe('fromSiteDocument', () => {
  const withId = (extra: Record<string, unknown> = {}) => ({ ...toSiteDocument(newOrder(), ctx), _id: new ObjectId('6985bc5e00000000000000bb'), ...extra });

  it('reads an app document back into a StoredOrder', () => {
    const stored = fromSiteDocument(withId(), { freeDeliveryThresholdPence: 5000 });
    expect(stored).toEqual({
      orderId: '6985bc5e00000000000000bb',
      orderNumber: '123456789012',
      placedAt: NOW.toISOString(),
      status: 'pending_payment',
      paymentStatus: 'pending',
      lines: [
        { productId: 'punjabi-samosa-roti', sourceId: '6985bc5e0000000000000001', name: 'Punjabi Samosa Roti', image: 'https://img.example/a.jpg', unitPricePence: 599, quantity: 2, lineTotalPence: 1198 },
        { productId: 'seekh-kebab', sourceId: '6985bc5e0000000000000002', name: 'Seekh Kebab', image: null, unitPricePence: 1400, quantity: 1, lineTotalPence: 1400 },
      ],
      pricing: { subtotalPence: 2598, deliveryPence: 799, discountPence: 0, totalPence: 3397, currency: 'gbp', promoCode: null, freeDeliveryRemainingPence: 2402 },
      contact: { name: 'Ada Lovelace', email: 'Ada@Example.com', phone: '+44 7700 900123' },
      address: { line1: '1 High Street', line2: 'Flat 2', city: 'London', postcode: 'AB1 2CD' },
      slot: { date: '2026-03-05', window: 'afternoon' },
      notes: 'Leave with neighbour',
      siteOrderStatus: 'order-pending',
      sitePaymentStatus: 'payment-pending',
      paymentIntentId: null,
      createdByApp: true,
    });
  });

  it('reads a website order tolerantly and marks it as not app-created', () => {
    const stored = fromSiteDocument(websiteDoc());
    expect(stored).toMatchObject({
      orderNumber: '555000111222',
      status: 'preparing',
      paymentStatus: 'paid',
      createdByApp: false,
      paymentIntentId: 'pi_site',
      contact: { name: 'Grace Hopper', email: 'grace@example.com', phone: '+447700900999' },
      address: { line1: '9 Low Road', city: 'Leeds', postcode: 'LS1 1AA' },
      notes: 'Ring the bell',
      slot: { date: '2026-02-01', window: 'morning' },
      pricing: { subtotalPence: 599, deliveryPence: 799, totalPence: 1398, promoCode: null },
    });
    expect(stored?.lines[0]).toMatchObject({ productId: '6985bc5e0000000000000001', sourceId: '6985bc5e0000000000000001', unitPricePence: 599, quantity: 1 });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'order'],
    ['a number', 7],
    ['an array', [{ _id: new ObjectId() }]],
    ['no _id', { tracking_number: '1' }],
    ['non-hex _id', { _id: 'zzz', tracking_number: '1' }],
    ['no tracking number', { _id: new ObjectId() }],
    ['empty tracking number', { _id: new ObjectId(), tracking_number: '   ' }],
    ['object tracking number', { _id: new ObjectId(), tracking_number: { $ne: '' } }],
  ])('returns null for %s and logs without contents', (_label, doc) => {
    const warn = vi.fn();
    expect(fromSiteDocument(doc, { logger: { warn } })).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('order"');
  });

  it('returns null instead of throwing when reading explodes', () => {
    const warn = vi.fn();
    const hostile = {
      get _id(): never {
        throw new Error('boom');
      },
    };
    expect(fromSiteDocument(hostile, { logger: { warn } })).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('works without a logger', () => {
    expect(fromSiteDocument(null)).toBeNull();
    expect(fromSiteDocument({})).toBeNull();
  });

  it('accepts a hex string _id and a numeric tracking number', () => {
    const stored = fromSiteDocument({ _id: '6985BC5E00000000000000CC', tracking_number: 123456 });
    expect(stored).toMatchObject({ orderId: '6985bc5e00000000000000cc', orderNumber: '123456' });
  });

  it('survives garbage in every other field', () => {
    const stored = fromSiteDocument({
      _id: new ObjectId('6985bc5e00000000000000dd'),
      tracking_number: '42',
      products: 'nope',
      amount: 'abc',
      delivery_fee: Number.NaN,
      discount: -4,
      total: { $gt: 0 },
      paid_total: Infinity,
      customer_name: { first: 'x' },
      customer_email: ['a@b.c'],
      customer_contact: null,
      shipping_address: 'home',
      billing_address: [],
      note: 12,
      order_status: { $ne: 'x' },
      payment_status: 7,
      payment_intent: 'pi_1',
      created_at: 'not a date',
      app_meta: 'mobile-app',
    });
    expect(stored).toMatchObject({
      orderNumber: '42',
      status: 'pending_payment',
      paymentStatus: 'pending',
      lines: [],
      pricing: { subtotalPence: 0, deliveryPence: 0, discountPence: 0, totalPence: 0 },
      contact: { name: '', email: '', phone: '' },
      address: { line1: '', city: '', postcode: '' },
      paymentIntentId: null,
      createdByApp: false,
    });
    expect(stored?.placedAt).toBe(new ObjectId('6985bc5e00000000000000dd').getTimestamp().toISOString());
  });

  it('reads line items with odd shapes', () => {
    const stored = fromSiteDocument({
      _id: new ObjectId(),
      tracking_number: '1',
      products: [
        null,
        'x',
        { product_id: 'bad', order_quantity: -3, unit_price: '5.5', subtotal: undefined, name: 7, image: { thumbnail: 'https://t', original: 'https://o' } },
        { product_id: new ObjectId('6985bc5e0000000000000009'), order_quantity: 2.4, unit_price: 1.005, image: '' },
      ],
    });
    expect(stored?.lines).toEqual([
      { productId: '', sourceId: '', name: '7', image: 'https://t', unitPricePence: 550, quantity: 0, lineTotalPence: 0 },
      { productId: '6985bc5e0000000000000009', sourceId: '6985bc5e0000000000000009', name: '', image: null, unitPricePence: 100, quantity: 2, lineTotalPence: 200 },
    ]);
  });

  it('falls back to the summed lines, then to paid_total, for money fields', () => {
    const base = { _id: new ObjectId(), tracking_number: '1', products: [{ order_quantity: 2, unit_price: 3, subtotal: 6 }] };
    expect(fromSiteDocument({ ...base, delivery_fee: 2 })?.pricing).toMatchObject({ subtotalPence: 600, totalPence: 800 });
    expect(fromSiteDocument({ ...base, paid_total: 9.5 })?.pricing.totalPence).toBe(950);
    expect(fromSiteDocument({ ...base, discount: 100, delivery_fee: 1 })?.pricing.totalPence).toBe(0);
  });

  it.each([
    ['order-pending', 'payment-pending', 'pending_payment', 'pending'],
    ['order-pending', 'payment-success', 'placed', 'paid'],
    ['order-processing', 'payment-success', 'preparing', 'paid'],
    ['order-at-local-facility', 'cash-on-delivery', 'preparing', 'paid'],
    ['order-out-for-delivery', 'payment-success', 'out-for-delivery', 'paid'],
    ['order-completed', 'payment-success', 'delivered', 'paid'],
    ['order-cancelled', 'payment-failed', 'cancelled', 'failed'],
    ['order-failed', 'payment-failed', 'cancelled', 'failed'],
    ['order-refunded', 'payment-refunded', 'cancelled', 'refunded'],
    ['order-pending', 'payment-reversal', 'pending_payment', 'refunded'],
    ['mystery', 'payment-success', 'placed', 'paid'],
    ['mystery', 'mystery', 'pending_payment', 'pending'],
  ])('status %s + %s -> %s / %s', (order_status, payment_status, status, paymentStatus) => {
    expect(fromSiteDocument(withId({ order_status, payment_status }))).toMatchObject({ status, paymentStatus });
  });

  describe('free delivery remaining', () => {
    it('is 0 without a threshold or when delivery was free', () => {
      expect(fromSiteDocument(withId())?.pricing.freeDeliveryRemainingPence).toBe(0);
      expect(fromSiteDocument(withId({ delivery_fee: 0 }), { freeDeliveryThresholdPence: 5000 })?.pricing.freeDeliveryRemainingPence).toBe(0);
    });
    it('never goes negative', () => {
      expect(fromSiteDocument(withId(), { freeDeliveryThresholdPence: 100 })?.pricing.freeDeliveryRemainingPence).toBe(0);
    });
  });

  describe('slot and notes', () => {
    it('strips only the trailing delivery line from the note', () => {
      const doc = withId({ note: 'Delivery: 2020-01-01 morning\nplease\nDelivery: 2026-03-05 afternoon', app_meta: undefined });
      const stored = fromSiteDocument(doc);
      expect(stored?.slot).toEqual({ date: '2026-03-05', window: 'afternoon' });
      expect(stored?.notes).toBe('Delivery: 2020-01-01 morning\nplease');
    });

    it('prefers a valid app_meta.slot and ignores an invalid one', () => {
      const good = withId({ app_meta: { source: 'mobile-app', slot: { date: '2027-12-31', window: 'evening' } } });
      expect(fromSiteDocument(good)?.slot).toEqual({ date: '2027-12-31', window: 'evening' });
      for (const slot of [{ date: '2026-02-30', window: 'evening' }, { date: '2026-03-05', window: 'night' }, { date: 5, window: 'evening' }, 'x']) {
        const bad = withId({ app_meta: { source: 'mobile-app', slot } });
        expect(fromSiteDocument(bad)?.slot).toEqual({ date: '2026-03-05', window: 'afternoon' });
      }
    });

    it('ignores an impossible date in the note, keeps the text and falls back to the order date', () => {
      const stored = fromSiteDocument(withId({ note: 'Delivery: 2026-13-45 morning', app_meta: undefined }));
      expect(stored?.slot).toEqual({ date: '2026-03-01', window: 'morning' });
      expect(stored?.notes).toBe('Delivery: 2026-13-45 morning');
    });

    it('omits notes when only the delivery line exists', () => {
      const { notes: _n, ...rest } = newOrder();
      const stored = fromSiteDocument({ ...toSiteDocument(rest, ctx), _id: new ObjectId() });
      expect('notes' in (stored ?? {})).toBe(false);
    });
  });

  describe('address line 2', () => {
    it('keeps a comma inside line1 intact', () => {
      const order = newOrder({ address: { line1: 'Flat 1, 10 High Street', city: 'London', postcode: 'AB1 2CD' } });
      expect(fromSiteDocument({ ...toSiteDocument(order, ctx), _id: new ObjectId() })?.address).toEqual({ line1: 'Flat 1, 10 High Street', city: 'London', postcode: 'AB1 2CD' });
    });

    it('does not split when the stored street was edited and no longer ends with line2', () => {
      const doc = withId({ shipping_address: { city: 'X', post_code: 'Y', street_address: 'Edited street' } });
      expect(fromSiteDocument(doc)?.address).toEqual({ line1: 'Edited street', city: 'X', postcode: 'Y' });
    });

    it('falls back to the billing address when shipping is missing', () => {
      const doc = withId({ shipping_address: undefined });
      expect(fromSiteDocument(doc)?.address.city).toBe('London');
    });

    it('does not trust address_line2 on a document that is not app-created', () => {
      const doc = withId({ app_meta: { source: 'other', address_line2: 'Flat 2' } });
      expect(fromSiteDocument(doc)?.address.line1).toBe('1 High Street, Flat 2');
    });
  });

  it('reads payment intent ids and promo codes', () => {
    const order = newOrder({ pricing: { ...newOrder().pricing, promoCode: 'HUMI15' } });
    const doc = { ...toSiteDocument(order, ctx), _id: new ObjectId(), payment_intent: { id: 'pi_123', client_secret_redacted: true } };
    expect(fromSiteDocument(doc)).toMatchObject({ paymentIntentId: 'pi_123', pricing: { promoCode: 'HUMI15' } });
  });
});

describe('round trip (property test with a seeded generator)', () => {
  function rng(seed: number): () => number {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const WORDS = ['Ada', 'Zoë', 'O\'Neil', 'Flat 1, 10', 'High St', 'Delivery:', 'x', 'a,b', '£5', '日本', 'Rd.'];

  function generate(rand: () => number, index: number): NewOrder {
    const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
    const words = (n: number) => Array.from({ length: n }, () => WORDS[int(0, WORDS.length - 1)]).join(' ').trim();
    const lines: PricedLine[] = Array.from({ length: int(1, 5) }, (_, i) => {
      const unit = int(1, 100_000);
      const quantity = int(1, 20);
      const hex = (index * 10 + i).toString(16).padStart(24, '0');
      return { productId: `slug-${String(index)}-${String(i)}`, sourceId: hex, name: words(int(1, 3)), image: rand() < 0.5 ? null : `https://img.example/${String(i)}.jpg`, unitPricePence: unit, quantity, lineTotalPence: unit * quantity };
    });
    const subtotal = lines.reduce((a, l) => a + l.lineTotalPence, 0);
    const delivery = rand() < 0.5 ? 0 : 799;
    const discount = int(0, subtotal);
    const threshold = 5000;
    const base: NewOrder = {
      orderNumber: String(int(1, 999_999_999_999)).padStart(12, '0'),
      lines,
      pricing: {
        subtotalPence: subtotal,
        deliveryPence: delivery,
        discountPence: discount,
        totalPence: subtotal + delivery - discount,
        currency: 'gbp',
        promoCode: rand() < 0.3 ? 'HUMI15' : null,
        freeDeliveryRemainingPence: delivery === 0 ? 0 : Math.max(0, threshold - subtotal),
      },
      contact: { name: words(int(1, 3)) || 'Cher', email: `u${String(index)}@example.com`, phone: `+44 7${String(int(100000000, 999999999))}` },
      address: { line1: words(int(1, 4)) || '1 Road', city: words(1) || 'Town', postcode: 'AB1 2CD' },
      slot: { date: `20${String(int(26, 29))}-0${String(int(1, 9))}-1${String(int(0, 9))}`, window: (['morning', 'afternoon', 'evening'] as const)[int(0, 2)] ?? 'morning' },
      idempotencyKeyHash: 'b'.repeat(64),
    };
    if (rand() < 0.5) base.address.line2 = words(int(1, 3)) || 'Flat 3';
    if (rand() < 0.6) base.notes = `${words(int(1, 6))}${rand() < 0.3 ? '\nsecond line' : ''}`.trim() || 'note';
    if (rand() < 0.5) base.appVersion = '2.0.0';
    return base;
  }

  it('fromSiteDocument(toSiteDocument(x)) preserves everything the public Order carries', () => {
    const rand = rng(20261025);
    for (let i = 0; i < 400; i += 1) {
      const order = generate(rand, i);
      const doc = { ...toSiteDocument(order, ctx), _id: new ObjectId() };
      const stored = fromSiteDocument(doc, { freeDeliveryThresholdPence: 5000 });
      expect(stored, `iteration ${String(i)}`).not.toBeNull();
      expect(stored).toMatchObject({
        orderNumber: order.orderNumber,
        lines: order.lines,
        pricing: order.pricing,
        contact: { ...order.contact, name: order.contact.name.trim() },
        address: order.address,
        slot: order.slot,
        status: 'pending_payment',
        paymentStatus: 'pending',
        createdByApp: true,
        placedAt: NOW.toISOString(),
      });
      expect(stored?.notes).toBe(order.notes);
      // BSON round trip too: what Mongo would hand back after storing it.
      expect(Math.round(doc.total * 100)).toBe(order.pricing.totalPence);
    }
  });
});
