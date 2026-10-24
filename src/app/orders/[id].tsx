import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, EmptyState, FadeImage, ListRow, ListSection, Price, ScreenScroll } from '@/components/ui';
import {
  OrderTimeline,
  StatusCard,
  deriveStatus,
  formatDateTime,
  isActive,
} from '@/features/account';
import { useTheme } from '@/hooks/useTheme';
import { useOrdersStore } from '@/store/orders';

const TICK_MS = 30_000;

export default function OrderTrackScreen() {
  const router = useRouter();
  const { c, radius } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOrdersStore((s) => (id ? s.getOrder(String(id)) : undefined));
  const [now, setNow] = useState(() => Date.now());

  const status = order ? deriveStatus(order, now) : undefined;
  const live = status ? isActive(status) : false;

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, [live]);

  if (!order || !status) {
    return (
      <>
        <Stack.Screen options={{ title: 'Order' }} />
        <ScreenScroll grouped>
          <View style={styles.empty}>
            <EmptyState
              icon="shippingbox"
              title="Order not found"
              message="We couldn't find that order on this device."
              actionLabel="Find an order"
              onAction={() => router.replace('/orders/lookup')}
            />
          </View>
        </ScreenScroll>
      </>
    );
  }

  const count = order.lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <>
      <Stack.Screen options={{ title: `Order ${order.id}` }} />
      <ScreenScroll grouped>
        <View style={styles.stack}>
          <View style={styles.pad}>
            <StatusCard order={order} status={status} />
          </View>

          <View style={styles.pad}>
            <AppText variant="title2" accessibilityRole="header" style={styles.title}>
              Timeline
            </AppText>
            <OrderTimeline status={status} placedLabel={formatDateTime(order.placedAt)} />
          </View>

          <ListSection header={`Items (${count})`}>
            {order.lines.map((l, i) => (
              <View key={`${l.productId}-${i}`} style={styles.item} accessible accessibilityLabel={`${l.name}, quantity ${l.quantity}`}>
                <FadeImage
                  uri={l.image}
                  width={256}
                  contentFit="cover"
                  style={[styles.thumb, radius('sm'), { backgroundColor: c.fill }]}
                />
                <View style={styles.itemText}>
                  <AppText variant="subheadStrong" numberOfLines={2}>
                    {l.name}
                  </AppText>
                  <AppText variant="footnote" color="labelSecondary">
                    Qty {l.quantity}
                  </AppText>
                </View>
                <Price value={l.price * l.quantity} size="md" />
              </View>
            ))}
            <ListRow title="Total" trailing={<Price value={order.total} size="md" />} />
          </ListSection>

          {order.address ? (
            <ListSection header="Delivery address">
              <View style={styles.address}>
                <AppText variant="body">{order.address}</AppText>
              </View>
            </ListSection>
          ) : null}

          <ListSection>
            <ListRow
              icon="questionmark.circle"
              title="Need help? Contact Us"
              onPress={() => router.push('/contact')}
              chevron
            />
          </ListSection>
        </View>
      </ScreenScroll>
    </>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 24, paddingTop: 8 },
  pad: { paddingHorizontal: 20 },
  title: { marginBottom: 12 },
  empty: { paddingTop: 80 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 68 },
  thumb: { width: 48, height: 48 },
  itemText: { flex: 1, gap: 2 },
  address: { paddingHorizontal: 16, paddingVertical: 12 },
});
