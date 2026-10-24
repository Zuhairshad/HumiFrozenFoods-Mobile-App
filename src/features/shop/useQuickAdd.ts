import { useCallback } from 'react';
import { useToast } from '@/components/ui';
import { haptics } from '@/hooks/useHaptics';
import { useCartStore } from '@/store/cart';

/**
 * Cart wiring shared by tiles and rows. Subscribes to a single primitive (this product's quantity)
 * so adding one product never re-renders the rest of the list.
 */
export function useQuickAdd(productId: string) {
  const quantity = useCartStore((s) => s.lines.find((l) => l.productId === productId)?.quantity ?? 0);
  const toast = useToast();

  const add = useCallback(() => {
    useCartStore.getState().add(productId, 1);
    haptics.light();
    toast.show({ message: 'Added to cart' });
  }, [productId, toast]);

  const setQuantity = useCallback(
    (next: number) => {
      useCartStore.getState().setQty(productId, next);
    },
    [productId],
  );

  return { quantity, add, setQuantity };
}
