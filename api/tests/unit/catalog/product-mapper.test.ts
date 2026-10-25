import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { mapProductDocument, toPublicProduct } from '../../../src/catalog/product-mapper.js';
import type { ProductRecord } from '../../../src/domain/types.js';
import { type Doc, liveDocs, testBusiness } from './support.js';

const PUBLIC_KEYS = [
  'categories', 'collection', 'compareAtPricePence', 'description', 'gallery', 'id', 'image', 'inStock', 'lowStock',
  'name', 'pricePence', 'rating', 'reviewCount', 'sourceId', 'unit',
];
const FORBIDDEN = ['b2b_pricing', 'b2b', 'tier_prices', 'quantity', 'sold_quantity', 'sku', '__v', 'status', 'visibility', 'stock', 'type', 'promotional_sliders', 'banners', 'shop', 'createdAt', 'updatedAt'];

function base(overrides: Doc = {}): Doc {
  return {
    _id: '698601c30c0410b7e96591dc',
    slug: 'test-samosa',
    name: 'Test Samosa',
    price: 7.5,
    quantity: 100,
    in_stock: true,
    ...overrides,
  };
}

function ok(doc: unknown): ProductRecord {
  const result = mapProductDocument(doc, testBusiness);
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.record;
}

function reason(doc: unknown): string {
  const result = mapProductDocument(doc, testBusiness);
  if (result.ok) throw new Error('expected a skip');
  return result.reason;
}

describe('live fixture', () => {
  const docs = liveDocs();

  it('maps all 17 live documents', () => {
    expect(docs).toHaveLength(17);
    const records = docs.map(ok);
    expect(new Set(records.map((r) => r.id)).size).toBe(17);
    expect(records.every((r) => r.pricePence > 0 && r.sourceId.length === 24 && r.image !== null)).toBe(true);
  });

  it('never leaks sensitive or internal fields on the wire', () => {
    for (const doc of docs) {
      const wire = toPublicProduct(ok(doc));
      expect(Object.keys(wire).sort()).toEqual(PUBLIC_KEYS);
      const json = JSON.stringify(wire);
      for (const key of FORBIDDEN) expect(json, key).not.toContain(`"${key}"`);
      // The fixture really contains the sensitive fields, so the absence above is meaningful.
      expect(doc['b2b_pricing']).toBeDefined();
      expect(doc['sku']).toBeDefined();
      expect(doc['__v']).toBeDefined();
      expect(doc['quantity']).toBeDefined();
    }
  });

  it('applies the site price rule: sale_price when truthy, else price', () => {
    const roti = ok(docs.find((d) => d['slug'] === 'punjabi-samosa-roti'));
    expect(roti.pricePence).toBe(598);
    const shami = ok(docs.find((d) => d['slug'] === 'chicken-shami-kebab'));
    expect(shami.pricePence).toBe(950);
    expect(shami.compareAtPricePence).toBeNull();
  });

  it('does not show a 1p strike-through when the site flags discount:false', () => {
    const roti = docs.find((d) => d['slug'] === 'punjabi-samosa-roti');
    expect(roti?.['discount']).toBe(false);
    expect(ok(roti).compareAtPricePence).toBeNull();
  });

  it('upgrades image URLs to https, decodes descriptions and keeps gallery images', () => {
    const roti = ok(docs.find((d) => d['slug'] === 'punjabi-samosa-roti'));
    expect(roti.image?.original.startsWith('https://api.humisfrozenfoods.com/uploads/images/')).toBe(true);
    expect(roti.description.startsWith('Humi’s Frozen Punjabi Samosa Roti Humi’s Frozen Punjab Samosa Roti is a premium')).toBe(true);
    expect(roti.description).not.toMatch(/[<>]|&lt;|&amp;/);
    const spring = ok(docs.find((d) => d['slug'] === 'chicken-spring-rolls'));
    expect(spring.gallery).toHaveLength(2);
    expect(spring.gallery.every((u) => u.startsWith('https://'))).toBe(true);
  });

  it('maps the single live category and tolerates the product with none', () => {
    expect(ok(docs[0]).categories).toEqual([{ id: '6982051e8d3a0ccc2132e558', name: 'Frozen Bakery', slug: 'frozen-bakery-bakery' }]);
    expect(ok(docs.find((d) => d['slug'] === 'vegatable-samosa')).categories).toEqual([]);
  });

  it('keeps unit as stored (a bare grams string on the live site)', () => {
    expect(ok(docs[0]).unit).toBe('500');
  });
});

describe('pricing', () => {
  it.each([
    [{ price: 5.99, sale_price: 5.98 }, 598],
    [{ price: 5.99, sale_price: null }, 599],
    [{ price: 5.99, sale_price: 0 }, 599],
    [{ price: 5.99 }, 599],
    [{ price: 5.985 }, 599],
    [{ price: 0.1 + 0.2 }, 30],
    [{ price: '7.50' }, 750],
    [{ price: 7, sale_price: '6.25' }, 625],
    [{ price: 7, sale_price: 'free' }, 700],
    [{ price: 7, sale_price: -1 }, 700],
    [{ price: 7, sale_price: Number.NaN }, 700],
  ])('%j -> %i pence', (fields, expected) => {
    expect(ok(base(fields)).pricePence).toBe(expected);
  });

  it('only shows compareAt when discount is true and the sale is lower', () => {
    expect(ok(base({ price: 10, sale_price: 8, discount: true })).compareAtPricePence).toBe(1000);
    expect(ok(base({ price: 10, sale_price: 8, discount: false })).compareAtPricePence).toBeNull();
    expect(ok(base({ price: 10, sale_price: 8 })).compareAtPricePence).toBeNull();
    expect(ok(base({ price: 10, sale_price: 10, discount: true })).compareAtPricePence).toBeNull();
    expect(ok(base({ price: 10, sale_price: 12, discount: true })).compareAtPricePence).toBeNull();
    expect(ok(base({ price: 10, discount: true })).compareAtPricePence).toBeNull();
    expect(ok(base({ price: 10, sale_price: 8, discount: 'true' })).compareAtPricePence).toBe(1000);
  });

  it.each([
    ['missing', {}],
    ['zero', { price: 0 }],
    ['negative', { price: -3 }],
    ['NaN', { price: Number.NaN }],
    ['Infinity', { price: Number.POSITIVE_INFINITY }],
    ['text', { price: 'cheap' }],
    ['object', { price: { $gt: 0 } }],
    ['absurd', { price: 1e12 }],
    ['sale absurd', { price: 5, sale_price: 1e12 }],
  ])('skips a document whose price is %s', (_label, fields) => {
    const doc = base({ price: undefined, ...fields });
    expect(reason(doc)).toMatch(/price/);
  });
});

describe('stock flags', () => {
  it.each([
    [{ quantity: 100, in_stock: true }, true, false, 100],
    [{ quantity: 5, in_stock: true }, true, true, 5],
    [{ quantity: 6 }, true, false, 6],
    [{ quantity: 1 }, true, true, 1],
    [{ quantity: 0, in_stock: true }, false, false, 0],
    [{ quantity: 50, in_stock: false }, false, false, 50],
    [{ quantity: 50, in_stock: 'false' }, false, false, 50],
    [{ quantity: -4 }, true, false, null],
    [{ quantity: 'lots' }, true, false, null],
    [{ quantity: undefined, in_stock: undefined }, true, false, null],
    [{ quantity: 2.9 }, true, true, 2],
    [{ quantity: undefined, in_stock: false }, false, false, null],
  ])('%j -> inStock %s lowStock %s stock %s', (fields, inStock, lowStock, stock) => {
    const record = ok(base({ quantity: undefined, in_stock: undefined, ...fields }));
    expect(record.inStock).toBe(inStock);
    expect(record.lowStock).toBe(lowStock);
    expect(record.stock).toBe(stock);
  });

  it('honours the configured threshold', () => {
    const result = mapProductDocument(base({ quantity: 9 }), { lowStockThreshold: 10 });
    expect(result.ok && result.record.lowStock).toBe(true);
    const zero = mapProductDocument(base({ quantity: 1 }), { lowStockThreshold: 0 });
    expect(zero.ok && zero.record.lowStock).toBe(false);
  });
});

describe('ratings and reviews', () => {
  it.each([
    [{ ratings: 4.56, total_reviews: 12 }, 4.6, 12],
    [{ ratings: 9, total_reviews: 3.9 }, 5, 3],
    [{ ratings: -2, total_reviews: -5 }, 0, 0],
    [{ ratings: 'x', total_reviews: null }, 0, 0],
    [{}, 0, 0],
    [{ ratings: 4, total_reviews: 1e15 }, 4, 1_000_000_000],
  ])('%j -> %s / %s', (fields, rating, reviews) => {
    const record = ok(base(fields));
    expect(record.rating).toBe(rating);
    expect(record.reviewCount).toBe(reviews);
  });
});

describe('identity, text and urls', () => {
  it('accepts a real ObjectId instance as _id and as a category id', () => {
    const id = new ObjectId();
    const record = ok(base({ _id: id, categories: [{ _id: new ObjectId(id.toHexString()), name: 'Cat', slug: 'cat' }] }));
    expect(record.sourceId).toBe(id.toHexString());
    expect(record.categories[0]?.id).toBe(id.toHexString());
  });

  it('lower-cases an upper-case hex _id', () => {
    expect(ok(base({ _id: 'ABCDEFABCDEFABCDEFABCDEF' })).sourceId).toBe('abcdefabcdefabcdefabcdef');
  });

  it.each([
    ['not an object', null],
    ['array', []],
    ['string', 'doc'],
  ])('skips %s', (_label, doc) => {
    expect(reason(doc)).toBe('not an object');
  });

  it.each([
    ['no _id', { _id: undefined }],
    ['short _id', { _id: 'abc' }],
    ['12-char _id', { _id: 'abcdefghijkl' }],
    ['object _id', { _id: { $ne: null } }],
    ['number _id', { _id: 7 }],
  ])('skips a document with %s', (_label, fields) => {
    expect(reason(base(fields))).toMatch(/_id/);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['spaces', 'a b'],
    ['slash', 'a/b'],
    ['dollar', '$where'],
    ['unicode', 'samösa'],
    ['leading dash', '-abc'],
    ['too long', 'a'.repeat(101)],
    ['object', { $ne: null }],
  ])('skips a document with slug %s', (_label, slug) => {
    expect(reason(base({ slug }))).toMatch(/slug/);
  });

  it('keeps the slug exactly as stored (including case) so lookups round-trip', () => {
    expect(ok(base({ slug: 'Mixed_Case-1' })).id).toBe('Mixed_Case-1');
  });

  it('skips a document without a usable name and cleans the name otherwise', () => {
    expect(reason(base({ name: '   ' }))).toMatch(/name/);
    expect(reason(base({ name: 42 }))).toMatch(/name/);
    expect(ok(base({ name: ' Meat \n\t Samosa\u0000 ' })).name).toBe('Meat Samosa');
    expect(ok(base({ name: 'x'.repeat(500) })).name).toHaveLength(120);
  });

  it('strips markup and script from the description', () => {
    const record = ok(base({ description: '&lt;p>Tasty&lt;/p>&lt;script>alert(1)&lt;/script><img src=x onerror=alert(2)>' }));
    expect(record.description).toBe('Tasty');
  });

  it('survives a missing or non-string description', () => {
    expect(ok(base({ description: undefined })).description).toBe('');
    expect(ok(base({ description: { $ne: null } })).description).toBe('');
  });

  it('handles image shapes: partial, http, hostile, and wrong types', () => {
    expect(ok(base({ image: { thumbnail: 'http://x.example/t.png' } })).image).toEqual({ thumbnail: 'https://x.example/t.png', original: 'https://x.example/t.png' });
    expect(ok(base({ image: { original: 'https://x.example/o.png', thumbnail: 'javascript:alert(1)' } })).image).toEqual({
      thumbnail: 'https://x.example/o.png',
      original: 'https://x.example/o.png',
    });
    expect(ok(base({ image: { original: 'data:text/html,x', thumbnail: 'ftp://x' } })).image).toBeNull();
    expect(ok(base({ image: 'https://x.example/a.png' })).image).toBeNull();
    expect(ok(base({ image: null })).image).toBeNull();
  });

  it('handles gallery shapes: strings, objects, duplicates, junk and the cap', () => {
    const gallery = [
      'http://a.example/1.png',
      { original: 'https://a.example/1.png' },
      { thumbnail: 'http://a.example/2.png' },
      { original: 'javascript:alert(1)' },
      42,
      null,
    ];
    expect(ok(base({ gallery })).gallery).toEqual(['https://a.example/1.png', 'https://a.example/2.png']);
    expect(ok(base({ gallery: 'nope' })).gallery).toEqual([]);
    const many = Array.from({ length: 50 }, (_, i) => `https://a.example/${String(i)}.png`);
    expect(ok(base({ gallery: many })).gallery).toHaveLength(20);
  });

  it('skips malformed categories but keeps good ones, capped', () => {
    const categories = [
      { _id: 'c1', name: 'Good', slug: 'good' },
      { _id: 'c2', name: 'No slug' },
      { name: 'No id', slug: 'no-id' },
      { _id: 'c3', name: '  ', slug: 's' },
      'junk',
      { id: 'c4', name: 'By id', slug: 'by-id' },
    ];
    expect(ok(base({ categories })).categories.map((c) => c.id)).toEqual(['c1', 'c4']);
    expect(ok(base({ categories: 'nope' })).categories).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => ({ _id: `c${String(i)}`, name: 'n', slug: 's' }));
    expect(ok(base({ categories: many })).categories).toHaveLength(10);
  });

  it('derives unit from strings and numbers and drops junk', () => {
    expect(ok(base({ unit: ' 500 ' })).unit).toBe('500');
    expect(ok(base({ unit: 700 })).unit).toBe('700');
    expect(ok(base({ unit: '' })).unit).toBeNull();
    expect(ok(base({ unit: { $ne: null } })).unit).toBeNull();
    expect(ok(base({ unit: 'x'.repeat(80) })).unit).toHaveLength(30);
  });

  it('derives the collection from name and slug', () => {
    expect(ok(base({ name: 'Chicken Seekh Kebab', slug: 'chicken-seekh-kebab' })).collection).toBe('kebabs');
  });

  it('ignores extra hostile fields entirely', () => {
    const record = ok(base({ b2b_pricing: { price: 1 }, sku: 'S', __v: 3, status: 'publish', $where: '1', constructor: 'x' }));
    expect(JSON.stringify(toPublicProduct(record))).not.toMatch(/b2b|"sku"|__v|\$where/);
  });
});
