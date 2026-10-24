import type { IoniconName } from '@/components/ui';
import type { Product } from '@/types';

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'rating';

export const SORT_OPTIONS: { key: SortKey; label: string; icon: IoniconName }[] = [
  { key: 'featured', label: 'Featured', icon: 'sparkles-outline' },
  { key: 'price-asc', label: 'Price: Low to High', icon: 'trending-up-outline' },
  { key: 'price-desc', label: 'Price: High to Low', icon: 'trending-down-outline' },
  { key: 'rating', label: 'Top Rated', icon: 'star-outline' },
];

export function sortProducts(list: Product[], key: SortKey): Product[] {
  if (key === 'featured') return list;
  const copy = [...list];
  if (key === 'price-asc') copy.sort((a, b) => a.price - b.price);
  else if (key === 'price-desc') copy.sort((a, b) => b.price - a.price);
  else copy.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
  return copy;
}
