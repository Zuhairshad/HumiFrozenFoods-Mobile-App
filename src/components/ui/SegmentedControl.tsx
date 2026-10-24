import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';
import { durations, springs } from '@/theme/motion';
import { maxFontScale } from '@/theme/typography';

import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface SegmentedControlProps {
  options: string[];
  index: number;
  onChange: (index: number) => void;
}

const PAD = 2;

/** Cross-platform segmented control (h32, r8). The selected pill slides with the `snappy` spring. */
export function SegmentedControl({ options, index, onChange }: SegmentedControlProps) {
  const { c, isDark } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const segment = options.length > 0 ? (width - PAD * 2) / options.length : 0;

  const placed = useRef(false);
  useEffect(() => {
    if (segment <= 0) return;
    const target = index * segment;
    if (!placed.current) {
      placed.current = true;
      x.set(target);
      return;
    }
    x.set(reduced ? withTiming(target, { duration: durations.fast }) : withSpring(target, springs.snappy));
  }, [index, segment, reduced, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: c.fill }]}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { width: segment, backgroundColor: isDark ? c.elevated : '#FFFFFF', borderColor: c.separator },
            pill,
          ]}
        />
      ) : null}
      {options.map((label, i) => (
        <PressableScale
          key={label}
          scaleTo={0.98}
          haptic="selection"
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected: i === index }}
          onPress={() => i !== index && onChange(i)}
          style={styles.segment}
        >
          <AppText variant="footnoteStrong" maxScale={maxFontScale.control} numberOfLines={1}>
            {label}
          </AppText>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', minHeight: 32, padding: PAD, borderRadius: 8, borderCurve: 'continuous', alignSelf: 'stretch' },
  pill: {
    position: 'absolute',
    top: PAD,
    bottom: PAD,
    left: PAD,
    borderRadius: 6.5,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
