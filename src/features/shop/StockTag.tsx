import { memo } from 'react';
import { Tag } from '@/components/ui';
import type { Product } from '@/types';

interface Props {
  product: Pick<Product, 'inStock' | 'lowStock'>;
  /** Also flag low stock (product page only). */
  showLow?: boolean;
}

/** "Out of stock" (everywhere a product can be added) or, with `showLow`, "Low stock". Null otherwise. */
export const StockTag = memo(function StockTag({ product, showLow = false }: Props) {
  if (!product.inStock) return <Tag label="Out of stock" tone="destructive" />;
  if (showLow && product.lowStock) return <Tag label="Low stock" tone="accent" />;
  return null;
});
