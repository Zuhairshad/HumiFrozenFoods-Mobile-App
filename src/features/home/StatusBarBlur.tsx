import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useReduceTransparency } from '@/theme';

interface Props {
  scrollY: SharedValue<number>;
}

/** Chrome blur behind the status bar that fades in after 40 pt of scroll (the one non-tab-bar blur on Home). */
export const StatusBarBlur = memo(function StatusBarBlur({ scrollY }: Props) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceTransparency = useReduceTransparency();

  const style = useAnimatedStyle(() => {
    const y = scrollY.get();
    return { opacity: Math.max(0, Math.min(1, (y - 40) / 24)) };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.bar, { height: insets.top }, style]}>
      {reduceTransparency ? (
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} />
      ) : (
        <BlurView
          intensity={80}
          tint={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Animated.View style={[styles.hairline, { backgroundColor: c.separator }]} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
