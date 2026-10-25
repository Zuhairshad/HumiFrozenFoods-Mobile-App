import { describe, expect, it } from 'vitest';
import { categoryFromCollection, mergeCatalog, mergeProduct } from '@/data/merge';
import { bundledProducts } from '@/data/products';
import type { Product } from '@/types';
import { livePublic } from './fixtures';

const bundled = bundledProducts.find((p) => p.id === 'chicken-shami-kebab') as Product;

describe('mergeProduct', () => {
  it('live wins for name, price, image, gallery, stock, description, rating, reviews', () => {
    const m = mergeProduct(
      livePublic({
        name: 'Live Name',
        pricePence: 1234,
        gallery: ['https://cdn.example.com/g1.jpg'],
        inStock: false,
        description: 'New words',
        rating: 3.1,
        reviewCount: 7,
      }),
      bundled,
    );
    expect(m).toMatchObject({
      id: 'chicken-shami-kebab',
      name: 'Live Name',
      pricePence: 1234,
      price: 12.34,
      image: 'https://cdn.example.com/o.jpg',
      gallery: ['https://cdn.example.com/g1.jpg'],
      inStock: false,
      description: 'New words',
      rating: 3.1,
      reviewCount: 7,
    });
  });

  it('keeps bundled enrichment (weight, ingredients, readyInMins, tags) by slug', () => {
    const m = mergeProduct(livePublic(), bundled);
    expect(m.weight).toBe(bundled.weight);
    expect(m.ingredients).toBe(bundled.ingredients);
    expect(m.readyInMins).toBe(bundled.readyInMins);
    expect(m.tags).toEqual(bundled.tags);
    expect(m.tags).not.toBe(bundled.tags);
  });

  it('table: missing fields fall back sensibly', () => {
    const cases: { name: string; live: Parameters<typeof livePublic>[0]; bundled?: Product; check: (p: Product) => void }[] = [
      { name: 'no image, bundled has one', live: { image: null }, bundled, check: (p) => expect(p.image).toBe(bundled.image) },
      { name: 'no image, live-only', live: { image: null }, check: (p) => expect(p.image).toBe('') },
      {
        name: 'thumbnail only is used',
        live: { image: { thumbnail: 'https://x.test/t.jpg', original: '' } },
        check: (p) => expect(p.image).toBe('https://x.test/t.jpg'),
      },
      { name: 'empty description falls back to bundled', live: { description: '  ' }, bundled, check: (p) => expect(p.description).toBe(bundled.description) },
      { name: 'empty description live-only', live: { description: '' }, check: (p) => expect(p.description).toBe('') },
      { name: 'live-only defaults', live: { id: 'new-thing', unit: null }, check: (p) => expect([p.tags, p.readyInMins, p.weight, p.ingredients]).toEqual([[], 0, '', '']) },
      { name: 'live-only uses unit as weight', live: { id: 'new-thing', unit: '12 pcs' }, check: (p) => expect(p.weight).toBe('12 pcs') },
      { name: 'bundled weight beats unit', live: { unit: 'pack' }, bundled, check: (p) => expect(p.weight).toBe(bundled.weight) },
      { name: 'blank name falls back to bundled name', live: { name: ' ' }, bundled, check: (p) => expect(p.name).toBe(bundled.name) },
      { name: 'blank name live-only falls back to id', live: { id: 'abc', name: ' ' }, check: (p) => expect(p.name).toBe('abc') },
      { name: 'lowStock flag passes through', live: { lowStock: true }, check: (p) => expect(p.lowStock).toBe(true) },
      { name: 'lowStock absent when false', live: { lowStock: false }, check: (p) => expect(p).not.toHaveProperty('lowStock') },
      { name: 'compareAt passes through', live: { compareAtPricePence: 1200 }, check: (p) => expect(p.compareAtPricePence).toBe(1200) },
      { name: 'no gallery key when empty', live: { gallery: [] }, check: (p) => expect(p).not.toHaveProperty('gallery') },
      { name: 'zero price stays zero', live: { pricePence: 0 }, check: (p) => expect([p.price, p.pricePence]).toEqual([0, 0]) },
    ];
    for (const c of cases) {
      c.check(mergeProduct(livePublic(c.live), c.bundled));
    }
  });

  it('price is always pricePence / 100 (no float drift on display price)', () => {
    for (const pence of [1, 99, 598, 1999, 12345]) {
      expect(mergeProduct(livePublic({ pricePence: pence })).price).toBe(pence / 100);
    }
  });

  it('category: live collection wins; "other" falls back to bundled category', () => {
    expect(mergeProduct(livePublic({ collection: 'samosas' }), bundled).category).toBe('samosas');
    expect(mergeProduct(livePublic({ collection: 'other' }), bundled).category).toBe(bundled.category);
    expect(mergeProduct(livePublic({ collection: 'other', id: 'zzz' })).category).toBe('other');
  });

  it('categoryFromCollection maps unknown values to other', () => {
    expect(categoryFromCollection('kebabs')).toBe('kebabs');
    expect(categoryFromCollection('desserts')).toBe('other');
    expect(categoryFromCollection('')).toBe('other');
  });
});

describe('mergeCatalog', () => {
  it('follows live order, drops unpublished bundled products and adds live-only ones', () => {
    const live = [livePublic({ id: 'brand-new', name: 'Brand New' }), livePublic({ id: 'aloo-tikki', name: 'Aloo Tikki' })];
    const merged = mergeCatalog(live, bundledProducts);
    expect(merged.map((p) => p.id)).toEqual(['brand-new', 'aloo-tikki']);
    expect(merged[1].weight).toBe(bundledProducts.find((p) => p.id === 'aloo-tikki')?.weight);
    expect(merged[0].tags).toEqual([]);
  });

  it('bundled ids all use live slugs (parity result)', () => {
    expect(bundledProducts).toHaveLength(17);
    expect(new Set(bundledProducts.map((p) => p.id)).size).toBe(17);
    for (const id of ['meat-chapli-kebab', 'chicken-chapli-kebab', 'tandoori-chicken-samosa', 'vegatable-samosa', 'meat-shami-kebabs']) {
      expect(bundledProducts.some((p) => p.id === id)).toBe(true);
    }
    for (const p of bundledProducts) {
      expect(p.pricePence).toBe(Math.round(p.price * 100));
      expect(p.inStock).toBe(true);
    }
  });
});
