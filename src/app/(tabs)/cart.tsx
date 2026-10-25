import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, EmptyState, ListSection, ScreenScroll, useToast } from '@/components/ui';
import { CartRow, CheckoutBar, ExtraShelf, FreeDeliveryTrack, PromoRowInput, SummaryRows, UnavailableRows, useCartQuote } from '@/features/cart';
import { useServerConfig } from '@/store/server-config';
import { formatPrice } from '@/lib/format';
import { getBestSellers, getProduct } from '@/data';
import { useCart, type CartLineWithProduct } from '@/hooks/useCart';
import { useTabInset } from '@/hooks/useTabInset';
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
  const quote = useCartQuote();
  const { config } = useServerConfig();
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

  const onRemoveUnavailable = useCallback((id: string) => cart.remove(id), [cart]);
  const unavailableIds = useMemo(() => new Set(quote.unavailable.map((u) => u.productId)), [quote.unavailable]);
  const serverTotals = useMemo(() => new Map(quote.lines.map((l) => [l.productId, l.lineTotalPence])), [quote.lines]);
  const buyable = useMemo(() => cart.lines.filter((l) => !unavailableIds.has(l.productId)), [cart.lines, unavailableIds]);
  const minOrderPence = config.delivery.minOrderPence;
  const belowMin = minOrderPence > 0 && quote.pricing.subtotalPence < minOrderPence;
  const inCart = useMemo(() => new Set(cart.lines.map((l) => l.productId)), [cart.lines]);
  const extras = useMemo(() => getBestSellers(12).filter((p) => !inCart.has(p.id)).slice(0, 8), [inCart]);

  if (cart.lines.length === 0 && quote.unavailable.length === 0) {
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
          <FreeDeliveryTrack
            remainingPence={quote.pricing.freeDeliveryRemainingPence}
            thresholdPence={quote.freeThresholdPence}
            estimate={quote.isEstimate}
          />
        </View>

        <ListSection separatorInset={92}>
          {buyable.map((line) => (
            <CartRow
              key={line.productId}
              line={line}
              onChangeQuantity={onChangeQuantity}
              onRemove={onRemove}
              onPressProduct={openProduct}
              serverLineTotalPence={serverTotals.get(line.productId)}
            />
          ))}
        </ListSection>

        <UnavailableRows items={quote.unavailable} onRemove={onRemoveUnavailable} />

        {quote.promoEnabled ? (
          <PromoRowInput
            appliedCode={quote.appliedPromo}
            rejection={quote.promoRejection}
            checking={quote.loading}
            discountPence={quote.pricing.discountPence}
          />
        ) : null}

        <SummaryRows
          totals={quote.pricing}
          promoCode={quote.appliedPromo ?? undefined}
          estimate={quote.isEstimate}
          footer={
            quote.demo
              ? 'Demo mode: totals are estimates and no order is really placed.'
              : quote.isEstimate
                ? quote.error
                  ? "Estimate. We couldn't reach Humi's to confirm prices."
                  : 'Estimate while we confirm prices…'
                : 'Final prices are confirmed when you pay.'
          }
        />
        {quote.error && !quote.demo ? (
          <View style={styles.retry}>
            <AppText variant="footnote" color="labelSecondary" align="center">
              {quote.error.isRateLimited ? 'Too many price checks. Try again shortly.' : "Couldn't refresh prices."}
            </AppText>
            <Button title="Retry" variant="tinted" size="sm" onPress={quote.refresh} />
          </View>
        ) : null}
        {belowMin ? (
          <AppText variant="footnote" color="destructive" align="center" style={styles.min}>
            Minimum order is {formatPrice(minOrderPence / 100)}.
          </AppText>
        ) : null}

        <ExtraShelf title="Add a little extra" products={extras} onAdd={onAdd} />
      </ScreenScroll>
      <CheckoutBar
        total={quote.pricing.totalPence / 100}
        estimate={quote.isEstimate}
        disabled={quote.hasUnavailable || belowMin || buyable.length === 0}
        bottom={barBottom}
        onPress={() => router.push('/checkout')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  track: { marginHorizontal: 20, marginBottom: 20, marginTop: 8 },
  retry: { alignItems: 'center', gap: 8, marginBottom: 16 },
  min: { marginHorizontal: 20, marginBottom: 16 },
  emptyContent: { gap: 24, paddingTop: 24 },
});
