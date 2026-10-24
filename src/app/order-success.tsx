import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, EmptyState, FadeImage, Reveal, Surface } from '@/components/ui';
import { ConfettiBurst, SummaryRows } from '@/features/cart';
import { haptics } from '@/hooks/useHaptics';
import { formatPrice } from '@/lib/format';
import { useOrdersStore } from '@/store/orders';
import { colors, gradients, gutter, radii, shadows, spacing } from '@/theme';

export default function OrderSuccessScreen() {
  const insets = useSafeAreaInsets();
  const { id, slot } = useLocalSearchParams<{ id?: string; slot?: string }>();
  const order = useOrdersStore((s) => (id ? s.orders.find((o) => o.id.toUpperCase() === id.toUpperCase()) : undefined));

  const circle = useSharedValue(0);
  const check = useSharedValue(0);
  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: circle.value }] }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: check.value }] }));

  useEffect(() => {
    if (!order) return;
    circle.set(withSpring(1, { damping: 12, stiffness: 140 }));
    check.set(withDelay(250, withSpring(1, { damping: 8, stiffness: 180 })));
    const t = setTimeout(() => haptics.success(), 250);
    return () => clearTimeout(t);
  }, [order, circle, check]);

  if (!order) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <EmptyState
          icon="receipt-outline"
          title="We couldn't find that order"
          message="It may have been placed on another device. Check your orders or keep browsing."
          actionLabel="Continue shopping"
          onAction={() => router.replace('/(tabs)/shop')}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.huge, paddingBottom: insets.bottom + spacing.xxxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <ConfettiBurst />
          <Animated.View style={[styles.circle, circleStyle]}>
            <LinearGradient colors={gradients.tealCard} style={StyleSheet.absoluteFill} />
            <Animated.View style={[styles.goldCheck, checkStyle]}>
              <Ionicons name="checkmark" size={44} color={colors.tealInk} />
            </Animated.View>
          </Animated.View>
        </View>

        <Reveal delay={400}>
          <AppText variant="h1" align="center">
            Order confirmed!
          </AppText>
          <AppText variant="body" color="muted" align="center" style={styles.sub}>
            Thank you. We&apos;re getting your order ready.
          </AppText>
        </Reveal>

        <Reveal delay={500}>
          <Surface tone="teal" radius="lg" padded={spacing.xl}>
            <View style={styles.meta}>
              <View>
                <AppText variant="overline" color="goldSoft">
                  Order number
                </AppText>
                <AppText variant="h3" color="white">
                  {order.id}
                </AppText>
              </View>
              <View style={styles.metaRight}>
                <AppText variant="overline" color="goldSoft">
                  Estimated arrival
                </AppText>
                <AppText variant="bodyStrong" color="white" align="right">
                  {slot ?? 'Within 1–2 days'}
                </AppText>
              </View>
            </View>
          </Surface>
        </Reveal>

        <Reveal delay={600}>
          <Surface radius="lg" padded={spacing.xl}>
            <AppText variant="h3" style={styles.cardTitle}>
              Your items
            </AppText>
            {order.lines.map((l) => (
              <View key={l.productId} style={styles.line}>
                <FadeImage uri={l.image} style={styles.thumb} />
                <AppText variant="body" numberOfLines={2} style={styles.lineName}>
                  {l.quantity} × {l.name}
                </AppText>
                <AppText variant="bodyStrong">{formatPrice(l.price * l.quantity)}</AppText>
              </View>
            ))}
            <View style={styles.sumGap}>
              <SummaryRows
                subtotal={order.subtotal}
                delivery={order.delivery}
                discount={order.discount}
                total={order.total}
              />
            </View>
            <View style={styles.address}>
              <Ionicons name="location-outline" size={18} color={colors.teal} />
              <AppText variant="caption" color="inkSoft" style={styles.lineName}>
                {order.address}
              </AppText>
            </View>
          </Surface>
        </Reveal>

        <Reveal delay={700} style={styles.actions}>
          <Button title="Track order" variant="gold" size="lg" fullWidth icon="navigate" onPress={() => router.push('/track')} />
          <Button
            title="Continue shopping"
            variant="outline"
            fullWidth
            onPress={() => router.replace('/(tabs)/shop')}
          />
        </Reveal>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: gutter, gap: spacing.xl },
  hero: { height: 140, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: 112,
    height: 112,
    borderRadius: radii.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  goldCheck: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sub: { marginTop: spacing.xs },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  metaRight: { flex: 1, alignItems: 'flex-end' },
  cardTitle: { marginBottom: spacing.lg },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  thumb: { width: 44, height: 44, borderRadius: radii.sm },
  lineName: { flex: 1 },
  sumGap: { marginTop: spacing.sm },
  address: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  actions: { gap: spacing.md },
});
