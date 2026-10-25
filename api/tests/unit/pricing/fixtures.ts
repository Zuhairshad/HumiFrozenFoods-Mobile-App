import type { Clock, ProductsRepository } from '../../../src/domain/ports.js';
import type { BusinessConfig, ProductRecord } from '../../../src/domain/types.js';

export function product(slug: string, overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: slug,
    sourceId: `src-${slug}`,
    name: `Product ${slug}`,
    description: '',
    pricePence: 500,
    compareAtPricePence: null,
    unit: null,
    image: { thumbnail: `https://img.test/${slug}-t.jpg`, original: `https://img.test/${slug}.jpg` },
    gallery: [],
    inStock: true,
    lowStock: false,
    collection: 'other',
    categories: [],
    rating: 0,
    reviewCount: 0,
    stock: null,
    ...overrides,
  };
}

export function fakeProducts(records: readonly ProductRecord[]): ProductsRepository {
  return {
    list: () => Promise.resolve({ items: [...records], nextCursor: null }),
    findByIdOrSlug: (key) => Promise.resolve(records.find((p) => p.id === key) ?? null),
    findManyBySlugs: (slugs) => Promise.resolve(records.filter((p) => slugs.includes(p.id))),
    countByCollection: () =>
      Promise.resolve({ 'savory-snacks': 0, kebabs: 0, 'vegetable-samosas': 0, samosas: 0, other: 0 }),
  };
}

export function business(overrides: Partial<BusinessConfig['delivery']> = {}, promoCodes: BusinessConfig['promoCodes'] = []): BusinessConfig {
  return {
    delivery: { feePence: 799, freeThresholdPence: 5000, minOrderPence: 0, ...overrides },
    promoCodes,
    paidOrderStatus: 'order-pending',
    orderNumberDigits: 12,
    pendingOrderTtlMinutes: 120,
    lowStockThreshold: 5,
    collections: { orders: 'orders', products: 'products' },
  };
}

export const NOW = new Date('2026-06-01T12:00:00.000Z');
export const fixedClock: Clock = { now: () => NOW };

/** Small seeded PRNG so property tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
