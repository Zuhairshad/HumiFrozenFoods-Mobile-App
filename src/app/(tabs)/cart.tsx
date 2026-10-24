import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ListSection, ScreenScroll, useToast } from '@/components/ui';
import { CartRow, CheckoutBar, ExtraShelf, FreeDeliveryTrack, PromoRowInput, SummaryRows } from '@/features/cart';
import { getBestSellers, getProduct } from '@/data';
import { useCart, type CartLineWithProduct } from '@/hooks/useCart';
import { useTabInset } from '@/hooks/useTabInset';
import { PROMO_CODE } from '@/lib/pricing';
import { useOrdersStore } from '@/store/orders';
import type { Product } from '@/types';

const BAR_HEIGHT = 54;

/** Unique products from past orders, most recent first. */
function useBuyAgain(limit: number): Product[] {
  const orders = useOrdersStore((s) => s.orders);
  return useMemo(() => {
    const seen = new Set<string>();
    const out: Product[] = [];
    for (const o of orders) {
      for (const l of o.lines) {
        if (seen.has(l.productId)) continue;
        seen.add(l.productId);
        const p = getProduct(l.productId);
        if (p) out.push(p);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }, [orders, limit]);
}

export default function CartScreen() {
  const cart = useCart();
  const toast = useToast();
  const tabInset = useTabInset();
  const buyAgain = useBuyAgain(8);
  const barBottom = tabInset - 8;

  const onRemove = useCallback(
    (line: CartLineWithProduct) => {
      cart.remove(line.productId);
      toast.show({
        message: 'Removed',
        actionLabel: 'Undo',
        duration: 4000,
        bottomOffset: barBottom + BAR_HEIGHT + 12,
        onAction: () => cart.add(line.productId, line.quantity),
      });
    },
    [cart, toast, barBottom],
  );

  const onChangeQuantity = useCallback((id: string, qty: number) => cart.setQty(id, qty), [cart]);
  const onAdd = useCallback((id: string) => cart.add(id), [cart]);
  const openProduct = useCallback(
    (id: string) => router.push({ pathname: '/product/[id]', params: { id } }),
    [],
  );

  const inCart = useMemo(() => new Set(cart.lines.map((l) => l.productId)), [cart.lines]);
  const extras = useMemo(() => getBestSellers(12).filter((p) => !inCart.has(p.id)).slice(0, 8), [inCart]);

  if (cart.lines.length === 0) {
    const suggestions = buyAgain.length > 0 ? buyAgain : extras;
    return (
      <ScreenScroll grouped tabInset contentContainerStyle={styles.emptyContent}>
        <EmptyState
          icon="bag"
          title="Your cart is empty"
          message="Add something delicious."
          actionLabel="Browse the Freezer"
          onAction={() => router.push('/shop')}
        />
        <ExtraShelf title={buyAgain.length > 0 ? 'Buy Again' : 'Best Sellers'} products={suggestions} onAdd={onAdd} />
      </ScreenScroll>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenScroll
        grouped
        tabInset
        contentContainerStyle={{ paddingTop: 8, paddingBottom: tabInset + BAR_HEIGHT + 8 }}
      >
        <View style={styles.track}>
          <FreeDeliveryTrack remaining={cart.freeDeliveryRemaining} />
        </View>

        <ListSection separatorInset={92}>
          {cart.lines.map((line) => (
            <CartRow
              key={line.productId}
              line={line}
              onChangeQuantity={onChangeQuantity}
              onRemove={onRemove}
              onPressProduct={openProduct}
            />
          ))}
        </ListSection>

        <PromoRowInput />

        <SummaryRows
          totals={cart}
          promoCode={cart.promoApplied ? PROMO_CODE : undefined}
          footer="Final prices are confirmed when you pay."
        />

        <ExtraShelf title="Add a little extra" products={extras} onAdd={onAdd} />
      </ScreenScroll>
      <CheckoutBar total={cart.total} bottom={barBottom} onPress={() => router.push('/checkout')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  track: { marginHorizontal: 20, marginBottom: 20, marginTop: 8 },
  emptyContent: { gap: 24, paddingTop: 24 },
});
