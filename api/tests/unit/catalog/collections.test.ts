import { describe, expect, it } from 'vitest';
import { COLLECTION_IDS, COLLECTION_TITLES, deriveCollection, emptyCollectionCounts, isCollectionId } from '../../../src/catalog/collections.js';
import type { CollectionId } from '../../../src/domain/types.js';
import { liveDocs, loadBundledCatalogue } from './support.js';

const table: readonly (readonly [string, string, CollectionId])[] = [
  ['Chicken Seekh Kebab', 'chicken-seekh-kebab', 'kebabs'],
  ['Meat Shami Kebab', 'meat-shami-kebabs', 'kebabs'],
  ['Meat Peshawari Chapli Kebab', 'meat-chapli-kebab', 'kebabs'],
  ['Chicken Tikki', 'chicken-tikki', 'kebabs'],
  ['Aloo Tikki', 'aloo-tikki', 'savory-snacks'],
  ['ALOO TIKKA', 'x', 'savory-snacks'],
  ['Vegetable Spring Rolls', 'vegetable-spring-rolls', 'savory-snacks'],
  ['Punjabi Samosa Roti', 'punjabi-samosa-roti', 'savory-snacks'],
  ['Paratha Roti', 'paratha-roti', 'savory-snacks'],
  ['Vegetable Samosa Large', 'vegatable-samosa', 'vegetable-samosas'],
  ['Vegetable Crispy Samosa', 'vegetable-crispy-samosa', 'vegetable-samosas'],
  ['', 'vegatable-samosa', 'vegetable-samosas'],
  ['Chicken Crispy Samosa', 'chicken-crispy-samosa', 'samosas'],
  ['Tandoori Chicken Samosa Large', 'tandoori-chicken-samosa', 'samosas'],
  ['MEAT SAMOSA LARGE', 'meat-samosa-large', 'samosas'],
  ['Frozen Pizza', 'frozen-pizza', 'other'],
  ['Vegetable Biryani', 'vegetable-biryani', 'other'],
  ['Kebabish Wrap', 'kebabish-wrap', 'other'],
  ['', '', 'other'],
  ['Samosaa', 'samosaa', 'other'],
];

describe('deriveCollection rules', () => {
  it.each(table)('%j / %j -> %s', (name, slug, expected) => {
    expect(deriveCollection(name, slug)).toBe(expected);
  });

  it('is not quadratic on hostile names', () => {
    const started = performance.now();
    expect(deriveCollection('vegetable '.repeat(100_000), 'x')).toBe('other');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('exposes consistent ids, titles and counts', () => {
    expect(COLLECTION_IDS.every((id) => COLLECTION_TITLES[id].length > 0)).toBe(true);
    expect(Object.keys(emptyCollectionCounts()).sort()).toEqual([...COLLECTION_IDS].sort());
    expect(isCollectionId('kebabs')).toBe(true);
    expect(isCollectionId('nope')).toBe(false);
    expect(isCollectionId({ $ne: null })).toBe(false);
  });
});

describe('parity with the bundled app catalogue (src/data/products.ts)', () => {
  const bundled = loadBundledCatalogue();
  const live = liveDocs().map((d) => ({ slug: String(d['slug']), name: String(d['name']) }));

  it('parsed the 17 bundled products and their titles match the app categories', () => {
    expect(bundled).toHaveLength(17);
    for (const [id, title] of Object.entries(COLLECTION_TITLES)) {
      if (id !== 'other') expect(['Savory Snacks', 'Kebabs', 'Vegetable Samosas', 'Samosas']).toContain(title);
    }
  });

  it('every bundled product derives its own bundled category from its id and name', () => {
    for (const product of bundled) {
      expect(deriveCollection(product.name, product.id), product.id).toBe(product.category);
    }
  });

  it('every live slug that exists in the bundled data maps to the same collection', () => {
    const byId = new Map(bundled.map((p) => [p.id, p.category]));
    const shared = live.filter((p) => byId.has(p.slug));
    expect(shared.length).toBeGreaterThan(0);
    for (const product of shared) {
      expect(deriveCollection(product.name, product.slug), product.slug).toBe(byId.get(product.slug));
    }
  });

  it('every live product maps to the same collection as the bundled product with the same name', () => {
    const byName = new Map(bundled.map((p) => [p.name.toLowerCase(), p.category]));
    for (const product of live) {
      const expected = byName.get(product.name.toLowerCase());
      expect(expected, `no bundled product named ${product.name}`).toBeDefined();
      expect(deriveCollection(product.name, product.slug), product.slug).toBe(expected);
    }
  });

  // The app uses the slug as productId, so any drift breaks cart and product lookups against the live API.
  it('live slugs and bundled ids are the same set (the owner\'s slug typos are mirrored in the app)', () => {
    expect(live.map((p) => p.slug).sort()).toEqual(bundled.map((p) => p.id).sort());
  });
});
