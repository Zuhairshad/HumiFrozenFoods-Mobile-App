import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, GlassSurface, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import { shadows } from '@/theme';

export interface CheckoutBarProps {
  /** Pounds, as last returned by the server (or the local optimistic preview). */
  total: number;
  onPress: () => void;
  /** Button label before the price, default "Checkout". */
  label?: string;
  loading?: boolean;
  disabled?: boolean;
  /**
   * `floating`: a capsule button above the tab bar (Cart).
   * `glass`: full-width glass bar anchored to the bottom (Checkout), with `footnote` text under the button.
   */
  variant?: 'floating' | 'glass';
  /** `floating` only: distance from the screen bottom (TAB_INSET - 8). */
  bottom?: number;
  footnote?: string;
}

export function CheckoutBar({
  total,
  onPress,
  label = 'Checkout',
  loading,
  disabled,
  variant = 'floating',
  bottom = 0,
  footnote,
}: CheckoutBarProps) {
  const { c, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const title = `${label} · ${formatPrice(total)}`;

  if (variant === 'glass') {
    return (
      <View style={styles.glassWrap} pointerEvents="box-none">
        <GlassSurface radius={0} tone="adaptive" style={styles.glass}>
          <View style={[styles.glassInner, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Button
              title={title}
              onPress={onPress}
              size="lg"
              fullWidth
              loading={loading}
              disabled={disabled}
              accessibilityLabel={loading ? 'Processing payment' : title}
            />
            {footnote ? (
              <AppText variant="caption1" color="labelTertiary" align="center">
                {footnote}
              </AppText>
            ) : null}
          </View>
          <View style={[styles.hairline, { backgroundColor: c.separator }]} />
        </GlassSurface>
      </View>
    );
  }

  const inactive = !!disabled || !!loading;
  return (
    <View style={[styles.floatWrap, { bottom }]} pointerEvents="box-none">
      <PressableScale
        onPress={onPress}
        disabled={inactive}
        haptic="light"
        accessibilityLabel={title}
        style={[
          styles.floatButton,
          { backgroundColor: inactive ? c.fillStrong : c.tintFill },
          shadow.float ?? shadows.float,
        ]}
      >
        <AppText variant="headline" color={inactive ? 'labelTertiary' : 'onTint'} maxScale={1.3}>
          {title}
        </AppText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  floatWrap: { position: 'absolute', left: 20, right: 20 },
  floatButton: { minHeight: 54, borderRadius: 999, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 14 },
  glassWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  glass: { width: '100%' },
  glassInner: { paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: 0.5 },
});
