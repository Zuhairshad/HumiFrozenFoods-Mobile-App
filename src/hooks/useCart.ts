import { useMemo } from 'react';
import { computeTotals } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
import { useProducts } from './useProducts';
import type { CartLine, Product } from '@/types';

export type CartLineWithProduct = CartLine & { product: Product };

export function useCart() {
  const rawLines = useCartStore((s) => s.lines);
  const promoApplied = useCartStore((s) => s.promoApplied);
  const add = useCartStore((s) => s.add);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const applyPromo = useCartStore((s) => s.applyPromo);
  const removePromo = useCartStore((s) => s.removePromo);

  const products = useProducts();

  // Lines are derived from the live catalogue snapshot, so a price or stock change shows up at once.
  // Lines whose product vanished (unpublished) are dropped from `lines` and reported in `unavailableLineIds`
  // (the persisted cart is left alone: the product may reappear, e.g. after a failed refresh).
  const { lines, unavailableLineIds } = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const out: CartLineWithProduct[] = [];
    const missing: string[] = [];
    for (const l of rawLines) {
      const product = byId.get(l.productId);
      if (product) out.push({ ...l, product });
      else missing.push(l.productId);
    }
    return { lines: out, unavailableLineIds: missing };
  }, [rawLines, products]);

  /** Lines whose product exists but is currently out of stock. */
  const outOfStockLineIds = useMemo(
    () => lines.filter((l) => !l.product.inStock).map((l) => l.productId),
    [lines],
  );

  /** Integer pence subtotal of the lines still available (display/estimate only; the server prices orders). */
  const subtotalPence = useMemo(
    () => lines.reduce((sum, l) => sum + l.product.pricePence * l.quantity, 0),
    [lines],
  );

  const count = useMemo(() => lines.reduce((n, l) => n + l.quantity, 0), [lines]);

  const totals = useMemo(
    () => computeTotals(lines.map((l) => ({ price: l.product.price, quantity: l.quantity })), { promoApplied }),
    [lines, promoApplied],
  );

  const quantityOf = useMemo(() => {
    const map = new Map(rawLines.map((l) => [l.productId, l.quantity]));
    return (productId: string) => map.get(productId) ?? 0;
  }, [rawLines]);

  return {
    lines,
    unavailableLineIds,
    outOfStockLineIds,
    subtotalPence,
    count,
    ...totals,
    promoApplied,
    add,
    setQty,
    remove,
    clear,
    applyPromo,
    removePromo,
    quantityOf,
  };
}
