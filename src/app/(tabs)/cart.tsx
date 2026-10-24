import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { AppText, Button, EmptyState, Reveal, Screen, ScreenHeader, SectionHeader, Surface } from '@/components/ui';
import { CartLineCard, FreeDeliveryBar, PromoField, SuggestedRow, SummaryRows } from '@/features/cart';
import { useCart } from '@/hooks/useCart';
import { formatPrice } from '@/lib/format';
import { colors, gutter, spacing, TAB_BAR_CLEARANCE } from '@/theme';

// Sits just above the floating tab bar.
const STICKY_BOTTOM = TAB_BAR_CLEARANCE - 28;
const STICKY_HEIGHT = 88;

export default function CartScreen() {
  const cart = useCart();
  const empty = cart.lines.length === 0;

  if (empty) {
    return (
      <Screen tabs contentContainerStyle={styles.emptyContent}>
        <ScreenHeader title="Your Cart" subtitle="Nothing here yet" />
        <Reveal>
          <EmptyState
            icon="basket-outline"
            title="Your cart is empty"
            message="Fill it with crispy samosas, kebabs and spring rolls, ready in minutes."
            actionLabel="Start shopping"
            onAction={() => router.push('/(tabs)/shop')}
          />
        </Reveal>
        <SectionHeader overline="Popular" title="Customer favourites" />
        <SuggestedRow onAdd={(id) => cart.add(id)} />
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <Screen tabs contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + STICKY_HEIGHT }}>
        <ScreenHeader title="Your Cart" subtitle={`${cart.count} ${cart.count === 1 ? 'item' : 'items'}`} />
        <View style={styles.body}>
          <Reveal>
            <FreeDeliveryBar subtotal={cart.subtotal} remaining={cart.freeDeliveryRemaining} />
          </Reveal>
          <Animated.View layout={LinearTransition.springify().damping(20)} style={styles.lines}>
            {cart.lines.map((line, i) => (
              <CartLineCard
                key={line.productId}
                line={line}
                index={i}
                onQuantity={cart.setQty}
                onRemove={cart.remove}
              />
            ))}
          </Animated.View>
          <Reveal delay={150}>
            <PromoField applied={cart.promoApplied} onApply={cart.applyPromo} onRemove={cart.removePromo} />
          </Reveal>
          <Reveal delay={220}>
            <Surface radius="lg" padded={spacing.xl}>
              <AppText variant="h3" style={styles.summaryTitle}>
                Order summary
              </AppText>
              <SummaryRows
                subtotal={cart.subtotal}
                delivery={cart.delivery}
                discount={cart.discount}
                total={cart.total}
              />
            </Surface>
          </Reveal>
        </View>
        <View style={styles.suggestedHeader}>
          <SectionHeader overline="Add a little extra" title="You might also like" />
        </View>
        <SuggestedRow onAdd={(id) => cart.add(id)} />
      </Screen>

      <View style={styles.sticky} pointerEvents="box-none">
        <View style={styles.stickyInner}>
          {Platform.OS !== 'android' ? <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} /> : null}
          <Button
            title={`Checkout · ${formatPrice(cart.total)}`}
            variant="gold"
            size="lg"
            fullWidth
            iconRight="arrow-forward"
            onPress={() => router.push('/checkout')}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  emptyContent: { gap: spacing.lg },
  body: { paddingHorizontal: gutter, gap: spacing.lg, paddingTop: spacing.sm, marginBottom: spacing.lg },
  lines: { gap: spacing.md },
  summaryTitle: { marginBottom: spacing.lg },
  suggestedHeader: { paddingHorizontal: gutter },
  sticky: { position: 'absolute', left: 0, right: 0, bottom: STICKY_BOTTOM, paddingHorizontal: gutter },
  stickyInner: {
    borderRadius: 40,
    overflow: 'hidden',
    padding: spacing.sm,
    backgroundColor: 'rgba(250,247,241,0.6)',
  },
});
