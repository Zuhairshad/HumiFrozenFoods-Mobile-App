import { describe, expect, it } from 'vitest';
import { bundledProducts } from '@/data/products';
import { categories } from '@/data/categories';
import { bestSellersOf, categoriesWithProducts, filterByCategory, findProduct, relatedTo, searchIn } from '@/data/selectors';
import { buildSearchItems } from '@/features/search/results';
import { applyFilters, DEFAULT_FILTERS, parseFilters, filtersToParams, activeRefinements } from '@/features/shop/filters';
import { sortProducts } from '@/features/shop/sort';
import { selectBuyAgain, selectNewThisWeek, selectTopPicks } from '@/features/home/selectors';
import type { Product } from '@/types';

const mk = (over: Partial<Product> & { id: string }): Product => ({
  ...bundledProducts[0],
  name: over.id,
  tags: [],
  ...over,
});

const P = bundledProducts;

describe('catalogue selectors', () => {
  it('findProduct / filterByCategory', () => {
    expect(findProduct(P, 'aloo-tikki')?.name).toBe('Aloo Tikki');
    expect(findProduct(P, 'nope')).toBeUndefined();
    expect(filterByCategory(P, 'kebabs').every((p) => p.category === 'kebabs')).toBe(true);
    expect(filterByCategory(P, 'other')).toEqual([]);
  });

  it('searchIn matches name, category words, description and tags; blank returns everything', () => {
    expect(searchIn(P, '  ')).toHaveLength(P.length);
    expect(searchIn(P, 'SHAMI').map((p) => p.id)).toEqual(expect.arrayContaining(['chicken-shami-kebab', 'meat-shami-kebabs']));
    expect(searchIn(P, 'savory snacks').length).toBeGreaterThan(0);
    expect(searchIn(P, 'vegan').length).toBeGreaterThan(0);
    expect(searchIn(P, 'zzzzqqq')).toEqual([]);
    expect(searchIn([mk({ id: 'x', description: 'crispy pastry' })], 'pastry')).toHaveLength(1);
  });

  it('bestSellersOf ranks by rating * log(reviews) and respects the limit', () => {
    const list = [mk({ id: 'a', rating: 4, reviewCount: 1 }), mk({ id: 'b', rating: 5, reviewCount: 100 }), mk({ id: 'c', rating: 0, reviewCount: 0 })];
    expect(bestSellersOf(list, 2).map((p) => p.id)).toEqual(['b', 'a']);
    expect(bestSellersOf(list)).toHaveLength(3);
    expect(list.map((p) => p.id)).toEqual(['a', 'b', 'c']); // input not mutated
  });

  it('relatedTo prefers the same category and excludes the product itself', () => {
    const r = relatedTo(P, 'chicken-shami-kebab', 4);
    expect(r).toHaveLength(4);
    expect(r.some((p) => p.id === 'chicken-shami-kebab')).toBe(false);
    expect(r[0].category).toBe('kebabs');
    expect(relatedTo(P, 'missing')).toEqual([]);
  });

  it('categoriesWithProducts hides empty categories but never returns none', () => {
    const only = P.filter((p) => p.category === 'kebabs');
    expect(categoriesWithProducts(categories, only).map((c) => c.id)).toEqual(['kebabs']);
    expect(categoriesWithProducts(categories, [])).toHaveLength(4);
    expect(categoriesWithProducts(categories, [mk({ id: 'o', category: 'other' })])).toHaveLength(4);
  });
});

describe('shop sort', () => {
  const list = [mk({ id: 'b', price: 5, rating: 4, reviewCount: 1 }), mk({ id: 'a', price: 9, rating: 4, reviewCount: 10 }), mk({ id: 'c', price: 7, rating: 5, reviewCount: 2 })];
  it.each([
    ['featured', ['b', 'a', 'c']],
    ['price-asc', ['b', 'c', 'a']],
    ['price-desc', ['a', 'c', 'b']],
    ['rating', ['c', 'a', 'b']],
    ['name', ['a', 'b', 'c']],
  ] as const)('%s', (key, ids) => {
    expect(sortProducts(list, key).map((p) => p.id)).toEqual(ids);
  });
});

describe('shop filters (applyFilters)', () => {
  it('combines category, diet, ready-in and search against the given catalogue', () => {
    const list = [
      mk({ id: 'k1', category: 'kebabs', tags: ['Halal Certified'], readyInMins: 10 }),
      mk({ id: 'k2', category: 'kebabs', tags: ['Vegan Friendly'], readyInMins: 6 }),
      mk({ id: 's1', category: 'samosas', tags: ['Halal Certified'], readyInMins: 0 }), // unknown time
      mk({ id: 'o1', category: 'other', tags: [], readyInMins: 5 }),
    ];
    const f = DEFAULT_FILTERS;
    expect(applyFilters(f, list)).toHaveLength(4); // 'other' shows under All
    expect(applyFilters({ ...f, category: 'kebabs' }, list).map((p) => p.id)).toEqual(['k1', 'k2']);
    expect(applyFilters({ ...f, category: 'other' }, list).map((p) => p.id)).toEqual(['o1']);
    expect(applyFilters({ ...f, diets: ['halal'] }, list).map((p) => p.id)).toEqual(['k1', 's1']);
    expect(applyFilters({ ...f, ready: 8 }, list).map((p) => p.id)).toEqual(['k2', 'o1']); // unknown (0) never matches
    expect(applyFilters({ ...f, q: 'k2' }, list).map((p) => p.id)).toEqual(['k2']);
    expect(applyFilters({ ...f, sort: 'name' }, list).map((p) => p.id)).toEqual(['k1', 'k2', 'o1', 's1']);
  });

  it('parseFilters / filtersToParams round trip and reject junk', () => {
    const parsed = parseFilters({ category: ['kebabs'], q: 'x', sort: 'price-asc', diet: 'halal,vegan,bogus', quick: '1' });
    expect(parsed).toEqual({ category: 'kebabs', q: 'x', sort: 'price-asc', diets: ['halal', 'vegan'], ready: 10 });
    expect(filtersToParams(parsed)).toMatchObject({ category: 'kebabs', diet: 'halal,vegan', ready: '10', quick: undefined });
    expect(parseFilters({ category: 'other', sort: 'zzz', ready: '8' })).toMatchObject({ category: 'all', sort: 'featured', ready: 8 });
    expect(activeRefinements(parsed)).toBe(4);
  });
});

describe('search results model', () => {
  it('lists matching categories first, then name matches before other matches', () => {
    const items = buildSearchItems('kebab', P, categories);
    expect(items[0]).toMatchObject({ kind: 'category' });
    const products = items.filter((i) => i.kind === 'product');
    expect(products.length).toBeGreaterThan(0);
    expect(products.at(-1)).toMatchObject({ last: true });
    expect(buildSearchItems('   ', P, categories)).toEqual([]);
    expect(buildSearchItems('zzzqqq', P, categories)).toEqual([]);
  });
  it('adds a header when more than 8 products match', () => {
    const many = Array.from({ length: 9 }, (_, i) => mk({ id: `tikka-${i}` }));
    expect(buildSearchItems('tikka', many, categories)[0]).toMatchObject({ kind: 'header' });
  });
  it('uses the live list it is given (a product absent from it cannot be found)', () => {
    expect(buildSearchItems('aloo', P.filter((p) => p.id !== 'aloo-tikki'), categories)).toEqual([]);
  });
});

describe('home selectors', () => {
  it('selectBuyAgain skips vanished products and de-duplicates', () => {
    const orders = [
      { lines: [{ productId: 'aloo-tikki', quantity: 2 }, { productId: 'gone', quantity: 1 }] },
      { lines: [{ productId: 'aloo-tikki', quantity: 9 }, { productId: 'meat-spring-rolls', quantity: 1 }] },
    ] as never;
    const out = selectBuyAgain(orders, P, 8);
    expect(out.map((b) => [b.product.id, b.quantity])).toEqual([['aloo-tikki', 2], ['meat-spring-rolls', 1]]);
    expect(selectBuyAgain(orders, P, 1)).toHaveLength(1);
  });
  it('selectNewThisWeek prefers tagged, else the newest at the end of the list', () => {
    const list = [mk({ id: 'a' }), mk({ id: 'b', tags: ['New'] }), mk({ id: 'c' })];
    expect(selectNewThisWeek(list).map((p) => p.id)).toEqual(['b']);
    expect(selectNewThisWeek([mk({ id: 'a' }), mk({ id: 'c' })], 1).map((p) => p.id)).toEqual(['c']);
  });
  it('selectTopPicks skips the first shelf when requested', () => {
    expect(selectTopPicks(P, false)).toHaveLength(9);
    expect(selectTopPicks(P, true)).toHaveLength(9);
    expect(selectTopPicks(P, true)[0].id).not.toBe(selectTopPicks(P, false)[0].id);
  });
});
