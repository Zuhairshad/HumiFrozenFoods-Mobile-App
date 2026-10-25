import { getCatalogProducts } from '@/store/catalog';
import type { CategoryId, Product } from '@/types';
import { bestSellersOf, filterByCategory, findProduct, relatedTo, searchIn } from './selectors';

export { categories } from './categories';
export { testimonials } from './testimonials';
export { heroSlides } from './hero';
export { siteInfo } from './site';
export { bundledProducts } from './products';

/*
 * Sync helpers over the catalogue store's CURRENT snapshot (live data once fetched, bundled before).
 * They are for non-reactive code (gateways, event handlers). Components must use the hooks in
 * '@/hooks/useProducts' so the UI updates when live data arrives.
 */

export function getProduct(id: string): Product | undefined {
  return findProduct(getCatalogProducts(), id);
}

export function getProductsByCategory(id: CategoryId): Product[] {
  return filterByCategory(getCatalogProducts(), id);
}

export function searchProducts(query: string): Product[] {
  return searchIn(getCatalogProducts(), query);
}

export function getBestSellers(limit = 6): Product[] {
  return bestSellersOf(getCatalogProducts(), limit);
}

export function getRelatedProducts(id: string, limit = 4): Product[] {
  return relatedTo(getCatalogProducts(), id, limit);
}
