import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, FadeImage, fireHaptic, ListSection, PressableScale, ScreenScroll } from '@/components/ui';
import { ConfirmationCheck } from '@/features/checkout';
import { useTheme } from '@/hooks/useTheme';
import { isGatewayError } from '@/lib/api/errors';
import { isDemoMode } from '@/lib/api/http';
import { fetchOrder } from '@/lib/api/orders-client';
import type { OrderDto } from '@/lib/api/types';
import { formatPrice } from '@/lib/format';
import { useOrdersStore, type StoredOrder } from '@/store/orders';
import type { OrderStatus } from '@/types';

const POLL_MS = 3000;
const MAX_POLLS = 10;

const penceToPounds = (p: number) => Math.round(p) / 100;

function toLocalStatus(s: OrderDto['status'], fallback: OrderStatus): OrderStatus {
  switch (s) {
    case 'pending_payment':
    case 'placed':
      return 'placed';
    case 'preparing':
    case 'out-for-delivery':
    case 'delivered':
      return s;
    default:
      return fallback;
  }
}

/** Merge the server's view (source of truth) over the locally stored order. */
function mergeRemote(local: StoredOrder, r: OrderDto): Partial<StoredOrder> {
  return {
    status: toLocalStatus(r.status, local.status),
    paymentStatus: r.paymentStatus,
    subtotal: penceToPounds(r.pricing.subtotalPence),
    delivery: penceToPounds(r.pricing.deliveryPence),
    discount: penceToPounds(r.pricing.discountPence),
    total: penceToPounds(r.pricing.totalPence),
    contact: r.contact,
  };
}

export default function OrderConfirmationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const order = useOrdersStore((s) => (id ? s.orders.find((o) => o.id.toUpperCase() === id.toUpperCase()) : undefined));
  const patchOrder = useOrdersStore((s) => s.patchOrder);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const orderId = order?.id;
  const remoteId = order?.remoteId;
  const token = order?.guestToken;
  const pending = order?.paymentStatus === 'pending';

  // Fetch with the guest token; keep polling while the webhook has not yet marked it paid.
  useEffect(() => {
    if (isDemoMode || !orderId || !remoteId || !token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    const tick = async () => {
      try {
        const remote = await fetchOrder(remoteId, token);
        if (cancelled || !remote) return;
        const local = useOrdersStore.getState().getOrder(orderId);
        if (local) patchOrder(orderId, mergeRemote(local, remote));
        setRefreshError(null);
        if (remote.paymentStatus !== 'pending') return;
      } catch (e) {
        if (cancelled) return;
        setRefreshError(isGatewayError(e) && e.kind === 'network' ? "You're offline. Showing the saved copy of your order." : null);
      }
      polls += 1;
      if (polls < MAX_POLLS) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, remoteId, token, patchOrder]);

  const onDone = useCallback(() => router.replace('/'), []);
  const onStart = useCallback(() => fireHaptic('success'), []);
  const itemCount = useMemo(() => order?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0, [order]);

  const header = (
    <Stack.Screen
      options={{
        title: '',
        headerBackVisible: false,
        gestureEnabled: false,
        headerTransparent: true,
        headerRight: () => (
          <PressableScale onPress={onDone} scaleTo={1} pressedOpacity={0.6} accessibilityLabel="Done" style={styles.done}>
            <AppText variant="headline" color="tint">
              Done
            </AppText>
          </PressableScale>
        ),
      }}
    />
  );

  if (!order) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        {header}
        <EmptyState
          icon="shippingbox"
          title="Order not found"
          message="We couldn't find that order on this device."
          actionLabel="Continue shopping"
          onAction={onDone}
        />
      </View>
    );
  }

  const first = order.contact?.name.trim().split(/\s+/)[0];
  const failed = order.paymentStatus === 'failed';
  const demo = order.paymentStatus === 'demo';
  const subtitle = failed
    ? `We couldn't confirm payment for order ${order.id}.`
    : pending
      ? `Order ${order.id} is placed. Confirming your payment…`
      : demo
        ? `Demo order ${order.id}. No payment was taken.`
        : `Order ${order.id} is confirmed`;

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {header}
      <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 }}>
        <View style={styles.hero}>
          <ConfirmationCheck size={96} onStart={onStart} />
          <AppText variant="brandDisplay" align="center" accessibilityRole="header" style={styles.title}>
            {first ? `Thank you, ${first}` : 'Thank you'}
          </AppText>
          <AppText variant="body" color="labelSecondary" align="center" accessibilityLiveRegion="polite">
            {subtitle}
          </AppText>
        </View>

        <ListSection>
          <View style={styles.cardRow}>
            {order.slot ? (
              <AppText variant="headline">Arriving {order.slot.label}</AppText>
            ) : (
              <AppText variant="headline">Delivery details saved</AppText>
            )}
            <AppText variant="callout" color="labelSecondary">
              {order.address}
            </AppText>
          </View>
          <View style={styles.itemsRow}>
            <View style={styles.thumbs}>
              {order.lines.slice(0, 3).map((l, i) => (
                <View key={l.productId} style={[styles.thumbRing, { backgroundColor: c.cell, marginLeft: i === 0 ? 0 : -14 }]}>
                  <FadeImage uri={l.image} width={256} style={styles.thumb} recyclingKey={l.productId} />
                </View>
              ))}
            </View>
            <AppText variant="callout" color="labelSecondary" style={styles.grow}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </AppText>
            <AppText variant="headline">{formatPrice(order.total)}</AppText>
          </View>
        </ListSection>

        {order.contact?.email ? (
          <AppText variant="footnote" color="labelSecondary" align="center" style={styles.note}>
            {demo ? 'Demo mode: no receipt is sent.' : `A receipt was sent to ${order.contact.email}.`}
          </AppText>
        ) : null}
        {refreshError ? (
          <AppText variant="footnote" color="labelTertiary" align="center" style={styles.note}>
            {refreshError}
          </AppText>
        ) : null}

        <View style={styles.actions}>
          <Button
            title="Track Order"
            size="lg"
            fullWidth
            onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
          />
          <Button title="Continue Shopping" variant="plain" size="lg" fullWidth onPress={onDone} />
        </View>
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  done: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  hero: { alignItems: 'center', gap: 12, paddingHorizontal: 32, marginBottom: 32, paddingTop: 16 },
  title: { marginTop: 16 },
  cardRow: { gap: 4, paddingHorizontal: 16, paddingVertical: 14 },
  itemsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 },
  thumbs: { flexDirection: 'row' },
  thumbRing: { padding: 2, borderRadius: 14, borderCurve: 'continuous' },
  thumb: { width: 36, height: 36, borderRadius: 12, borderCurve: 'continuous' },
  grow: { flex: 1 },
  note: { marginHorizontal: 32, marginBottom: 16 },
  actions: { marginHorizontal: 20, gap: 8, marginTop: 8 },
});
