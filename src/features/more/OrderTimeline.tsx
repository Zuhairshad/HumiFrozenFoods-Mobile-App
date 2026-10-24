import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from '@/components/ui';
import type { OrderStatus } from '@/types';
import { colors, radii, spacing } from '@/theme';
import { STEPS, stepIndex } from './status';

const DOT = 32;

function Dot({ done, active, icon }: { done: boolean; active: boolean; icon: (typeof STEPS)[number]['icon'] }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (active) {
      pulse.value = withRepeat(
        withSequence(withTiming(1.35, { duration: 900 }), withTiming(1, { duration: 900 })),
        -1,
      );
    } else {
      pulse.value = 1;
    }
  }, [active, pulse]);
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: active ? 0.35 : 0,
  }));
  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.halo, halo]} />
      <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
        <Ionicons name={icon} size={16} color={active ? colors.tealInk : done ? colors.white : colors.placeholder} />
      </View>
    </View>
  );
}

export function OrderTimeline({ status }: { status: OrderStatus }) {
  const current = stepIndex(status);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(150, withTiming(current / (STEPS.length - 1), { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [current, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={styles.wrap}>
      <View style={styles.trackWrap}>
        <View style={styles.track} />
        <Animated.View style={[styles.fill, fill]} />
      </View>
      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <View key={s.key} style={styles.step}>
            <Dot done={i <= current} active={i === current} icon={s.icon} />
            <AppText
              variant="caption"
              color={i <= current ? 'ink' : 'muted'}
              align="center"
              style={i === current ? styles.activeLabel : undefined}
            >
              {s.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  // Line runs between the centres of the first and last dots (each step is 25% wide).
  trackWrap: { position: 'absolute', top: spacing.sm + DOT / 2 - 2, left: '12.5%', right: '12.5%', height: 4 },
  track: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.sand, borderRadius: radii.pill },
  fill: { height: 4, backgroundColor: colors.gold, borderRadius: radii.pill },
  steps: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: spacing.xs },
  dotWrap: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: DOT, height: DOT, borderRadius: radii.pill, backgroundColor: colors.gold },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: radii.pill,
    backgroundColor: colors.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.teal },
  dotActive: { backgroundColor: colors.gold },
  activeLabel: { fontWeight: '700' },
});
