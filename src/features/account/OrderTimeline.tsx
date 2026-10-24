import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { OrderStatus } from '@/types';
import { AppText, Icon } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { STEPS, stepIndex } from './status';

const DOT = 12;
const LINE = 2;
const DOT_COL = 24;

interface OrderTimelineProps {
  status: OrderStatus;
  /** Optional time label for the first step, e.g. "24 Oct 18:02". */
  placedLabel?: string;
}

function Connector({ filled, index }: { filled: boolean; index: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const fill = useSharedValue(reduced ? (filled ? 1 : 0) : 0);

  useEffect(() => {
    const target = filled ? 1 : 0;
    fill.set(
      reduced
        ? target
        : withDelay(index * 200, withTiming(target, { duration: 350, easing: Easing.bezier(0.2, 0, 0, 1) })),
    );
  }, [filled, index, reduced, fill]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: fill.get() }] }));

  return (
    <View style={[styles.line, { backgroundColor: c.fill }]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: c.tint, transformOrigin: 'top' }, style]}
      />
    </View>
  );
}

function Dot({ state }: { state: 'done' | 'current' | 'todo' }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (state === 'current' && !reduced) {
      pulse.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.bezier(0.42, 0, 0.58, 1) }), -1, false));
    } else {
      cancelAnimation(pulse);
      pulse.set(0);
    }
    return () => cancelAnimation(pulse);
  }, [state, reduced, pulse]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.get()),
    transform: [{ scale: 1 + 0.5 * pulse.get() }],
  }));

  const color = state === 'done' ? c.tint : state === 'current' ? c.accent : c.separatorOpaque;

  return (
    <View style={styles.dotBox}>
      {state === 'current' ? (
        <Animated.View style={[styles.dot, styles.ring, { backgroundColor: c.accent }, ring]} />
      ) : null}
      {state === 'done' ? (
        <Icon fill name="checkmark.circle" size={DOT + 6} color={c.tint} />
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
    </View>
  );
}

export function OrderTimeline({ status, placedLabel }: OrderTimelineProps) {
  const current = stepIndex(status);
  const delivered = status === 'delivered';

  return (
    <View accessibilityRole="list" accessibilityLabel="Order progress">
      {STEPS.map((step, i) => {
        const state = i < current || (delivered && i === current) ? 'done' : i === current ? 'current' : 'todo';
        const last = i === STEPS.length - 1;
        const label = state === 'done' ? 'completed' : state === 'current' ? 'current step' : 'upcoming';
        return (
          <View
            key={step.key}
            style={styles.row}
            accessible
            accessibilityLabel={`${step.label}, ${label}${i === 0 && placedLabel ? `, ${placedLabel}` : ''}`}
          >
            <View style={styles.rail}>
              <Dot state={state} />
              {last ? null : <Connector filled={i < current} index={i} />}
            </View>
            <View style={styles.text}>
              <AppText variant={state === 'current' ? 'headline' : 'body'} color={state === 'todo' ? 'labelTertiary' : 'label'}>
                {step.label}
              </AppText>
              {i === 0 && placedLabel ? (
                <AppText variant="footnote" color="labelSecondary" style={styles.time}>
                  {placedLabel}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, minHeight: 52 },
  rail: { width: DOT_COL, alignItems: 'center' },
  dotBox: { width: DOT_COL, height: DOT_COL, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  ring: { position: 'absolute' },
  line: { width: LINE, flex: 1, borderRadius: 1, marginVertical: 2 },
  text: { flex: 1, paddingTop: 2, gap: 2 },
  time: { fontVariant: ['tabular-nums'] },
});
