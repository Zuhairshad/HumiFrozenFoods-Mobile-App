import { useMemo } from 'react';
import { getProduct } from '@/data';
import { computeTotals } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';
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

  const lines = useMemo<CartLineWithProduct[]>(() => {
    const out: CartLineWithProduct[] = [];
    for (const l of rawLines) {
      const product = getProduct(l.productId);
      if (product) out.push({ ...l, product });
    }
    return out;
  }, [rawLines]);

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
