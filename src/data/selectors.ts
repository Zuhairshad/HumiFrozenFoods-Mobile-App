import type { Category, CategoryId, Product } from '@/types';

/** Pure catalogue helpers: they take the product list explicitly so they are reactive-safe and testable. */

export function findProduct(products: readonly Product[], id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function filterByCategory(products: readonly Product[], id: CategoryId): Product[] {
  return products.filter((p) => p.category === id);
}

export function searchIn(products: readonly Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...products];
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.category.replace(/-/g, ' ').includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

const score = (p: Product) => p.rating * Math.log(p.reviewCount + 1);

export function bestSellersOf(products: readonly Product[], limit = 6): Product[] {
  return [...products].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export function relatedTo(products: readonly Product[], id: string, limit = 4): Product[] {
  const current = findProduct(products, id);
  if (!current) return [];
  const others = products.filter((p) => p.id !== id);
  const same = others.filter((p) => p.category === current.category);
  const rest = others.filter((p) => p.category !== current.category);
  return [...same, ...rest].slice(0, limit);
}

/** Categories that currently have at least one product; falls back to all when the list is empty. */
export function categoriesWithProducts(all: readonly Category[], products: readonly Product[]): Category[] {
  const present = all.filter((c) => products.some((p) => p.category === c.id));
  return present.length > 0 ? present : [...all];
}
