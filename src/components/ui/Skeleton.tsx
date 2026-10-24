import { useEffect } from 'react';
import { DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';
import { easings } from '@/theme/motion';

export interface SkeletonProps {
  width: DimensionValue;
  height: DimensionValue;
  radius?: number;
}

/** `fill` block whose opacity pulses 0.55 to 1 over 1100 ms (no sweeps). Static with reduced motion. */
export function Skeleton({ width, height, radius = 8 }: SkeletonProps) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      opacity.set(0.8);
      return;
    }
    opacity.set(withRepeat(withTiming(0.55, { duration: 1100, easing: easings.inOut }), -1, true));
  }, [reduced, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, borderCurve: 'continuous', backgroundColor: c.fill }, style]}
    />
  );
}
