import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { AppText, Button, PressableScale, QuantityStepper } from '@/components/ui';
import { haptics, useCart } from '@/hooks';
import { formatPrice } from '@/lib/format';
import { colors, radii, shadows, spacing, gutter } from '@/theme';
import type { Product } from '@/types';

export const BAR_HEIGHT = 92;
const MAX_QTY = 20;

export function AddToCartBar({ product }: { product: Product }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { quantityOf, add, setQty } = useCart();
  const inCart = quantityOf(product.id);
  const [qty, setLocalQty] = useState(inCart || 1);
  const [added, setAdded] = useState(false);
  const [toast, setToast] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const onPress = () => {
    if (inCart > 0) setQty(product.id, qty);
    else add(product.id, qty);
    haptics.success();
    setAdded(true);
    setToast(true);
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(() => setAdded(false), 1600), setTimeout(() => setToast(false), 3200)];
  };

  const total = formatPrice(product.price * qty);
  const title = added ? 'Added' : inCart > 0 ? `Update cart · ${total}` : `Add to cart · ${total}`;
  const bottomPad = Math.max(insets.bottom, spacing.md);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {toast ? (
        <Animated.View
          entering={FadeInDown.springify().damping(16)}
          exiting={FadeOutDown.duration(200)}
          style={[styles.toast, { bottom: BAR_HEIGHT + bottomPad }]}
        >
          <Ionicons name="checkmark-circle" size={20} color={colors.gold} />
          <AppText variant="label" color="white" style={styles.toastText}>
            Added to cart
          </AppText>
          <PressableScale
            onPress={() => {
              setToast(false);
              router.push('/cart');
            }}
            accessibilityLabel="View cart"
          >
            <AppText variant="label" color="gold">
              View cart
            </AppText>
          </PressableScale>
        </Animated.View>
      ) : null}
      <View style={[styles.bar, { paddingBottom: bottomPad }]}>
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassLight }]} />
        ) : (
          <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
        )}
        <View style={styles.row}>
          <QuantityStepper value={qty} onChange={setLocalQty} min={1} max={MAX_QTY} />
          <View style={styles.cta}>
            <Button
              title={title}
              variant={added ? 'primary' : 'gold'}
              icon={added ? 'checkmark' : undefined}
              onPress={onPress}
              fullWidth
              size="lg"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    paddingTop: spacing.md,
    paddingHorizontal: gutter,
    overflow: 'hidden',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cta: { flex: 1 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.tealInk,
    ...shadows.lg,
  },
  toastText: { marginRight: spacing.sm },
});
