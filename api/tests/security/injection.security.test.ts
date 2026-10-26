import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildHarness, type Harness, type MongoFixture, seedProducts, startMongo } from './support.js';

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

const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const key = (): string => crypto.randomUUID();
const orderCount = (): Promise<number> => h.orders.countDocuments({});

describe('NoSQL operator injection through query strings', () => {
  it.each([
    ['q[$ne]=x'],
    ['q[$regex]=.*'],
    ['collection[$gt]='],
    ['collection[$ne]=kebabs'],
    ['q=a&q=b'],
    ['collection=kebabs&collection=samosas'],
    ['limit=1&limit=2'],
    ['limit[$gt]=0'],
    ['limit=1e2'],
    ['limit=0x10'],
    ['limit=-1'],
    ['limit=0'],
    ['limit=101'],
    ['limit=99999999999999999999'],
    ['limit=%00'],
    ['cursor[$gt]=a'],
    ['cursor=' + 'A'.repeat(65)],
    ['cursor=not+base64'],
    ['__proto__[x]=1'],
    ['constructor=1'],
    ['unknown=1'],
    ['q=' + 'x'.repeat(61)],
    ['q=%00'],
    ['q=a%0Ab'],
    ['collection=other%00'],
  ])('rejects /v1/products?%s with a 400 and never a 5xx', async (query) => {
    const res = await h.call(`/v1/products?${query}`);
    expect(res.status, query).toBe(400);
  });

  it('treats q as a literal: regex metacharacters match nothing instead of everything', async () => {
    const all = (await (await h.call('/v1/products?limit=100')).json()) as { items: unknown[] };
    expect(all.items.length).toBe(17);
    for (const q of ['.*', '.', '^', '$', '(a+)+$', '[a-z]+', '\\', 'chicken|meat', '(?i)chicken', '{1,}', '*']) {
      const res = await h.call(`/v1/products?q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
      expect(((await res.json()) as { items: unknown[] }).items, q).toHaveLength(0);
    }
    const literal = await h.call('/v1/products?q=CHICKEN%20samosa');
    expect(((await literal.json()) as { items: unknown[] }).items.length).toBeGreaterThan(0);
  });

  it('answers catastrophic-backtracking search text quickly', async () => {
    const started = performance.now();
    const res = await h.call(`/v1/products?q=${encodeURIComponent('a'.repeat(30) + '!')}`);
    expect(res.status).toBe(200);
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it('clamps pagination: the default page is 50 and the maximum 100', async () => {
    const page = (await (await h.call('/v1/products?limit=100')).json()) as { items: unknown[] };
    expect(page.items.length).toBeLessThanOrEqual(100);
    const small = (await (await h.call('/v1/products?limit=3')).json()) as { items: unknown[]; nextCursor: string | null };
    expect(small.items).toHaveLength(3);
    expect(small.nextCursor).not.toBeNull();
  });

  it.each(['%24ne', '%7B%22%24ne%22%3A1%7D', '%00', '..%2F..%2Fetc%2Fpasswd', '%', '%E0%A4%A', '%FF%FE', '0'.repeat(24), 'a'.repeat(101), '__proto__', 'constructor'])(
    'answers /v1/products/%s with a client error',
    async (segment) => {
      const res = await h.call(`/v1/products/${segment}`);
      expect(res.status, segment).toBeLessThan(500);
      expect([400, 404]).toContain(res.status);
    },
  );
});

describe('NoSQL operator, dotted-key and prototype injection through JSON bodies', () => {
  const polluted = (): boolean => Object.keys(Object.prototype).length > 0 || ({} as Record<string, unknown>)['polluted'] !== undefined;

  const bodies: [string, string, (b: Record<string, unknown>) => unknown][] = [
    ['$ne in lines', '/v1/checkout/quote', () => ({ lines: [{ productId: { $ne: null }, quantity: 1 }] })],
    ['$gt quantity', '/v1/checkout/quote', () => ({ lines: [{ productId: 'aloo-tikki', quantity: { $gt: 0 } }] })],
    ['top-level $where', '/v1/checkout/quote', () => ({ lines: [], $where: 'sleep(1000)' })],
    ['dotted key', '/v1/checkout/quote', () => ({ lines: [], 'a.b': 1 })],
    ['promo operator', '/v1/checkout/quote', () => ({ lines: [], promoCode: { $ne: '' } })],
    ['promo array', '/v1/checkout/quote', () => ({ lines: [], promoCode: ['HUMI15', 'FIVER'] })],
    ['promoCodes stacking', '/v1/checkout/quote', () => ({ lines: [], promoCodes: ['HUMI15', 'FIVER'] })],
    ['contact operator', '/v1/checkout/payment-intent', (b) => ({ ...b, contact: { name: { $ne: 1 }, email: 'a@b.co', phone: '0712345678' } })],
    ['address dotted', '/v1/checkout/payment-intent', (b) => ({ ...b, address: { 'line1.x': 'a', city: 'b', postcode: 'SW1A 1AA' } })],
    ['slot operator', '/v1/checkout/payment-intent', (b) => ({ ...b, slot: { date: { $gt: '' }, window: 'morning' } })],
    ['notes operator', '/v1/checkout/payment-intent', (b) => ({ ...b, notes: { $regex: '.' } })],
    ['enquiry operator', '/v1/enquiries', () => ({ type: 'contact', name: 'Al', email: 'a@b.co', message: 'hello there friend', $set: { x: 1 } })],
    ['enquiry nested', '/v1/enquiries', () => ({ type: 'b2b', name: 'Al', email: 'a@b.co', phone: '0712345678', business: { name: 'X', type: { $ne: 1 } }, message: 'hello there friend' })],
    ['lookup operator', '/v1/orders/lookup', () => ({ orderNumber: { $ne: null }, email: 'a@b.co' })],
  ];

  it.each(bodies)('rejects %s with 400', async (_name, path, build) => {
    const base = h.checkoutBody();
    const res = await h.call(path, json('POST', build(base), path.includes('payment') ? { 'idempotency-key': key() } : {}));
    expect(res.status).toBe(400);
    expect(polluted()).toBe(false);
  });

  it.each([
    ['__proto__ root', '{"__proto__":{"polluted":true},"lines":[]}'],
    ['__proto__ nested', '{"lines":[{"productId":"aloo-tikki","quantity":1,"__proto__":{"polluted":true}}]}'],
    ['constructor.prototype', '{"lines":[],"constructor":{"prototype":{"polluted":true}}}'],
    ['prototype key', '{"lines":[],"prototype":{"polluted":true}}'],
  ])('is not polluted by %s', async (_name, raw) => {
    const res = await h.call('/v1/checkout/quote', json('POST', raw));
    expect(res.status).toBe(400);
    expect(polluted()).toBe(false);
  });

  it('is not polluted through the idempotency canonicaliser or an enquiry', async () => {
    const raw = '{"type":"contact","name":"Al","email":"a@b.co","message":"hello there friend","__proto__":{"polluted":true}}';
    expect((await h.call('/v1/enquiries', json('POST', raw))).status).toBe(400);
    const place = await h.call(
      '/v1/checkout/payment-intent',
      json('POST', JSON.stringify({ ...h.checkoutBody(), __proto__: undefined }).replace('{', '{"__proto__":{"polluted":true},'), { 'idempotency-key': key() }),
    );
    expect(place.status).toBe(400);
    expect(polluted()).toBe(false);
  });

  it('handles pathological JSON without a 5xx', async () => {
    for (const raw of ['[' .repeat(90_000), '{"a":'.repeat(5000) + '1' + '}'.repeat(5000), '{"lines":' + '['.repeat(1000) + ']'.repeat(1000) + '}', '{', '', 'null', '"str"', '1e999', '﻿{}']) {
      const res = await h.call('/v1/checkout/quote', json('POST', raw));
      expect(res.status, raw.slice(0, 20)).toBeLessThan(500);
    }
  });

  it('refuses JSON-ish bodies under the wrong content type (content-type confusion)', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp', 'text/json', 'application/xml']) {
      const res = await h.call('/v1/checkout/quote', { method: 'POST', headers: { 'content-type': type }, body: '{"lines":[]}' });
      expect(res.status, type).toBe(415);
    }
    const noType = await h.call('/v1/checkout/quote', { method: 'POST', body: '{"lines":[]}', headers: { 'content-type': '' } });
    expect(noType.status).toBe(415);
  });

  it('ignores HTTP method override headers and query parameters', async () => {
    const a = await h.placeOrder();
    for (const headers of <Record<string, string>[]>[{ 'x-http-method-override': 'DELETE' }, { 'x-method-override': 'PUT' }, { 'x-http-method': 'PATCH' }]) {
      const res = await h.call(`/v1/orders/${a.orderId}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' });
      expect(res.status).toBe(405);
    }
    expect((await h.call('/v1/products?_method=DELETE', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(405);
    expect((await h.call(`/v1/orders/${a.orderId}`, { method: 'DELETE' })).status).toBe(405);
    expect((await h.call('/v1/checkout/quote', { method: 'GET' })).status).toBe(405);
    expect(await h.orders.countDocuments({ _id: { $exists: true } })).toBeGreaterThan(0);
  });
});

describe('header, log and stored-XSS injection', () => {
  it.each([
    ['name with CRLF', { contact: { name: 'Asha\r\nBcc: evil@example.com', email: 'asha@example.com', phone: '07123 456789' } }],
    ['name with LF', { contact: { name: 'Asha\nPatel', email: 'asha@example.com', phone: '07123 456789' } }],
    ['name with NUL', { contact: { name: 'Asha\u0000', email: 'asha@example.com', phone: '07123 456789' } }],
    ['email with CRLF', { contact: { name: 'Asha', email: 'asha@example.com\r\nBcc: evil@example.com', phone: '07123 456789' } }],
    ['email with comma list', { contact: { name: 'Asha', email: 'a@example.com, b@example.com', phone: '07123 456789' } }],
    ['email with angle brackets', { contact: { name: 'Asha', email: 'Asha <asha@example.com>', phone: '07123 456789' } }],
    ['phone with letters', { contact: { name: 'Asha', email: 'asha@example.com', phone: '07123 456789; DROP' } }],
    ['line1 with newline', { address: { line1: '1 High\nStreet', city: 'London', postcode: 'SW1A 1AA' } }],
    ['city with ESC', { address: { line1: '1 High Street', city: 'Lon\u001bdon', postcode: 'SW1A 1AA' } }],
    ['notes with newline forging a delivery line', { notes: 'x\nDelivery: 2030-01-01 morning' }],
  ])('rejects %s and creates no order', async (_name, over) => {
    const before = await orderCount();
    const res = await h.call('/v1/checkout/payment-intent', json('POST', h.checkoutBody(over), { 'idempotency-key': key() }));
    expect(res.status).toBe(400);
    expect(await orderCount()).toBe(before);
  });

  it('normalises a postcode that smuggles whitespace into the canonical form, so no raw input is stored', async () => {
    const placed = await h.placeOrder({ address: { line1: '1 High Street', city: 'London', postcode: ' sw1a\n\t1aa ' } });
    expect(placed.status).toBe(201);
    const doc = await h.orders.findOne({ tracking_number: placed.orderNumber });
    expect((doc?.['shipping_address'] as { post_code: string }).post_code).toBe('SW1A 1AA');
  });

  it('keeps every log line valid JSON when the path carries newlines and forged JSON', async () => {
    const before = h.logs.lines().length;
    await h.call('/v1/products/%0A%7B%22level%22%3A60%2C%22msg%22%3A%22FORGED%22%7D');
    await h.call('/v1/nope%0D%0Ainjected');
    const lines = h.logs.lines().slice(before);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l['msg'] === 'FORGED')).toBe(false);
    expect(lines.every((l) => typeof l['msg'] === 'string' || l['msg'] === undefined)).toBe(true);
  });

  it('stores and returns stored-XSS payloads as inert plain text over a JSON-only, nosniff, CSP-locked channel', async () => {
    const xss = '<script>alert(1)</script>';
    const img = '"><img src=x onerror=alert(1)>';
    const placed = await h.placeOrder({
      contact: { name: xss, email: 'xss@example.com', phone: '07123 456789' },
      address: { line1: img, city: '<svg onload=alert(1)>', postcode: 'SW1A 1AA' },
      notes: 'javascript:alert(document.cookie) {{7*7}} ${7*7}',
    });
    expect(placed.status).toBe(201);
    const res = await h.call(`/v1/orders/${placed.orderId}`, { headers: { authorization: `Bearer ${placed.guestToken}` } });
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    const order = (await res.json()) as { contact: { name: string }; address: { line1: string; city: string }; notes: string };
    expect(order.contact.name).toBe(xss);
    expect(order.address.line1).toBe(img);
    expect(order.address.city).toBe('<svg onload=alert(1)>');
    expect(order.notes).toBe('javascript:alert(document.cookie) {{7*7}} ${7*7}');
  });

  it('stores enquiry XSS verbatim and never executes or reflects it', async () => {
    const message = '<img src=x onerror=alert(1)> and </script><script>alert(2)</script>';
    const res = await h.call('/v1/enquiries', json('POST', { type: 'contact', name: 'Mallory', email: 'm@example.com', message }));
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    const doc = await mongo.db.collection('app_enquiries').findOne({ message });
    expect(doc?.['message']).toBe(message);
  });
});

describe('promo codes and unicode tricks', () => {
  const quote = async (promoCode: unknown) => {
    const res = await h.call('/v1/checkout/quote', json('POST', { lines: [{ productId: 'chicken-samosa-large', quantity: 2 }], promoCode }));
    return { status: res.status, body: (await res.json()) as { pricing?: { discountPence: number; promoCode: string | null }; promo?: { valid: boolean } } };
  };

  it('treats case and surrounding whitespace as the same code, and never stacks', async () => {
    const upper = await quote('HUMI15');
    for (const variant of ['humi15', 'HuMi15', '  humi15  ']) {
      const r = await quote(variant);
      expect(r.status).toBe(200);
      expect(r.body.pricing?.discountPence).toBe(upper.body.pricing?.discountPence);
      expect(r.body.pricing?.promoCode).toBe('HUMI15');
    }
    expect(upper.body.pricing?.discountPence).toBe(225); // 15% of 1500
  });

  it.each([
    ['fullwidth', 'ＨＵＭＩ15'],
    ['dotless i uppercases to ASCII I', 'humı15'],
    ['long s', 'ſhiprfree'],
    ['kelvin sign', 'HUMI15K'],
    ['null byte', 'HUMI15\u0000'],
    ['zero width space', 'HUMI​15'],
    ['two codes', 'HUMI15 FIVER'],
    ['comma list', 'HUMI15,FIVER'],
    ['33 chars', 'A'.repeat(33)],
    ['combining mark', 'HUMI15́'],
  ])('rejects %s promo spellings with a 400', async (_name, code) => {
    expect((await quote(code)).status).toBe(400);
    const res = await h.call('/v1/checkout/payment-intent', json('POST', h.checkoutBody({ promoCode: code }), { 'idempotency-key': key() }));
    expect(res.status).toBe(400);
  });

  it('never lets a discount exceed the subtotal or produce a negative total', async () => {
    const cheap = await h.call('/v1/checkout/quote', json('POST', { lines: [{ productId: 'punjabi-samosa-roti', quantity: 1 }], promoCode: 'FIVER' }));
    const body = (await cheap.json()) as { pricing: { subtotalPence: number; discountPence: number; totalPence: number; deliveryPence: number } };
    expect(body.pricing.discountPence).toBe(Math.min(500, body.pricing.subtotalPence));
    expect(body.pricing.totalPence).toBe(body.pricing.subtotalPence - body.pricing.discountPence + body.pricing.deliveryPence);
    expect(body.pricing.totalPence).toBeGreaterThanOrEqual(0);
  });

  it('refuses to charge a zero or sub-minimum total even with a 100% code', async () => {
    const intents = h.gateway.intents.size;
    const before = await orderCount();
    const res = await h.call(
      '/v1/checkout/payment-intent',
      json('POST', h.checkoutBody({ promoCode: 'BIG', lines: [{ productId: 'chicken-samosa-large', quantity: 10 }] }), { 'idempotency-key': key() }),
    );
    expect(res.status).toBe(422);
    expect(h.gateway.intents.size).toBe(intents);
    expect(await orderCount()).toBe(before);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('unprocessable');
  });

  it('reports an invalid promo as 422 invalid_promo at checkout and valid:false at quote, with one fixed message', async () => {
    const quoted = await quote('NOSUCHCODE');
    expect(quoted.body.promo?.valid).toBe(false);
    expect(quoted.body.pricing?.discountPence).toBe(0);
    const res = await h.call('/v1/checkout/payment-intent', json('POST', h.checkoutBody({ promoCode: 'NOSUCHCODE' }), { 'idempotency-key': key() }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_promo');
  });
});

describe('price, quantity and cart tampering', () => {
  const place = (over: Record<string, unknown>) =>
    h.call('/v1/checkout/payment-intent', json('POST', h.checkoutBody(over), { 'idempotency-key': key() }));

  it.each([
    ['unitPricePence on a line', { lines: [{ productId: 'aloo-tikki', quantity: 1, unitPricePence: 1 }] }],
    ['price on a line', { lines: [{ productId: 'aloo-tikki', quantity: 1, price: 0.01 }] }],
    ['lineTotalPence on a line', { lines: [{ productId: 'aloo-tikki', quantity: 1, lineTotalPence: 1 }] }],
    ['top-level totalPence', { totalPence: 1 }],
    ['top-level amount', { amount: 1 }],
    ['pricing object', { pricing: { totalPence: 1, subtotalPence: 1, deliveryPence: 0, discountPence: 0 } }],
    ['deliveryPence', { deliveryPence: 0 }],
    ['discountPence', { discountPence: 99999 }],
    ['paid_total (site field)', { paid_total: 0.01 }],
    ['payment_status', { payment_status: 'payment-success' }],
    ['order_status', { order_status: 'order-completed' }],
    ['app_meta', { app_meta: { source: 'x' } }],
    ['unknown field inside contact', { contact: { name: 'A', email: 'a@b.co', phone: '07123 456789', isAdmin: true } }],
  ])('rejects client-supplied %s', async (_name, over) => {
    const before = await orderCount();
    const res = await place(over);
    expect(res.status).toBe(400);
    expect(await orderCount()).toBe(before);
  });

  it.each([0, -1, 21, 1.5, 0.5, '2', null, true, [], {}, 1e21, 2 ** 53, -(2 ** 53), 4294967296, 1.0000001])('rejects quantity %j', async (quantity) => {
    const q = await h.call('/v1/checkout/quote', json('POST', { lines: [{ productId: 'aloo-tikki', quantity }] }));
    expect(q.status).toBe(400);
    expect((await place({ lines: [{ productId: 'aloo-tikki', quantity }] })).status).toBe(400);
  });

  it('rejects NaN/Infinity spellings that are not valid JSON numbers', async () => {
    for (const raw of ['{"lines":[{"productId":"aloo-tikki","quantity":NaN}]}', '{"lines":[{"productId":"aloo-tikki","quantity":Infinity}]}', '{"lines":[{"productId":"aloo-tikki","quantity":0x2}]}']) {
      expect((await h.call('/v1/checkout/quote', json('POST', raw))).status).toBe(400);
    }
  });

  it('caps merged duplicate lines at 20 per product and at 30 lines', async () => {
    expect((await place({ lines: [{ productId: 'aloo-tikki', quantity: 15 }, { productId: 'aloo-tikki', quantity: 15 }] })).status).toBe(400);
    const many = Array.from({ length: 31 }, () => ({ productId: 'aloo-tikki', quantity: 1 }));
    expect((await place({ lines: many })).status).toBe(400);
    expect((await h.call('/v1/checkout/quote', json('POST', { lines: many }))).status).toBe(400);
    expect((await h.call('/v1/checkout/quote', json('POST', { lines: [{ productId: 'aloo-tikki', quantity: 15 }, { productId: 'aloo-tikki', quantity: 15 }] }))).status).toBe(400);
  });

  it('prices split duplicate lines exactly like one merged line, including at the free-delivery boundary', async () => {
    // chicken-samosa-large is 750p: 6 units = 4500 (fee applies), 7 units = 5250 (free over 5000).
    const q = async (lines: unknown) =>
      ((await (await h.call('/v1/checkout/quote', json('POST', { lines }))).json()) as { pricing: Record<string, unknown>; lines: unknown[] });
    const six = await q([{ productId: 'chicken-samosa-large', quantity: 6 }]);
    const sixSplit = await q([{ productId: 'chicken-samosa-large', quantity: 3 }, { productId: 'chicken-samosa-large', quantity: 3 }]);
    expect(sixSplit).toEqual(six);
    expect(six.pricing).toMatchObject({ subtotalPence: 4500, deliveryPence: 799 });
    const seven = await q([{ productId: 'chicken-samosa-large', quantity: 4 }, { productId: 'chicken-samosa-large', quantity: 3 }]);
    expect(seven.pricing).toMatchObject({ subtotalPence: 5250, deliveryPence: 0, freeDeliveryRemainingPence: 0 });
    expect(seven.lines).toHaveLength(1);
  });

  it('sums many lines exactly in integer pence (no float drift) and equals an independent computation', async () => {
    const slugs = ['punjabi-samosa-roti', 'chicken-shami-kebab', 'vegetable-spring-rolls', 'meat-chapli-kebab', 'vegetable-crispy-samosa', 'chicken-crispy-samosa', 'meat-samosa-large', 'meat-spring-rolls', 'chicken-seekh-kebab', 'chicken-chapli-kebab', 'meat-crispy-samosa', 'chicken-samosa-large', 'tandoori-chicken-samosa', 'chicken-spring-rolls', 'vegatable-samosa', 'aloo-tikki', 'meat-shami-kebabs'];
    const lines = slugs.map((productId, i) => ({ productId, quantity: (i % 7) + 1 }));
    const res = (await (await h.call('/v1/checkout/quote', json('POST', { lines, promoCode: 'HUMI15' }))).json()) as {
      pricing: { subtotalPence: number; discountPence: number; totalPence: number };
      lines: { unitPricePence: number; quantity: number; lineTotalPence: number }[];
    };
    const sum = res.lines.reduce((a, l) => a + l.unitPricePence * l.quantity, 0);
    expect(res.pricing.subtotalPence).toBe(sum);
    expect(res.lines.every((l) => Number.isInteger(l.lineTotalPence) && l.lineTotalPence === l.unitPricePence * l.quantity)).toBe(true);
    expect(res.pricing.discountPence).toBe(Math.round(sum * 0.15));
    expect(res.pricing.totalPence).toBe(sum - res.pricing.discountPence);
  });

  it('flags unknown, malformed and operator-like product ids as unavailable instead of pricing them', async () => {
    const res = await h.call('/v1/checkout/quote', json('POST', { lines: [{ productId: 'does-not-exist', quantity: 1 }, { productId: '0'.repeat(24), quantity: 1 }] }));
    const body = (await res.json()) as { lines: unknown[]; unavailable: { reason: string }[]; pricing: { totalPence: number } };
    expect(body.lines).toHaveLength(0);
    expect(body.unavailable).toHaveLength(2);
    expect(body.pricing.totalPence).toBe(0);
    const checkout = await place({ lines: [{ productId: 'does-not-exist', quantity: 1 }] });
    expect(checkout.status).toBe(422);
    expect(((await checkout.json()) as { error: { code: string } }).error.code).toBe('unavailable');
  });
});

describe('delivery slot validation', () => {
  const place = (slot: unknown) =>
    h.call('/v1/checkout/payment-intent', json('POST', h.checkoutBody({ slot }), { 'idempotency-key': key() }));

  it.each([
    ['2026-02-30'],
    ['2026-13-01'],
    ['2026-10-32'],
    ['2026-00-10'],
    ['2026-10-27T00:00:00Z'],
    ['2026-10-27 '],
    ['٢٠٢٦-١٠-٢٧'],
    ['2026-1-27'],
    ['26-10-27'],
    ['2026-10-25'],
    ['2020-01-01'],
    ['2026-11-10'],
    ['2999-01-01'],
    ['0000-00-00'],
  ])('rejects slot date %s', async (date) => {
    const res = await place({ date, window: 'afternoon' });
    expect(res.status, date).toBe(400);
  });

  it('rejects same-day morning once its lead time has passed and accepts a later window', async () => {
    expect((await place({ date: '2026-10-26', window: 'morning' })).status).toBe(400);
    expect((await place({ date: '2026-10-26', window: 'evening' })).status).toBe(201);
    expect((await place({ date: '2026-11-09', window: 'morning' })).status).toBe(201);
  });

  it.each([{ date: '2026-10-27', window: 'midnight' }, { date: '2026-10-27', window: 'MORNING' }, { date: '2026-10-27' }, { window: 'morning' }, 'tomorrow', null])(
    'rejects malformed slot %j',
    async (slot) => {
      expect((await place(slot)).status).toBe(400);
    },
  );
});
