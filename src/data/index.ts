import type { CategoryId, Product } from '@/types';
import { products } from './products';

export { categories } from './categories';
export { products } from './products';
export { testimonials } from './testimonials';
export { heroSlides } from './hero';
export { siteInfo } from './site';

export function getProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getProductsByCategory(id: CategoryId): Product[] {
  return products.filter((p) => p.category === id);
}

export function searchProducts(query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.category.replace(/-/g, ' ').includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function getBestSellers(limit = 6): Product[] {
  return [...products]
    .sort((a, b) => b.rating * Math.log(b.reviewCount + 1) - a.rating * Math.log(a.reviewCount + 1))
    .slice(0, limit);
}

export function getRelatedProducts(id: string, limit = 4): Product[] {
  const current = getProduct(id);
  if (!current) return [];
  const others = products.filter((p) => p.id !== id);
  const same = others.filter((p) => p.category === current.category);
  const rest = others.filter((p) => p.category !== current.category);
  return [...same, ...rest].slice(0, limit);
}
