import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { AppText, FadeImage, PressableScale, QuantityStepper } from '@/components/ui';
import type { CartLineWithProduct } from '@/hooks/useCart';
import { haptics } from '@/hooks/useHaptics';
import { formatPrice } from '@/lib/format';
import { colors, radii, shadows, spacing } from '@/theme';

interface Props {
  line: CartLineWithProduct;
  index: number;
  onQuantity: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}

export function CartLineCard({ line, index, onQuantity, onRemove }: Props) {
  const { product, quantity } = line;
  const ref = useRef<SwipeableMethods>(null);

  const remove = () => {
    haptics.medium();
    onRemove(product.id);
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 6) * 60).springify().damping(18)}
      exiting={FadeOut.duration(200)}
      layout={LinearTransition.springify().damping(20)}
    >
      <ReanimatedSwipeable
        ref={ref}
        friction={2}
        rightThreshold={56}
        overshootRight={false}
        onSwipeableOpen={remove}
        renderRightActions={() => (
          <View style={styles.action}>
            <Ionicons name="trash-outline" size={22} color={colors.white} />
            <AppText variant="label" color="white">
              Remove
            </AppText>
          </View>
        )}
      >
        <View style={styles.card}>
          <PressableScale onPress={() => router.push(`/product/${product.id}`)} scaleTo={0.97}>
            <FadeImage uri={product.image} style={styles.image} />
          </PressableScale>
          <View style={styles.body}>
            <AppText variant="title" numberOfLines={2}>
              {product.name}
            </AppText>
            <AppText variant="caption" color="muted" numberOfLines={1}>
              {product.weight}
            </AppText>
            <View style={styles.bottom}>
              <QuantityStepper
                size="sm"
                value={quantity}
                min={0}
                onChange={(n) => (n <= 0 ? remove() : onQuantity(product.id, n))}
              />
              <AppText variant="price" color="teal">
                {formatPrice(product.price * quantity)}
              </AppText>
            </View>
          </View>
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    ...shadows.sm,
  },
  image: { width: 88, height: 88, borderRadius: radii.md },
  body: { flex: 1, justifyContent: 'space-between', gap: spacing.xs },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  action: {
    width: 96,
    marginLeft: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
