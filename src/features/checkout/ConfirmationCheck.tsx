import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';

const standard = Easing.bezier(0.2, 0, 0, 1);
const RING_MS = 500;
const TICK_MS = 300;

export interface ConfirmationCheckProps {
  size?: number;
  /** Fired when the drawing starts (use for the success haptic). */
  onStart?: () => void;
}

// Tick geometry in a 100 x 100 box: A(30,52) -> B(44,66) -> C(70,36).
const SHORT = { x: 30, y: 52, len: Math.hypot(14, 14), deg: 45 };
const LONG = { x: 44, y: 66, len: Math.hypot(26, 30), deg: (Math.atan2(-30, 26) * 180) / Math.PI };

/**
 * Drawn ring (500 ms, standard easing) then tick (300 ms) plus a single pulse ring (700 ms).
 * Built from plain Views (two rotating half rings) so it needs no SVG dependency.
 * Static when Reduce Motion is enabled.
 */
export function ConfirmationCheck({ size = 96, onStart }: ConfirmationCheckProps) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const ring = useSharedValue(reduced ? 1 : 0);
  const tick = useSharedValue(reduced ? 1 : 0);
  const pulse = useSharedValue(reduced ? 1 : 0);
  const stroke = 4;
  const half = size / 2;
  const s = size / 100;

  useEffect(() => {
    onStart?.();
    if (reduced) return;
    ring.set(withTiming(1, { duration: RING_MS, easing: standard }));
    tick.set(withDelay(RING_MS - 50, withTiming(1, { duration: TICK_MS, easing: Easing.linear })));
    pulse.set(withDelay(RING_MS, withTiming(1, { duration: 700, easing: standard })));
  }, [onStart, reduced, ring, tick, pulse]);

  // Right half draws during the first 50% of the ring, left half during the second 50%.
  const rightStyle = useAnimatedStyle(() => {
    const p = Math.min(1, ring.get() * 2);
    return { transform: [{ rotate: `${-135 + 180 * p}deg` }] };
  });
  const leftStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, ring.get() * 2 - 1));
    return { transform: [{ rotate: `${-135 + 180 * p}deg` }] };
  });
  const shortStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${SHORT.deg}deg` }, { scaleX: Math.max(0.001, Math.min(1, tick.get() * 2)) }],
  }));
  const longStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${LONG.deg}deg` }, { scaleX: Math.max(0.001, Math.min(1, tick.get() * 2 - 1)) }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 0 : 0.35 * (1 - pulse.get()),
    transform: [{ scale: 1 + 0.6 * pulse.get() }],
  }));

  const circle = { width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: 'transparent' } as const;
  const strokeBase = { position: 'absolute', height: stroke * s, borderRadius: (stroke * s) / 2, backgroundColor: c.tint, transformOrigin: 'left center' } as const;

  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel="Order confirmed">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: half, borderWidth: 2, borderColor: c.tint }, pulseStyle]}
      />
      <View style={[styles.half, { left: half, width: half, height: size }]}>
        <Animated.View style={[circle, { left: -half, borderTopColor: c.tint, borderRightColor: c.tint }, rightStyle]} />
      </View>
      <View style={[styles.half, { left: 0, width: half, height: size }]}>
        <Animated.View style={[circle, { left: 0, borderBottomColor: c.tint, borderLeftColor: c.tint }, leftStyle]} />
      </View>
      <Animated.View
        style={[strokeBase, { left: SHORT.x * s, top: SHORT.y * s - (stroke * s) / 2, width: SHORT.len * s }, shortStyle]}
      />
      <Animated.View
        style={[strokeBase, { left: LONG.x * s, top: LONG.y * s - (stroke * s) / 2, width: LONG.len * s }, longStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  half: { position: 'absolute', top: 0, overflow: 'hidden' },
});
