import { categories } from '@/data/categories';
import type { Product, ProductTag } from '@/types';

const TAG_SHORT: Partial<Record<ProductTag, string>> = {
  'Halal Certified': 'Halal',
  'Vegan Friendly': 'Vegan',
  'Omega-3 Rich': 'Omega-3',
};

/** Tags worth showing in a footnote (Best Seller / New are marketing, not information). */
export function dietTags(product: Product): string[] {
  const out: string[] = [];
  for (const t of product.tags) {
    const short = TAG_SHORT[t];
    if (short) out.push(short);
    else if (t === 'Premium') out.push('Premium');
  }
  return out;
}

export function categoryTitle(product: Product): string {
  return categories.find((c) => c.id === product.category)?.title ?? '';
}

/** "Kebabs · Halal · 12 pcs" for search rows. */
export function searchFootnote(product: Product): string {
  const parts = [categoryTitle(product), ...dietTags(product).slice(0, 1), product.weight].filter(Boolean);
  return parts.join(' · ');
}

/** Accessibility label shared by tiles and rows: "{name}, {weight}, {price}". */
export function productA11yLabel(product: Product, priceLabel: string): string {
  return `${product.name}, ${product.weight}, ${priceLabel}`;
}
