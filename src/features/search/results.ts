import { searchIn } from '@/data/selectors';
import type { Category, Product } from '@/types';

export type SearchItem =
  | { kind: 'category'; key: string; category: Category; count: number }
  | { kind: 'header'; key: string; title: string }
  | { kind: 'product'; key: string; product: Product; last: boolean };

/** Products whose name matches come before description/tag matches. */
function rank(list: Product[], q: string): Product[] {
  const needle = q.toLowerCase();
  const byName = list.filter((p) => p.name.toLowerCase().includes(needle));
  const rest = list.filter((p) => !p.name.toLowerCase().includes(needle));
  return [...byName, ...rest];
}

/** Flat list model for the results FlatList: category matches first, then (optionally headed) products. */
export function buildSearchItems(
  query: string,
  products: readonly Product[],
  categories: readonly Category[],
): SearchItem[] {
  const q = query.trim();
  if (!q) return [];
  const needle = q.toLowerCase();
  const items: SearchItem[] = [];

  for (const category of categories) {
    if (category.title.toLowerCase().includes(needle)) {
      items.push({
        kind: 'category',
        key: `cat-${category.id}`,
        category,
        count: products.filter((p) => p.category === category.id).length,
      });
    }
  }

  const matches = rank(searchIn(products, q), q);
  if (matches.length > 8) items.push({ kind: 'header', key: 'top-matches', title: 'Top matches' });
  matches.forEach((product, i) => {
    items.push({ kind: 'product', key: product.id, product, last: i === matches.length - 1 });
  });
  return items;
}
