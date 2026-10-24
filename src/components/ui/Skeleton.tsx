import { useEffect } from 'react';
import { DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radii } from '@/theme';

export interface SkeletonProps {
  width: DimensionValue;
  height: number;
  radius?: number;
}

export function Skeleton({ width, height, radius = radii.sm }: SkeletonProps) {
  const o = useSharedValue(0.55);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.sand }, style]} />;
}
