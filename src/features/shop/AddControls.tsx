import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { AppText, Icon, PressableScale, QuantityStepper } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import type { Product } from '@/types';
import { useQuickAdd } from './useQuickAdd';

const FADE_IN = FadeIn.duration(150);
const FADE_OUT = FadeOut.duration(100);

interface AddControlProps {
  product: Product;
}

/** Trailing "Add" capsule for rows; morphs into a compact quantity stepper after adding. */
export const AddPill = memo(function AddPill({ product }: AddControlProps) {
  const { c } = useTheme();
  const { quantity, add, setQuantity } = useQuickAdd(product.id);

  return (
    <View style={styles.pillSlot}>
      {quantity === 0 ? (
        <Animated.View key="add" entering={FADE_IN} exiting={FADE_OUT}>
          <PressableScale
            onPress={add}
            scaleTo={0.94}
            accessibilityLabel={`Add ${product.name} to cart`}
            style={[styles.pill, { backgroundColor: c.tintSoft }]}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <AppText variant="subheadStrong" color="tint" maxScale={1.3}>
              Add
            </AppText>
          </PressableScale>
        </Animated.View>
      ) : (
        <Animated.View key="stepper" entering={FADE_IN} exiting={FADE_OUT}>
          <QuantityStepper value={quantity} onChange={setQuantity} min={0} size="compact" />
        </Animated.View>
      )}
    </View>
  );
});

/** Overlay for tile photos: round plus button, becomes a stepper once the product is in the cart. */
export const TilePlus = memo(function TilePlus({ product }: AddControlProps) {
  const { c, isDark } = useTheme();
  const { quantity, add, setQuantity } = useQuickAdd(product.id);
  // Solid translucent fill: no live blur inside list items (design 7.5 rule 4).
  const plate = isDark ? 'rgba(20,31,31,0.82)' : 'rgba(255,255,255,0.86)';

  return (
    <View style={styles.plusSlot} pointerEvents="box-none">
      {quantity === 0 ? (
        <Animated.View key="plus" entering={FADE_IN} exiting={FADE_OUT}>
          <PressableScale
            onPress={add}
            scaleTo={0.9}
            haptic="none"
            accessibilityLabel={`Add ${product.name} to cart`}
            style={[styles.plus, { backgroundColor: plate }]}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon name="plus" size={16} color={c.tint} weight="semibold" />
          </PressableScale>
        </Animated.View>
      ) : (
        <Animated.View key="stepper" entering={FADE_IN} exiting={FADE_OUT} style={[styles.plate, { backgroundColor: plate }]}>
          <QuantityStepper value={quantity} onChange={setQuantity} min={0} size="compact" />
        </Animated.View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  pillSlot: { minWidth: 96, alignItems: 'flex-end', justifyContent: 'center' },
  pill: {
    height: 36,
    minWidth: 64,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  plusSlot: { position: 'absolute', right: 8, bottom: 8, alignItems: 'flex-end' },
  plus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: { borderRadius: 999, borderCurve: 'continuous' },
});
