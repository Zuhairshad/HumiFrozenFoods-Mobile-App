import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppText, PressableScale } from '@/components/ui';
import { useCart } from '@/hooks/useCart';
import { formatPrice } from '@/lib/format';
import { colors, gutter, radii, shadows, spacing, TAB_BAR_CLEARANCE } from '@/theme';
import { Glass } from './Glass';

export const CART_PEEK_HEIGHT = 60;
// Sits just above the floating tab bar.
const BOTTOM = TAB_BAR_CLEARANCE - 14;

export function CartPeekBar() {
  const { count, subtotal } = useCart();
  const show = useSharedValue(count > 0 ? 1 : 0);

  useEffect(() => {
    show.value = withSpring(count > 0 ? 1 : 0, { damping: 15, stiffness: 180, mass: 0.8 });
  }, [count, show]);

  const animated = useAnimatedStyle(() => ({
    opacity: show.value,
    transform: [{ translateY: (1 - show.value) * 90 }, { scale: 0.94 + show.value * 0.06 }],
  }));

  return (
    <Animated.View style={[styles.wrap, animated]} pointerEvents={count > 0 ? 'box-none' : 'none'}>
      <PressableScale
        haptic
        scaleTo={0.97}
        onPress={() => router.push('/cart')}
        accessibilityLabel={`View cart, ${count} items, ${formatPrice(subtotal)}`}
        style={shadows.lg}
      >
        <Glass dark intensity={60} style={styles.bar}>
          <View style={styles.iconDisc}>
            <Ionicons name="bag-handle" size={18} color={colors.tealInk} />
          </View>
          <AppText variant="label" color="white" style={styles.text} numberOfLines={1}>
            View cart · {count} {count === 1 ? 'item' : 'items'} · {formatPrice(subtotal)}
          </AppText>
          <Ionicons name="arrow-forward" size={18} color={colors.gold} />
        </Glass>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: gutter, right: gutter, bottom: BOTTOM },
  bar: {
    height: CART_PEEK_HEIGHT,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    paddingRight: spacing.xl,
    gap: spacing.md,
  },
  iconDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 14 },
});
