import { categories, products, searchProducts } from '@/data';
import type { CategoryId, Product } from '@/types';
import { isSortKey, sortProducts, type SortKey } from './sort';

export type CategoryFilter = CategoryId | 'all';
export type Diet = 'halal' | 'vegan';
/** Maximum minutes to ready; 0 means any. */
export type ReadyIn = 0 | 8 | 10;

export const READY_OPTIONS: { value: ReadyIn; label: string }[] = [
  { value: 0, label: 'Any' },
  { value: 8, label: '8 min' },
  { value: 10, label: '10 min' },
];

export interface ProductFilters {
  category: CategoryFilter;
  q: string;
  sort: SortKey;
  diets: Diet[];
  ready: ReadyIn;
}

export const DEFAULT_FILTERS: ProductFilters = {
  category: 'all',
  q: '',
  sort: 'featured',
  diets: [],
  ready: 0,
};

export type ParamValue = string | string[] | undefined;
export type FilterParams = Record<string, ParamValue>;

const DIET_TAG = { halal: 'Halal Certified', vegan: 'Vegan Friendly' } as const;

function first(v: ParamValue): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseCategory(v: string | undefined): CategoryFilter {
  const match = categories.find((c) => c.id === v);
  return match ? match.id : 'all';
}

function parseDiets(v: string | undefined): Diet[] {
  if (!v) return [];
  const out: Diet[] = [];
  for (const part of v.split(',')) {
    const d = part.trim();
    if ((d === 'halal' || d === 'vegan') && !out.includes(d)) out.push(d);
  }
  return out;
}

function parseReady(ready: string | undefined, quick: string | undefined): ReadyIn {
  if (ready === '8') return 8;
  if (ready === '10') return 10;
  return quick === '1' ? 10 : 0;
}

/** URL params -> filters. Unknown or malformed values fall back to defaults. */
export function parseFilters(params: FilterParams): ProductFilters {
  const sort = first(params.sort);
  return {
    category: parseCategory(first(params.category)),
    q: first(params.q) ?? '',
    sort: isSortKey(sort) ? sort : 'featured',
    diets: parseDiets(first(params.diet)),
    ready: parseReady(first(params.ready), first(params.quick)),
  };
}

/** Filters -> URL params. Defaults are emitted as `undefined` so they disappear from the URL. */
export function filtersToParams(f: ProductFilters): Record<string, string | undefined> {
  return {
    category: f.category === 'all' ? undefined : f.category,
    q: f.q ? f.q : undefined,
    sort: f.sort === 'featured' ? undefined : f.sort,
    diet: f.diets.length ? f.diets.join(',') : undefined,
    ready: f.ready ? String(f.ready) : undefined,
    // `quick` is folded into `ready`; clear it so it cannot resurrect a reset filter.
    quick: undefined,
  };
}

export function applyFilters(f: ProductFilters): Product[] {
  const q = f.q.trim();
  let list = q ? searchProducts(q) : products;
  if (f.category !== 'all') list = list.filter((p) => p.category === f.category);
  for (const d of f.diets) list = list.filter((p) => p.tags.includes(DIET_TAG[d]));
  if (f.ready) list = list.filter((p) => p.readyInMins <= f.ready);
  return sortProducts(list, f.sort);
}

/** Number of non-default refinements made in the sheet (category has its own rail). */
export function activeRefinements(f: ProductFilters): number {
  return (f.sort !== 'featured' ? 1 : 0) + f.diets.length + (f.ready ? 1 : 0);
}

export function dietLabel(d: Diet): string {
  return d === 'halal' ? 'Halal' : 'Vegan';
}

export function productCountLabel(n: number): string {
  return n === 1 ? '1 product' : `${n} products`;
}
