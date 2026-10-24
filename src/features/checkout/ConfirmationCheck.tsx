import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const STROKE = 4;
const CHECK_LENGTH = 40; // approximate path length in the 100x100 viewBox
const standard = Easing.bezier(0.2, 0, 0, 1);

export interface ConfirmationCheckProps {
  size?: number;
  /** Fired when the drawing starts (use for the success haptic). */
  onStart?: () => void;
}

/** Drawn ring (500 ms) then tick (300 ms) plus one pulse ring. Static when Reduce Motion is on. */
export function ConfirmationCheck({ size = 96, onStart }: ConfirmationCheckProps) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const r = 50 - STROKE / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const ring = useSharedValue(reduced ? 1 : 0);
  const tick = useSharedValue(reduced ? 1 : 0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    onStart?.();
    if (reduced) return;
    ring.set(withTiming(1, { duration: 500, easing: standard }));
    tick.set(withDelay(450, withTiming(1, { duration: 300, easing: standard })));
    pulse.set(withDelay(500, withTiming(1, { duration: 700, easing: standard })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * (1 - ring.get()) }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LENGTH * (1 - tick.get()) }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.get()),
    transform: [{ scale: 1 + 0.6 * pulse.get() }],
  }));

  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel="Order confirmed">
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, borderWidth: 2, borderColor: c.tint },
          pulseStyle,
        ]}
      />
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <AnimatedCircle
          cx={50}
          cy={50}
          r={r}
          stroke={c.tint}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          rotation={-90}
          origin="50, 50"
          animatedProps={ringProps}
        />
        <AnimatedPath
          d="M30 52 L44 66 L70 36"
          stroke={c.tint}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={`${CHECK_LENGTH} ${CHECK_LENGTH}`}
          animatedProps={tickProps}
        />
      </Svg>
    </View>
  );
}
