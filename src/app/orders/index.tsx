import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { EmptyState, ListSection, RoundButton, ScreenScroll, useToast } from '@/components/ui';
import { OrderRow, deriveStatus, isActive } from '@/features/account';
import { haptics } from '@/hooks/useHaptics';
import { useCartStore } from '@/store/cart';
import { useOrdersStore } from '@/store/orders';
import type { Order } from '@/types';

export default function OrdersScreen() {
  const router = useRouter();
  const toast = useToast();
  const orders = useOrdersStore((s) => s.orders);
  const addToCart = useCartStore((s) => s.add);
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  const { active, past } = useMemo(() => {
    const a: Order[] = [];
    const p: Order[] = [];
    for (const o of orders) (isActive(deriveStatus(o, now)) ? a : p).push(o);
    return { active: a, past: p };
  }, [orders, now]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setNow(Date.now());
      setRefreshing(false);
    }, 500);
  }, []);

  const open = useCallback((o: Order) => router.push(`/orders/${o.id}` as Href), [router]);

  const reorder = useCallback(
    (o: Order) => {
      let n = 0;
      for (const l of o.lines) {
        addToCart(l.productId, l.quantity);
        n += l.quantity;
      }
      haptics.success();
      toast.show({
        message: `Added ${n} ${n === 1 ? 'item' : 'items'} to Cart`,
        actionLabel: 'View Cart',
        onAction: () => router.push('/(tabs)/cart'),
      });
    },
    [addToCart, router, toast],
  );

  const copy = useCallback(
    (o: Order) => {
      Clipboard.setStringAsync(o.id).catch(() => {});
      haptics.success();
      toast.show({ message: 'Order number copied' });
    },
    [toast],
  );

  const renderRows = (list: Order[]) =>
    list.map((o) => (
      <OrderRow key={o.id} order={o} now={now} onPress={open} onReorder={reorder} onCopy={copy} />
    ));

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Orders',
          headerLargeTitleEnabled: true,
          headerRight: () => (
            <RoundButton
              icon="magnifyingglass"
              size={32}
              material="fill"
              accessibilityLabel="Find an order"
              onPress={() => router.push('/orders/lookup' as Href)}
            />
          ),
        }}
      />
      <ScreenScroll
        grouped
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {orders.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              icon="shippingbox"
              title="No orders yet"
              message="Your orders will appear here."
              actionLabel="Start shopping"
              onAction={() => router.push('/(tabs)/shop')}
            />
          </View>
        ) : (
          <View style={styles.stack}>
            {active.length > 0 ? <ListSection header="Active">{renderRows(active)}</ListSection> : null}
            {past.length > 0 ? <ListSection header="Past">{renderRows(past)}</ListSection> : null}
          </View>
        )}
      </ScreenScroll>
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 24, paddingTop: 8 },
  empty: { paddingTop: 80 },
});
