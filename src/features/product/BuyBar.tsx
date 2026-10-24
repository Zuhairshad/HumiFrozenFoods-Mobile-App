import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Button, GlassSurface, QuantityStepper } from '@/components/ui';
import { haptics, useCart } from '@/hooks';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/types';
import { useAddedToast } from './AddedToast';

export const BUY_BAR_HEIGHT = 76;
const MAX_QTY = 20;
const BOUNCY = { damping: 14, stiffness: 210, mass: 0.9 } as const;

/** Glass buy bar: quantity stepper + capsule button showing the live total. */
export function BuyBar({ product }: { product: Product }) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { add } = useCart();
  const notifyAdded = useAddedToast();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pop = useSharedValue(1);
  const stacked = fontScale >= 1.35;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const onAdd = () => {
    add(product.id, qty);
    haptics.light();
    notifyAdded();
    setAdded(true);
    setQty(1);
    if (!reduceMotion) pop.set(withSequence(withSpring(1.04, BOUNCY), withSpring(1, BOUNCY)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1400);
  };

  const total = formatPrice(product.price * qty);

  return (
    <View style={styles.root} pointerEvents="box-none">
      <GlassSurface tone="adaptive" style={styles.glass}>
        <View
          style={[
            styles.row,
            stacked ? styles.rowStacked : null,
            { paddingBottom: 12 + insets.bottom, minHeight: BUY_BAR_HEIGHT + insets.bottom },
          ]}
        >
          <QuantityStepper value={qty} onChange={setQty} min={1} max={MAX_QTY} size="regular" />
          <Animated.View style={[styles.cta, popStyle]}>
            <Button
              title={added ? 'Added' : `Add to Cart · ${total}`}
              icon={added ? 'checkmark.circle.fill' : undefined}
              size="lg"
              fullWidth
              onPress={onAdd}
            />
          </Animated.View>
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  glass: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  cta: { flex: 1 },
});
