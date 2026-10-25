import { describe, expect, it } from 'vitest';
import type { ProductRecord } from '../../../src/domain/types.js';
import { createPricingService } from '../../../src/services/pricing.js';
import { business, fakeProducts, fixedClock, mulberry32, NOW, product } from './fixtures.js';

const HUMI15 = { code: 'HUMI15', kind: 'percentage', value: 15 } as const;

function service(
  records: ProductRecord[],
  delivery: Parameters<typeof business>[0] = {},
  promos: Parameters<typeof business>[1] = [HUMI15, { code: 'SHIP', kind: 'free_shipping', value: 0 }],
) {
  return createPricingService({ products: fakeProducts(records), business: business(delivery, promos), clock: fixedClock });
}

describe('pricing basics', () => {
  const records = [
    product('a', { pricePence: 799 }),
    product('b', { pricePence: 1999 }),
    product('c', { pricePence: 3333 }),
  ];

  it('prices lines from database prices and reports the contract shape', async () => {
    const q = await service(records).quote({ lines: [{ productId: 'a', quantity: 3 }] });
    expect(q.lines).toEqual([
      {
        productId: 'a',
        sourceId: 'src-a',
        name: 'Product a',
        image: 'https://img.test/a-t.jpg',
        unitPricePence: 799,
        quantity: 3,
        lineTotalPence: 2397,
      },
    ]);
    expect(q.pricing).toEqual({
      subtotalPence: 2397,
      deliveryPence: 799,
      discountPence: 0,
      totalPence: 3196,
      currency: 'gbp',
      promoCode: null,
      freeDeliveryRemainingPence: 2603,
    });
    expect(q.unavailable).toEqual([]);
    expect(q.promo).toBeNull();
  });

  it('returns null image when product has none', async () => {
    const q = await service([product('a', { image: null })]).quote({ lines: [{ productId: 'a', quantity: 1 }] });
    expect(q.lines[0]?.image).toBeNull();
  });

  it('handles float-prone prices exactly (3333 x 3, 1999 x 3)', async () => {
    const q = await service(records).quote({
      lines: [
        { productId: 'c', quantity: 3 },
        { productId: 'b', quantity: 3 },
      ],
    });
    expect(q.pricing.subtotalPence).toBe(9999 + 5997);
  });

  it('merges duplicate lines per product, preserving first-seen order', async () => {
    const q = await service(records).quote({
      lines: [
        { productId: 'b', quantity: 1 },
        { productId: 'a', quantity: 2 },
        { productId: 'b', quantity: 4 },
      ],
    });
    expect(q.lines.map((l) => [l.productId, l.quantity])).toEqual([
      ['b', 5],
      ['a', 2],
    ]);
  });

  it('rejects non-positive or fractional quantities as programmer errors', async () => {
    await expect(service(records).quote({ lines: [{ productId: 'a', quantity: 0 }] })).rejects.toThrow(RangeError);
    await expect(service(records).quote({ lines: [{ productId: 'a', quantity: 1.5 }] })).rejects.toThrow(RangeError);
  });

  it('rejects a corrupt non-integer database price', async () => {
    await expect(
      service([product('a', { pricePence: 12.5 })]).quote({ lines: [{ productId: 'a', quantity: 1 }] }),
    ).rejects.toThrow(RangeError);
  });

  it('never calls the repository for an empty cart', async () => {
    const throwing = { ...fakeProducts([]), findManyBySlugs: () => Promise.reject(new Error('should not be called')) };
    const svc = createPricingService({ products: throwing, business: business(), clock: fixedClock });
    const q = await svc.quote({ lines: [] });
    expect(q.lines).toEqual([]);
  });
});

describe('availability', () => {
  const records = [
    product('ok', { pricePence: 1000 }),
    product('limited', { pricePence: 1000, stock: 3 }),
    product('sold-out', { pricePence: 1000, inStock: false, stock: 0 }),
    product('flag-only', { pricePence: 1000, inStock: false, stock: null }),
  ];

  it('reports unknown products as not_found and excludes them from pricing', async () => {
    const q = await service(records).quote({
      lines: [
        { productId: 'ghost', quantity: 2 },
        { productId: 'ok', quantity: 1 },
      ],
    });
    expect(q.unavailable).toEqual([{ productId: 'ghost', reason: 'not_found' }]);
    expect(q.pricing.subtotalPence).toBe(1000);
  });

  it.each([
    ['quantity above stock', 'limited', 4, 'out_of_stock'],
    ['stock zero and not in stock', 'sold-out', 1, 'out_of_stock'],
    ['inStock false with untracked stock', 'flag-only', 1, 'out_of_stock'],
  ])('%s -> unavailable', async (_name, productId, quantity, reason) => {
    const q = await service(records).quote({ lines: [{ productId, quantity }] });
    expect(q.unavailable).toEqual([{ productId, reason }]);
    expect(q.lines).toEqual([]);
    expect(q.pricing.subtotalPence).toBe(0);
    expect(q.pricing.deliveryPence).toBe(0);
  });

  it('allows quantity exactly equal to stock and never alters quantities', async () => {
    const q = await service(records).quote({ lines: [{ productId: 'limited', quantity: 3 }] });
    expect(q.lines[0]?.quantity).toBe(3);
    expect(q.unavailable).toEqual([]);
  });

  it('checks stock against the merged quantity', async () => {
    const q = await service(records).quote({
      lines: [
        { productId: 'limited', quantity: 2 },
        { productId: 'limited', quantity: 2 },
      ],
    });
    expect(q.unavailable).toEqual([{ productId: 'limited', reason: 'out_of_stock' }]);
  });

  it('keeps pricing the remaining lines when others are unavailable', async () => {
    const q = await service(records).quote({
      lines: [
        { productId: 'sold-out', quantity: 1 },
        { productId: 'ok', quantity: 2 },
      ],
    });
    expect(q.pricing.subtotalPence).toBe(2000);
    expect(q.unavailable).toHaveLength(1);
  });
});

describe('delivery', () => {
  const records = [product('a', { pricePence: 2500 }), product('cheap', { pricePence: 100 })];

  it('is 0 when no priced lines, and remaining shows the full threshold', async () => {
    const q = await service(records).quote({ lines: [] });
    expect(q.pricing.deliveryPence).toBe(0);
    expect(q.pricing.totalPence).toBe(0);
    expect(q.pricing.freeDeliveryRemainingPence).toBe(5000);
  });

  it('charges the fee just below the threshold and waives at exactly the threshold', async () => {
    const below = await service(records).quote({ lines: [{ productId: 'a', quantity: 1 }, { productId: 'cheap', quantity: 24 }] });
    expect(below.pricing.subtotalPence).toBe(4900);
    expect(below.pricing.deliveryPence).toBe(799);
    expect(below.pricing.freeDeliveryRemainingPence).toBe(100);
    const at = await service(records).quote({ lines: [{ productId: 'a', quantity: 2 }] });
    expect(at.pricing.subtotalPence).toBe(5000);
    expect(at.pricing.deliveryPence).toBe(0);
    expect(at.pricing.freeDeliveryRemainingPence).toBe(0);
  });

  it('never gives free delivery when the threshold is null', async () => {
    const q = await service(records, { freeThresholdPence: null }).quote({ lines: [{ productId: 'a', quantity: 20 }] });
    expect(q.pricing.deliveryPence).toBe(799);
    expect(q.pricing.freeDeliveryRemainingPence).toBe(0);
  });

  it('evaluates the free threshold on the subtotal before the promo discount', async () => {
    const q = await service(records).quote({ lines: [{ productId: 'a', quantity: 2 }], promoCode: 'humi15' });
    expect(q.pricing).toMatchObject({ subtotalPence: 5000, discountPence: 750, deliveryPence: 0, totalPence: 4250 });
  });

  it('does not bill delivery for a zero fee configuration', async () => {
    const q = await service(records, { feePence: 0 }).quote({ lines: [{ productId: 'cheap', quantity: 1 }] });
    expect(q.pricing.totalPence).toBe(100);
  });
});

describe('promo integration', () => {
  const records = [product('a', { pricePence: 1999 })];

  it('applies a valid percentage code and exposes the normalised code', async () => {
    const q = await service(records).quote({ lines: [{ productId: 'a', quantity: 1 }], promoCode: '  humi15 ' });
    expect(q.promo).toEqual({ code: 'HUMI15', valid: true, message: 'Code applied.' });
    expect(q.pricing).toMatchObject({ promoCode: 'HUMI15', discountPence: 300, deliveryPence: 799, totalPence: 1999 - 300 + 799 });
  });

  it('gives no discount and null promoCode for an unknown code', async () => {
    const q = await service(records).quote({ lines: [{ productId: 'a', quantity: 1 }], promoCode: 'bogus' });
    expect(q.promo).toEqual({ code: 'BOGUS', valid: false, message: 'That code is not valid.' });
    expect(q.pricing).toMatchObject({ promoCode: null, discountPence: 0, totalPence: 1999 + 799 });
  });

  it('free shipping zeroes delivery and keeps discount at 0', async () => {
    const q = await service(records).quote({ lines: [{ productId: 'a', quantity: 1 }], promoCode: 'SHIP' });
    expect(q.pricing).toMatchObject({ discountPence: 0, deliveryPence: 0, totalPence: 1999, promoCode: 'SHIP' });
  });

  it('treats blank promo as no promo', async () => {
    const q = await service(records).quote({ lines: [{ productId: 'a', quantity: 1 }], promoCode: '  ' });
    expect(q.promo).toBeNull();
  });

  it('uses the injected clock for expiry', async () => {
    const promos = [{ code: 'SOON', kind: 'fixed', value: 100, expiresAt: new Date(NOW.getTime() + 1000).toISOString() }] as const;
    const early = createPricingService({ products: fakeProducts(records), business: business({}, promos), clock: fixedClock });
    const late = createPricingService({ products: fakeProducts(records), business: business({}, promos), clock: { now: () => new Date(NOW.getTime() + 1000) } });
    const input = { lines: [{ productId: 'a', quantity: 1 }], promoCode: 'SOON' };
    expect((await early.quote(input)).promo?.valid).toBe(true);
    expect((await late.quote(input)).promo?.message).toBe('This code has expired.');
  });

  it('a promo on an empty cart changes nothing', async () => {
    const q = await service(records).quote({ lines: [{ productId: 'ghost', quantity: 1 }], promoCode: 'SHIP' });
    expect(q.pricing).toMatchObject({ subtotalPence: 0, deliveryPence: 0, totalPence: 0 });
  });
});

describe('property tests (seeded)', () => {
  const rand = mulberry32(0xc0ffee);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const SLUGS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];

  function randomWorld() {
    const records = SLUGS.map((slug) =>
      product(slug, {
        pricePence: int(1, 20_000),
        stock: rand() < 0.3 ? int(0, 25) : null,
        inStock: rand() < 0.9,
      }),
    );
    const threshold = rand() < 0.2 ? null : int(0, 30_000);
    const promos = [
      { code: 'PCT', kind: 'percentage', value: int(1, 100), ...(rand() < 0.5 ? { minSubtotalPence: int(0, 5000) } : {}) },
      { code: 'FIX', kind: 'fixed', value: int(0, 5000) },
      { code: 'SHP', kind: 'free_shipping', value: 0 },
    ] as const;
    return { records, delivery: { feePence: int(0, 1500), freeThresholdPence: threshold }, promos };
  }

  function randomLines() {
    return Array.from({ length: int(0, 8) }, () => ({ productId: [...SLUGS, 'ghost'][int(0, SLUGS.length)] ?? 'ghost', quantity: int(1, 10) }));
  }

  it('holds money invariants over 2500 random carts and configs', async () => {
    for (let i = 0; i < 2500; i += 1) {
      const world = randomWorld();
      const svc = service(world.records, world.delivery, world.promos);
      const lines = randomLines();
      const promoCode = [undefined, 'pct', 'FIX', 'shp', 'nope'][int(0, 4)];
      const q = await svc.quote({ lines, promoCode });
      const p = q.pricing;

      for (const v of [p.subtotalPence, p.deliveryPence, p.discountPence, p.totalPence, p.freeDeliveryRemainingPence]) {
        expect(Number.isSafeInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(p.discountPence).toBeLessThanOrEqual(p.subtotalPence);
      expect(p.totalPence).toBe(p.subtotalPence - p.discountPence + p.deliveryPence);
      expect(p.subtotalPence).toBe(q.lines.reduce((acc, l) => acc + l.unitPricePence * l.quantity, 0));
      if (q.lines.length === 0) expect(p.deliveryPence).toBe(0);
      if (q.promo?.valid !== true) expect(p.discountPence).toBe(0);
      expect(p.promoCode).toBe(q.promo?.valid ? q.promo.code : null);

      const requested = new Set(lines.map((l) => l.productId));
      expect(new Set([...q.lines.map((l) => l.productId), ...q.unavailable.map((u) => u.productId)])).toEqual(requested);

      const extra = { productId: 'p0', quantity: 1 };
      const more = await svc.quote({ lines: [...lines, extra], promoCode });
      const grew = more.lines.find((l) => l.productId === 'p0');
      const before = q.lines.find((l) => l.productId === 'p0');
      if (grew && (before || !q.unavailable.some((u) => u.productId === 'p0'))) {
        expect(more.pricing.subtotalPence).toBeGreaterThanOrEqual(p.subtotalPence);
      }

      const split = await svc.quote({
        lines: lines.flatMap((l) => Array.from({ length: l.quantity }, () => ({ productId: l.productId, quantity: 1 }))),
        promoCode,
      });
      expect(split).toEqual(q);
    }
  });

  it('free delivery is monotonic in subtotal', async () => {
    for (let i = 0; i < 2000; i += 1) {
      const world = randomWorld();
      const records = world.records.map((r) => ({ ...r, stock: null, inStock: true }));
      const svc = service(records, world.delivery, []);
      const lines = randomLines().filter((l) => l.productId !== 'ghost');
      const base = await svc.quote({ lines });
      const bigger = await svc.quote({ lines: [...lines, { productId: 'p1', quantity: int(1, 10) }] });
      if (base.pricing.deliveryPence === 0 && base.lines.length > 0) expect(bigger.pricing.deliveryPence).toBe(0);
      expect(bigger.pricing.freeDeliveryRemainingPence).toBeLessThanOrEqual(base.pricing.freeDeliveryRemainingPence);
      expect(bigger.pricing.subtotalPence).toBeGreaterThanOrEqual(base.pricing.subtotalPence);
    }
  });
});
