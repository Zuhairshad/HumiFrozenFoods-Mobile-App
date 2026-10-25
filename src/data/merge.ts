import type { PublicProduct } from '@/lib/api/catalog-client';
import { penceToPounds } from '@/lib/format';
import type { CategoryId, Product } from '@/types';

const CATEGORY_IDS: readonly CategoryId[] = ['savory-snacks', 'kebabs', 'vegetable-samosas', 'samosas', 'other'];

/** API `collection` -> the app's CategoryId. Anything unknown becomes 'other' (shown under All only). */
export function categoryFromCollection(collection: string): CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(collection) ? (collection as CategoryId) : 'other';
}

const SMALL_WORDS = new Set(['and', 'of', 'the', 'with', 'in', 'a', 'an']);

/**
 * Admin-portal names are often typed in ALL CAPS. Only names with no lower-case letters are touched, so
 * an intentionally mixed-case name ("iPhone Case") is left exactly as written.
 */
export function toDisplayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!/[A-Z]/.test(trimmed) || /[a-z]/.test(trimmed)) return trimmed;
  return trimmed
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/(^|[-/(])([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase())))
    .join(' ');
}

/** The API `unit` is sometimes a bare grams figure ("500"); anything else is shown as written. */
export function formatUnit(unit: string | null | undefined): string {
  const u = (unit ?? '').trim();
  return /^\d+(\.\d+)?$/.test(u) ? `${u}g` : u;
}

/**
 * One live product merged with its bundled twin (matched by slug).
 *
 * Live wins: name, price, image, gallery, inStock/lowStock, description, rating, reviewCount, category.
 * Bundled enrichment fills what the API does not carry: weight, ingredients, readyInMins, tags.
 * Live-only products get neutral defaults (no invented claims): no tags, readyInMins 0 (= unknown),
 * weight falls back to the API `unit`, empty ingredients.
 * `price` (pounds) exists for display only and is always derived from `pricePence`.
 */
export function mergeProduct(live: PublicProduct, bundled?: Product): Product {
  const liveCategory = categoryFromCollection(live.collection);
  const image = live.image?.original || live.image?.thumbnail || bundled?.image || '';
  const merged: Product = {
    id: live.id,
    name: toDisplayName(live.name) || bundled?.name || live.id,
    pricePence: live.pricePence,
    price: penceToPounds(live.pricePence),
    inStock: live.inStock,
    category: liveCategory !== 'other' ? liveCategory : (bundled?.category ?? 'other'),
    image,
    description: live.description.trim() || bundled?.description || '',
    tags: bundled ? [...bundled.tags] : [],
    readyInMins: bundled?.readyInMins ?? 0,
    weight: bundled?.weight || formatUnit(live.unit),
    rating: live.rating,
    reviewCount: live.reviewCount,
    ingredients: bundled?.ingredients ?? '',
  };
  if (live.lowStock) merged.lowStock = true;
  if (live.gallery.length > 0) merged.gallery = [...live.gallery];
  if (live.compareAtPricePence !== null) merged.compareAtPricePence = live.compareAtPricePence;
  return merged;
}

/**
 * The live list merged against the bundled one. Result order follows the API. Bundled products that the
 * API no longer lists (unpublished) are intentionally absent.
 */
export function mergeCatalog(live: readonly PublicProduct[], bundled: readonly Product[]): Product[] {
  const bySlug = new Map(bundled.map((p) => [p.id, p]));
  return live.map((p) => mergeProduct(p, bySlug.get(p.id)));
}
