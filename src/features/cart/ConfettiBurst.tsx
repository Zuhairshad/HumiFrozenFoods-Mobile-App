import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/theme';

const PALETTE = [colors.gold, colors.goldDeep, colors.teal, colors.green, colors.red, colors.tealSoft];
const COUNT = 28;

function Particle({ angle, distance, size, color, delay }: {
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
  }, [t, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.7 ? 1 : 1 - (t.value - 0.7) / 0.3,
    transform: [
      { translateX: Math.cos(angle) * distance * t.value },
      // Gravity pulls particles down as they travel.
      { translateY: Math.sin(angle) * distance * t.value + 90 * t.value * t.value },
      { rotate: `${t.value * 540}deg` },
      { scale: 1 - t.value * 0.3 },
    ],
  }));

  return (
    <Animated.View
      style={[{ position: 'absolute', width: size, height: size * 0.5, borderRadius: 2, backgroundColor: color }, style]}
    />
  );
}

/** Particle burst centred on its container; purely decorative. */
export function ConfettiBurst() {
  const particles = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        key: i,
        angle: (Math.PI * 2 * i) / COUNT + Math.random() * 0.4,
        distance: 90 + Math.random() * 90,
        size: 8 + Math.random() * 6,
        color: PALETTE[i % PALETTE.length],
        delay: 350 + Math.random() * 120,
      })),
    [],
  );
  return (
    <View style={styles.root} pointerEvents="none">
      {particles.map(({ key, ...p }) => (
        <Particle key={key} {...p} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
