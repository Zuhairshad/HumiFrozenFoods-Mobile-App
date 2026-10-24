import { ReactNode, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { AppText, PressableScale } from '@/components/ui';
import type { IoniconName } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';

interface AccordionProps {
  title: string;
  icon: IoniconName;
  children: ReactNode;
  defaultOpen?: boolean;
}

const EASE = Easing.out(Easing.cubic);

export function Accordion({ title, icon, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const measured = useSharedValue(0);
  const progress = useSharedValue(defaultOpen ? 1 : 0);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    progress.value = withTiming(next ? 1 : 0, { duration: 280, easing: EASE });
  };

  const onLayout = (e: LayoutChangeEvent) => {
    measured.value = e.nativeEvent.layout.height;
  };

  const bodyStyle = useAnimatedStyle(() => ({
    height: measured.value * progress.value,
    opacity: progress.value,
  }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }));

  return (
    <View style={styles.card}>
      <PressableScale
        onPress={toggle}
        scaleTo={0.99}
        haptic
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${title}`}
        style={styles.header}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={colors.teal} />
        </View>
        <AppText variant="title" style={styles.title}>
          {title}
        </AppText>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={20} color={colors.muted} />
        </Animated.View>
      </PressableScale>
      <Animated.View style={[styles.body, bodyStyle]}>
        <View style={styles.measure} onLayout={onLayout}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.paper, borderRadius: radii.md, ...shadows.sm, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 60 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
  body: { overflow: 'hidden' },
  // Absolute so its natural height can be measured while the wrapper is collapsed.
  measure: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
