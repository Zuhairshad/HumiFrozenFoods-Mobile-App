import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { fireHaptic } from './haptic';
import { PressableScale } from './PressableScale';

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: 'compact' | 'regular';
}

export function QuantityStepper({ value, onChange, min = 0, max = 20, size = 'regular' }: QuantityStepperProps) {
  const { c } = useTheme();
  const h = size === 'compact' ? 32 : 44;
  const w = size === 'compact' ? 96 : 112;
  const canDec = value > min;
  const canInc = value < max;

  const step = (delta: 1 | -1) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    fireHaptic('selection');
    onChange(next);
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Quantity"
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') step(1);
        else if (e.nativeEvent.actionName === 'decrement') step(-1);
      }}
      style={[styles.box, { minHeight: h, width: w, backgroundColor: c.fill }]}
    >
      <PressableScale
        onPress={() => step(-1)}
        disabled={!canDec}
        scaleTo={0.88}
        accessibilityLabel="Decrease quantity"
        hitSlop={{ top: 6, bottom: 6 }}
        style={[styles.btn, { opacity: canDec ? 1 : 0.35 }]}
      >
        <Icon name="minus" size={15} color="label" weight="semibold" />
      </PressableScale>
      <AppText variant={size === 'compact' ? 'subheadStrong' : 'headline'} maxScale={1.3} style={styles.value} accessible={false}>
        {String(value)}
      </AppText>
      <PressableScale
        onPress={() => step(1)}
        disabled={!canInc}
        scaleTo={0.88}
        accessibilityLabel="Increase quantity"
        hitSlop={{ top: 6, bottom: 6 }}
        style={[styles.btn, { opacity: canInc ? 1 : 0.35 }]}
      >
        <Icon name="plus" size={15} color="label" weight="semibold" />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderCurve: 'continuous' },
  btn: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  value: { minWidth: 24, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
