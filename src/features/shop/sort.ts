import type { Product } from '@/types';

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'name';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'rating', label: 'Rating' },
  { key: 'name', label: 'A to Z' },
];

export function isSortKey(v: unknown): v is SortKey {
  return SORT_OPTIONS.some((o) => o.key === v);
}

export function sortProducts(list: Product[], key: SortKey): Product[] {
  if (key === 'featured') return list;
  const copy = [...list];
  if (key === 'price-asc') copy.sort((a, b) => a.price - b.price);
  else if (key === 'price-desc') copy.sort((a, b) => b.price - a.price);
  else if (key === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
  else copy.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  return copy;
}
