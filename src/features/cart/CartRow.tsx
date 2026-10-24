import { memo, useCallback, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { SharedValue } from 'react-native-reanimated';
import { AppText, fireHaptic, FadeImage, Icon, PressableScale, QuantityStepper } from '@/components/ui';
import { useA11yLayout, margin } from '@/theme';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import type { CartLineWithProduct } from '@/hooks/useCart';

export const REMOVE_ACTION_WIDTH = 88;

export interface CartRowProps {
  line: CartLineWithProduct;
  onChangeQuantity: (productId: string, quantity: number) => void;
  /** Called when the user removes the line (swipe, accessibility action). Parent shows the undo toast. */
  onRemove: (line: CartLineWithProduct) => void;
  onPressProduct?: (productId: string) => void;
}

interface RemovePanelProps {
  translation: SharedValue<number>;
  armedAt: number;
  onArm: (armed: boolean) => void;
  onPress: () => void;
}

function RemovePanel({ translation, armedAt, onArm, onPress }: RemovePanelProps) {
  const { c } = useTheme();
  // Row slides left, so translation is negative. Past `armedAt` a release commits the delete.
  useAnimatedReaction(
    () => translation.get() < -armedAt,
    (armed, prev) => {
      if (armed !== prev) scheduleOnRN(onArm, armed);
    },
  );
  const style = useAnimatedStyle(() => ({ width: Math.max(REMOVE_ACTION_WIDTH, -translation.get()) }));
  return (
    <Animated.View style={[styles.panel, { backgroundColor: c.destructive }, style]}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.97}
        accessibilityLabel="Remove"
        style={styles.panelButton}
      >
        <Icon name="trash" size={20} color="#FFFFFF" />
        <AppText variant="footnoteStrong" color="#FFFFFF" maxScale={1.3}>
          Remove
        </AppText>
      </PressableScale>
    </Animated.View>
  );
}

function CartRowBase({ line, onChangeQuantity, onRemove, onPressProduct }: CartRowProps) {
  const { c } = useTheme();
  const a11yLayout = useA11yLayout();
  const { width } = useWindowDimensions();
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const armedRef = useRef(false);
  const { product, quantity } = line;
  const lineTotal = product.price * quantity;
  const armedAt = (width - margin * 2) * 0.5;

  const setArmed = useCallback((armed: boolean) => {
    armedRef.current = armed;
    if (armed) fireHaptic('selection');
  }, []);

  const commitRemove = useCallback(() => {
    armedRef.current = false;
    fireHaptic('warning');
    onRemove(line);
  }, [line, onRemove]);

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.6}
      overshootRight
      overshootFriction={1}
      rightThreshold={REMOVE_ACTION_WIDTH / 2}
      onSwipeableWillOpen={() => {
        if (armedRef.current) commitRemove();
      }}
      renderRightActions={(_progress, translation) => (
        <RemovePanel
          translation={translation}
          armedAt={armedAt}
          onArm={setArmed}
          onPress={commitRemove}
        />
      )}
    >
      <View
        style={[styles.row, { backgroundColor: c.cell }, a11yLayout && styles.rowA11y]}
        accessible
        accessibilityLabel={`${product.name}, ${product.weight}, quantity ${quantity}, ${formatPrice(lineTotal)}`}
        accessibilityActions={[
          { name: 'increment', label: 'Increase quantity' },
          { name: 'decrement', label: 'Decrease quantity' },
          { name: 'delete', label: 'Remove' },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'increment') onChangeQuantity(product.id, quantity + 1);
          else if (e.nativeEvent.actionName === 'decrement') onChangeQuantity(product.id, quantity - 1);
          else if (e.nativeEvent.actionName === 'delete') commitRemove();
        }}
      >
        <PressableScale
          scaleTo={1}
          onPress={() => onPressProduct?.(product.id)}
          accessibilityLabel={`Open ${product.name}`}
          style={styles.thumbWrap}
        >
          <FadeImage
            uri={product.image}
            width={256}
            style={[styles.thumb, a11yLayout && styles.thumbSmall]}
            recyclingKey={product.id}
          />
        </PressableScale>
        <View style={styles.body}>
          <View style={styles.top}>
            <View style={styles.titleCol}>
              <AppText variant="headline" numberOfLines={2}>
                {product.name}
              </AppText>
              <AppText variant="footnote" color="labelSecondary" numberOfLines={1}>
                {product.weight}
              </AppText>
            </View>
            <AppText variant="price">{formatPrice(lineTotal)}</AppText>
          </View>
          <View style={styles.stepperRow}>
            <QuantityStepper
              value={quantity}
              min={0}
              max={20}
              size="compact"
              onChange={(n) => (n <= 0 ? commitRemove() : onChangeQuantity(product.id, n))}
            />
          </View>
        </View>
      </View>
    </ReanimatedSwipeable>
  );
}

export const CartRow = memo(CartRowBase);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 88 },
  rowA11y: { flexDirection: 'column', alignItems: 'stretch' },
  thumbWrap: { width: 64 },
  thumb: { width: 64, height: 64, borderRadius: 14, borderCurve: 'continuous' },
  thumbSmall: { width: 48, height: 48 },
  body: { flex: 1, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  titleCol: { flex: 1, gap: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center' },
  panel: { justifyContent: 'center', alignItems: 'stretch' },
  panelButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: REMOVE_ACTION_WIDTH },
});
