import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, expectNoLeaks, expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, type Harness } from '../../support/harness.js';
import type { QuoteBody } from '../../support/types.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
  await h.addProduct({ slug: 'e2e-4999', name: 'E2E FOUR NINE NINE NINE', price: 49.99 });
  await h.addProduct({ slug: 'e2e-5000', name: 'E2E FIVE THOUSAND', price: 50 });
  await h.addProduct({ slug: 'e2e-5001', name: 'E2E FIVE OH OH ONE', price: 50.01 });
  await h.addProduct({ slug: 'e2e-last-3', name: 'E2E LAST THREE', price: 2, quantity: 3 });
  await h.addProduct({ slug: 'e2e-draft', name: 'E2E DRAFT', status: 'draft' });
}, 120_000);

afterAll(async () => {
  await expectSiteDataIntact(h);
  await h.close();
});

const quote = async (lines: { productId: string; quantity: number }[], promoCode?: string): Promise<QuoteBody> => {
  const res = await h.post('/v1/checkout/quote', { lines, ...(promoCode === undefined ? {} : { promoCode }) });
  expect(res.status, res.text).toBe(200);
  expectNoLeaks(res);
  return res.json<QuoteBody>();
};

describe('POST /v1/checkout/quote: pricing', () => {
  it('prices a cart from database prices and adds delivery below the threshold', async () => {
    const q = await quote([{ productId: 'aloo-tikki', quantity: 2 }]);
    expect(q.lines).toEqual([
      expect.objectContaining({ productId: 'aloo-tikki', name: 'ALOO TIKKI', unitPricePence: 730, quantity: 2, lineTotalPence: 1460 }),
    ]);
    expect(q.pricing).toEqual({
      subtotalPence: 1460,
      deliveryPence: 799,
      discountPence: 0,
      totalPence: 2259,
      currency: 'gbp',
      promoCode: null,
      freeDeliveryRemainingPence: 3540,
    });
    expect(q.unavailable).toEqual([]);
    expect(q.promo).toBeUndefined();
  });

  it('merges lines for the same product, keeping first-seen order', async () => {
    const q = await quote([
      { productId: 'aloo-tikki', quantity: 1 },
      { productId: 'chicken-seekh-kebab', quantity: 1 },
      { productId: 'aloo-tikki', quantity: 3 },
    ]);
    expect(q.lines.map((l) => [l.productId, l.quantity, l.lineTotalPence])).toEqual([
      ['aloo-tikki', 4, 2920],
      ['chicken-seekh-kebab', 1, 1350],
    ]);
    expect(q.pricing.subtotalPence).toBe(4270);
  });

  it('answers an empty cart without charging delivery', async () => {
    const q = await quote([]);
    expect(q.pricing).toMatchObject({ subtotalPence: 0, deliveryPence: 0, totalPence: 0 });
    expect(q.lines).toEqual([]);
  });

  it.each([
    ['e2e-4999', 4999, 799, 1],
    ['e2e-5000', 5000, 0, 0],
    ['e2e-5001', 5001, 0, 0],
  ])('free delivery boundary: %s subtotal %i pence charges %i delivery', async (slug, subtotal, delivery, remaining) => {
    const q = await quote([{ productId: slug, quantity: 1 }]);
    expect(q.pricing).toMatchObject({
      subtotalPence: subtotal,
      deliveryPence: delivery,
      totalPence: subtotal + delivery,
      freeDeliveryRemainingPence: remaining,
    });
  });

  it('crosses the threshold by adding one item', async () => {
    // 4999 + 200 = 5199: free; 3 x 200 = 600: not.
    const free = await quote([{ productId: 'e2e-4999', quantity: 1 }, { productId: 'e2e-last-3', quantity: 1 }]);
    expect(free.pricing).toMatchObject({ subtotalPence: 5199, deliveryPence: 0 });
    const paid = await quote([{ productId: 'e2e-last-3', quantity: 3 }]);
    expect(paid.pricing).toMatchObject({ subtotalPence: 600, deliveryPence: 799, freeDeliveryRemainingPence: 4400 });
  });
});

describe('POST /v1/checkout/quote: promo codes', () => {
  const cart = [{ productId: 'aloo-tikki', quantity: 2 }]; // subtotal 1460

  it('applies a percentage code (case and whitespace insensitive)', async () => {
    for (const code of ['HUMI15', 'humi15', ' Humi15 ']) {
      const q = await quote(cart, code);
      expect(q.promo).toMatchObject({ code: 'HUMI15', valid: true });
      expect(q.pricing).toMatchObject({ subtotalPence: 1460, discountPence: 219, deliveryPence: 799, totalPence: 1460 - 219 + 799, promoCode: 'HUMI15' });
    }
  });

  it('applies fixed and free_shipping codes', async () => {
    expect((await quote(cart, 'FIVEOFF')).pricing).toMatchObject({ discountPence: 500, totalPence: 1460 - 500 + 799 });
    const ship = await quote(cart, 'FREESHIP');
    expect(ship.pricing).toMatchObject({ discountPence: 0, deliveryPence: 0, totalPence: 1460, promoCode: 'FREESHIP' });
  });

  it('never discounts below zero', async () => {
    const q = await quote([{ productId: 'e2e-last-3', quantity: 1 }], 'FIVEOFF'); // subtotal 200, fixed 500
    expect(q.pricing).toMatchObject({ subtotalPence: 200, discountPence: 200, totalPence: 799 });
  });

  it('reports an unknown code as invalid without changing any amount', async () => {
    const q = await quote(cart, 'NOPE');
    expect(q.promo).toEqual({ code: 'NOPE', valid: false, message: 'That code is not valid.' });
    expect(q.pricing).toMatchObject({ discountPence: 0, totalPence: 2259, promoCode: null });
  });

  it('reports an expired code as invalid, and a code that expires later as valid until then', async () => {
    const expired = await quote(cart, 'EXPIRED5');
    expect(expired.promo).toMatchObject({ code: 'EXPIRED5', valid: false, message: 'This code has expired.' });
    expect(expired.pricing.discountPence).toBe(0);

    try {
      expect((await quote(cart, 'SOON10')).promo?.valid).toBe(true);
      h.clock.advanceMinutes(61);
      const later = await quote(cart, 'SOON10');
      expect(later.promo).toMatchObject({ valid: false, message: 'This code has expired.' });
      expect(later.pricing.discountPence).toBe(0);
    } finally {
      h.clock.reset();
    }
  });

  it('enforces a minimum subtotal', async () => {
    const small = await quote(cart, 'BIGSPEND');
    expect(small.promo?.valid).toBe(false);
    expect(small.promo?.message).toContain('£100.00');
    const big = await quote([{ productId: 'e2e-5001', quantity: 2 }], 'BIGSPEND'); // 10002 pence
    expect(big.promo?.valid).toBe(true);
    expect(big.pricing.discountPence).toBe(1000);
  });
});

describe('POST /v1/checkout/quote: availability', () => {
  it('reports out-of-stock, partial stock, missing and unpublished lines instead of failing', async () => {
    const q = await quote([
      { productId: 'e2e-last-3', quantity: 4 },
      { productId: 'does-not-exist', quantity: 1 },
      { productId: 'e2e-draft', quantity: 1 },
      { productId: 'aloo-tikki', quantity: 1 },
    ]);
    expect(q.lines.map((l) => l.productId)).toEqual(['aloo-tikki']);
    const reasons = Object.fromEntries(q.unavailable.map((u) => [u.productId, u.reason]));
    expect(reasons['e2e-last-3']).toBe('out_of_stock');
    expect(reasons['does-not-exist']).toBe('not_found');
    // An unpublished product is indistinguishable from a missing one (contract allows either reason).
    expect(['not_found', 'unpublished']).toContain(reasons['e2e-draft']);
    expect(q.pricing.subtotalPence).toBe(730);
  });

  it('allows exactly the available stock', async () => {
    const q = await quote([{ productId: 'e2e-last-3', quantity: 3 }]);
    expect(q.unavailable).toEqual([]);
    expect(q.lines[0]?.quantity).toBe(3);
  });

  it('merges lines before checking stock', async () => {
    const q = await quote([{ productId: 'e2e-last-3', quantity: 2 }, { productId: 'e2e-last-3', quantity: 2 }]);
    expect(q.unavailable).toEqual([{ productId: 'e2e-last-3', reason: 'out_of_stock' }]);
  });

  it('treats stock = 0 on a seeded product as out of stock, then recovers', async () => {
    await h.withProductPatch('aloo-tikki', { quantity: 0 }, async () => {
      const q = await quote([{ productId: 'aloo-tikki', quantity: 1 }]);
      expect(q.unavailable).toEqual([{ productId: 'aloo-tikki', reason: 'out_of_stock' }]);
      expect(q.lines).toEqual([]);
      expect(q.pricing.totalPence).toBe(0);
    });
    const back = await quote([{ productId: 'aloo-tikki', quantity: 1 }]);
    expect(back.unavailable).toEqual([]);
  });

  it('treats in_stock = false as out of stock even when quantity is positive', async () => {
    await h.withProductPatch('aloo-tikki', { in_stock: false }, async () => {
      const q = await quote([{ productId: 'aloo-tikki', quantity: 1 }]);
      expect(q.unavailable).toEqual([{ productId: 'aloo-tikki', reason: 'out_of_stock' }]);
    });
  });

  it('reflects a price change in the database immediately (the server is the price authority)', async () => {
    await h.withProductPatch('aloo-tikki', { price: 8.5 }, async () => {
      expect((await quote([{ productId: 'aloo-tikki', quantity: 1 }])).lines[0]?.unitPricePence).toBe(850);
    });
  });
});

describe('POST /v1/checkout/quote: input validation', () => {
  it.each([
    ['missing lines', {}],
    ['unknown field', { lines: [], total: 1 }],
    ['client price on a line', { lines: [{ productId: 'aloo-tikki', quantity: 1, unitPricePence: 1 }] }],
    ['zero quantity', { lines: [{ productId: 'aloo-tikki', quantity: 0 }] }],
    ['quantity above 20', { lines: [{ productId: 'aloo-tikki', quantity: 21 }] }],
    ['fractional quantity', { lines: [{ productId: 'aloo-tikki', quantity: 1.5 }] }],
    ['string quantity', { lines: [{ productId: 'aloo-tikki', quantity: '1' }] }],
    ['merged quantity above 20', { lines: [{ productId: 'aloo-tikki', quantity: 12 }, { productId: 'aloo-tikki', quantity: 12 }] }],
    ['31 lines', { lines: Array.from({ length: 31 }, () => ({ productId: 'aloo-tikki', quantity: 1 })) }],
    ['operator in productId', { lines: [{ productId: { $ne: null }, quantity: 1 }] }],
    ['bad promo characters', { lines: [], promoCode: 'A B!' }],
    ['promo too long', { lines: [], promoCode: 'A'.repeat(33) }],
    ['__proto__ key', JSON.parse('{"lines":[],"__proto__":{"x":1}}') as unknown],
  ])('400 for %s', async (_name, body) => {
    expectError(await h.post('/v1/checkout/quote', body), 400);
  });

  it('accepts 30 lines and exactly 20 of a product', async () => {
    const q = await quote([
      ...Array.from({ length: 20 }, () => ({ productId: 'aloo-tikki', quantity: 1 })),
      ...Array.from({ length: 10 }, () => ({ productId: 'chicken-seekh-kebab', quantity: 1 })),
    ]);
    expect(q.lines.map((l) => l.quantity)).toEqual([20, 10]);
  });

  it('415 for a non-JSON content type and 400 for malformed JSON', async () => {
    expectError(await h.request('POST', '/v1/checkout/quote', { body: '{}', headers: { 'content-type': 'text/plain' } }), 415);
    expectError(await h.request('POST', '/v1/checkout/quote', { body: '{nope' }), 400);
  });

  it('rate limits at 60 per minute per IP and recovers after the window', async () => {
    const ip = '198.51.100.7';
    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) statuses.push((await h.post('/v1/checkout/quote', { lines: [] }, { ip })).status);
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    const limited = await h.post('/v1/checkout/quote', { lines: [] }, { ip });
    expect(statuses[60]).toBe(429);
    expectError(limited, 429, 'rate_limited');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    // Another client is unaffected.
    expect((await h.post('/v1/checkout/quote', { lines: [] }, { ip: '198.51.100.8' })).status).toBe(200);
    h.clock.advanceMinutes(2);
    expect((await h.post('/v1/checkout/quote', { lines: [] }, { ip })).status).toBe(200);
    h.clock.reset();
  });
});
