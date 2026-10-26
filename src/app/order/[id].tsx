import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, FadeImage, fireHaptic, ListSection, PressableScale, ScreenScroll } from '@/components/ui';
import { patchFromApi } from '@/features/account/order-mapping';
import { syncOrder } from '@/features/account/order-sync';
import { ConfirmationCheck } from '@/features/checkout';
import { pollOrderPayment } from '@/features/checkout/order-polling';
import { useTheme } from '@/hooks/useTheme';
import { getHttpClient, isDemoMode } from '@/lib/api/http';
import { fetchOrder } from '@/lib/api/orders-client';
import { formatPrice } from '@/lib/format';
import { useOrdersStore } from '@/store/orders';

type Phase = 'polling' | 'delayed';

export default function OrderConfirmationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const order = useOrdersStore((s) => (id ? s.getOrder(String(id)) : undefined));
  const patchOrder = useOrdersStore((s) => s.patchOrder);
  const token = useOrdersStore((s) => s.getToken(order?.remoteId));
  const [phase, setPhase] = useState<Phase>('polling');
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const orderId = order?.id;
  const remoteId = order?.remoteId;
  const live = !isDemoMode && !!orderId && !!remoteId && !!token && order?.paymentStatus !== 'demo';
  const paymentStatus = order?.paymentStatus;

  // Poll GET /v1/orders/:id (3 s x 10) with the guest token. The server, via the Stripe webhook, is the
  // only thing that can say "paid"; PaymentSheet success alone never does.
  const runPoll = useCallback(() => {
    if (!live || !orderId || !remoteId || !token) return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    void pollOrderPayment({
      signal: ctl.signal,
      fetchOrder: (signal) => fetchOrder(getHttpClient(), remoteId, token, signal),
      onUpdate: (remote) => {
        setOffline(false);
        const local = useOrdersStore.getState().getOrder(orderId);
        if (local) patchOrder(orderId, patchFromApi(remote, local));
      },
      onError: () => setOffline(true),
    }).then((outcome) => {
      if (outcome.kind === 'cancelled') return;
      // R11: an unauthorized poll also needs the Refresh button, not an endless "confirming".
      setPhase(outcome.kind === 'timeout' || outcome.kind === 'unauthorized' ? 'delayed' : 'polling');
    });
  }, [live, orderId, remoteId, token, patchOrder]);

  useEffect(() => {
    if (live && paymentStatus === 'pending') runPoll();
    return () => abortRef.current?.abort();
    // Only (re)start when the order identity changes, not on every status patch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, live]);

  const manualRefresh = useCallback(async () => {
    if (!orderId) return;
    setRefreshing(true);
    const res = await syncOrder(orderId);
    setOffline(res.kind === 'offline');
    setRefreshing(false);
  }, [orderId]);

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
  const refunded = order.paymentStatus === 'refunded';
  const pending = order.paymentStatus === 'pending';
  const subtitle = failed
    ? `We couldn't confirm payment for order ${order.id}. If you were charged, contact us with this number.`
    : refunded
      ? `Order ${order.id} was refunded.`
      : pending
        ? `Payment received — confirming… Order ${order.id} will be confirmed as soon as the bank responds.`
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
            {demo ? 'Demo mode: no receipt is sent.' : order.paymentStatus === 'paid' ? `A receipt will be emailed to ${order.contact.email}.` : `We'll email a receipt to ${order.contact.email} once payment is confirmed.`}
          </AppText>
        ) : null}
        {offline ? (
          <AppText variant="footnote" color="labelTertiary" align="center" style={styles.note}>
            You&apos;re offline. Showing the saved copy of your order.
          </AppText>
        ) : null}
        {pending && phase === 'delayed' ? (
          <View style={styles.actions}>
            <Button title="Refresh status" variant="tinted" size="lg" fullWidth loading={refreshing} onPress={() => void manualRefresh()} />
          </View>
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
