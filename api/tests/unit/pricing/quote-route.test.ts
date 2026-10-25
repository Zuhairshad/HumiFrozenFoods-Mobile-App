import { describe, expect, it } from 'vitest';
import type { FeatureDeps } from '../../../src/domain/ports.js';
import { MemoryRateLimitStore } from '../../../src/lib/rate-limit-store.js';
import { quoteRoutes } from '../../../src/routes/quote.js';
import { createPricingService } from '../../../src/services/pricing.js';
import { errorBody, testApp, testDeps } from '../helpers.js';
import { business, fakeProducts, fixedClock, product } from './fixtures.js';

function build(limitStore = new MemoryRateLimitStore()) {
  const pricing = createPricingService({
    products: fakeProducts([product('a', { pricePence: 1999 }), product('low', { stock: 2 })]),
    business: business({}, [{ code: 'HUMI15', kind: 'percentage', value: 15 }]),
    clock: fixedClock,
  });
  const base = testDeps({ rateLimitStore: limitStore });
  const deps = { ...base, clock: fixedClock, pricing, rateLimitStore: limitStore } as unknown as FeatureDeps;
  return testApp((app) => app.route('/v1', quoteRoutes(deps)), { rateLimitStore: limitStore }, { TRUSTED_IP_HEADER: 'x-forwarded-for' });
}

const post = (app: ReturnType<typeof build>, body: unknown, ip = '9.9.9.9') =>
  app.request('/v1/checkout/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /v1/checkout/quote', () => {
  it('returns the full contract body', async () => {
    const res = await post(build(), { lines: [{ productId: 'a', quantity: 2 }], promoCode: 'humi15' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      pricing: { subtotalPence: 3998, discountPence: 600, deliveryPence: 799, totalPence: 4197, promoCode: 'HUMI15', currency: 'gbp' },
      unavailable: [],
      promo: { code: 'HUMI15', valid: true },
    });
    expect(body.lines).toHaveLength(1);
  });

  it('omits promo when no code was sent', async () => {
    const body = (await (await post(build(), { lines: [{ productId: 'a', quantity: 1 }] })).json()) as Record<string, unknown>;
    expect('promo' in body).toBe(false);
  });

  it('reports unavailable lines with 200, never an error', async () => {
    const res = await post(build(), {
      lines: [
        { productId: 'ghost', quantity: 1 },
        { productId: 'low', quantity: 3 },
      ],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { unavailable: unknown[] }).unavailable).toEqual([
      { productId: 'ghost', reason: 'not_found' },
      { productId: 'low', reason: 'out_of_stock' },
    ]);
  });

  it('accepts an empty cart', async () => {
    const res = await post(build(), { lines: [] });
    expect(res.status).toBe(200);
  });

  it('accepts 30 distinct lines and exactly 20 of a product', async () => {
    const thirty = Array.from({ length: 30 }, (_, i) => ({ productId: `p${String(i)}`, quantity: 1 }));
    expect((await post(build(), { lines: thirty })).status).toBe(200);
    expect((await post(build(), { lines: [{ productId: 'a', quantity: 20 }] })).status).toBe(200);
  });

  it.each([
    ['not an object', '[]'],
    ['missing lines', {}],
    ['31 lines', { lines: Array.from({ length: 31 }, () => ({ productId: 'a', quantity: 1 })) }],
    ['quantity 0', { lines: [{ productId: 'a', quantity: 0 }] }],
    ['quantity 21', { lines: [{ productId: 'a', quantity: 21 }] }],
    ['fractional quantity', { lines: [{ productId: 'a', quantity: 1.5 }] }],
    ['string quantity', { lines: [{ productId: 'a', quantity: '2' }] }],
    ['negative quantity', { lines: [{ productId: 'a', quantity: -1 }] }],
    ['empty product id', { lines: [{ productId: '', quantity: 1 }] }],
    ['product id with control chars', { lines: [{ productId: 'a\u0000b', quantity: 1 }] }],
    ['client-supplied price', { lines: [{ productId: 'a', quantity: 1, pricePence: 1 }] }],
    ['unknown top-level field', { lines: [], totalPence: 0 }],
    ['promo too long', { lines: [], promoCode: 'A'.repeat(33) }],
    ['promo with symbols', { lines: [], promoCode: 'A B!' }],
    ['promo not a string', { lines: [], promoCode: 5 }],
    ['mongo operator key', { lines: [{ productId: { $ne: 'x' }, quantity: 1 }] }],
    ['malformed json', '{nope'],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await post(build(), body);
    expect(res.status).toBe(400);
    const err = await errorBody(res);
    expect(['validation_failed', 'bad_request', 'unsafe_input']).toContain(err.error.code);
  });

  it('reports validation issues as paths and messages without echoing input', async () => {
    const res = await post(build(), { lines: [{ productId: 'secret-ish', quantity: 99 }] });
    const err = await errorBody(res);
    expect(err.error.code).toBe('validation_failed');
    expect(JSON.stringify(err.error.details)).toContain('lines.0.quantity');
    expect(JSON.stringify(err)).not.toContain('secret-ish');
  });

  it('enforces the 20-per-product cap on the merged quantity with 400', async () => {
    const res = await post(build(), {
      lines: [
        { productId: 'a', quantity: 12 },
        { productId: 'b', quantity: 1 },
        { productId: 'a', quantity: 9 },
      ],
    });
    expect(res.status).toBe(400);
    const err = await errorBody(res);
    expect(err.error.code).toBe('validation_failed');
    expect(JSON.stringify(err.error.details)).toContain('lines.2.quantity');
  });

  it('allows duplicate lines that merge to exactly 20', async () => {
    const res = await post(build(), {
      lines: [
        { productId: 'a', quantity: 10 },
        { productId: 'a', quantity: 10 },
      ],
    });
    expect(res.status).toBe(200);
  });

  it('rate limits at 60 per minute per IP', async () => {
    const app = build();
    for (let i = 0; i < 60; i += 1) {
      expect((await post(app, { lines: [] }, '5.5.5.5')).status).toBe(200);
    }
    const blocked = await post(app, { lines: [] }, '5.5.5.5');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).not.toBeNull();
    expect((await post(app, { lines: [] }, '6.6.6.6')).status).toBe(200);
  });
});
