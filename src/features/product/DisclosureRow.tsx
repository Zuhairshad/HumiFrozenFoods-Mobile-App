import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppText, Icon, PressableScale } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

interface DisclosureRowProps {
  title: string;
  children: ReactNode;
}

/** Inset-grouped disclosure: 52 pt row, chevron rotates 90 degrees, content expands inline. */
export function DisclosureRow({ title, children }: DisclosureRowProps) {
  const { c } = useTheme();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const rotation = useSharedValue(0);

  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    rotation.set(reduceMotion ? (next ? 90 : 0) : withTiming(next ? 90 : 0, { duration: 250 }));
  };

  return (
    <View>
      <PressableScale
        onPress={toggle}
        scaleTo={1}
        accessibilityLabel={title}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <AppText variant="body" maxScale={1.6} style={styles.title}>
          {title}
        </AppText>
        <Animated.View style={chevronStyle}>
          <Icon name="chevron.right" size={14} weight="semibold" color={c.labelTertiary} />
        </Animated.View>
      </PressableScale>
      {open ? (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(150)} style={styles.body}>
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
});
