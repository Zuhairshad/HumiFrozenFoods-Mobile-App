import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, radii, shadows } from '@/theme';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface QuantityStepperProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
}

export function QuantityStepper({ value, onChange, min = 0, max = 99, size = 'md' }: QuantityStepperProps) {
  const h = size === 'sm' ? 36 : 44;
  const canDec = value > min;
  const canInc = value < max;
  return (
    <View style={[styles.wrap, { height: h }]}>
      <PressableScale
        onPress={() => canDec && onChange(value - 1)}
        disabled={!canDec}
        haptic
        scaleTo={0.85}
        accessibilityLabel="Decrease quantity"
        style={[styles.btn, { width: h, height: h }, !canDec && styles.off]}
      >
        <Ionicons name={value <= 1 && min === 0 ? 'trash-outline' : 'remove'} size={size === 'sm' ? 16 : 18} color={colors.teal} />
      </PressableScale>
      <Animated.View key={value} entering={FadeIn.duration(160)} style={[styles.value, { minWidth: size === 'sm' ? 22 : 28 }]}>
        <AppText variant="bodyStrong" align="center" style={size === 'sm' ? styles.valueSm : undefined}>
          {value}
        </AppText>
      </Animated.View>
      <PressableScale
        onPress={() => canInc && onChange(value + 1)}
        disabled={!canInc}
        haptic
        scaleTo={0.85}
        accessibilityLabel="Increase quantity"
        style={[styles.btn, styles.plus, { width: h, height: h }, !canInc && styles.off]}
      >
        <Ionicons name="add" size={size === 'sm' ? 16 : 18} color={colors.tealInk} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.sm,
  },
  btn: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  plus: { backgroundColor: colors.gold },
  off: { opacity: 0.35 },
  value: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  valueSm: { fontSize: 14 },
});
