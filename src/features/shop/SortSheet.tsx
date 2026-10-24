import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, PressableScale } from '@/components/ui';
import { colors, gutter, radii, shadows, spacing } from '@/theme';
import { SORT_OPTIONS, SortKey } from './sort';

interface SortSheetProps {
  visible: boolean;
  value: SortKey;
  onSelect: (k: SortKey) => void;
  onClose: () => void;
}

const OFFSCREEN = 420;

export function SortSheet({ visible, value, onSelect, onClose }: SortSheetProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  // Mount the Modal synchronously when opening; it only unmounts once the exit animation finishes.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      progress.set(withSpring(1, { damping: 20, stiffness: 220, mass: 0.8 }));
    } else {
      progress.set(
        withTiming(0, { duration: 200 }, (done) => {
          if (done) runOnJS(setMounted)(false);
        }),
      );
    }
  }, [visible, progress]);

  const backdrop = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.value) * OFFSCREEN }] }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sort options" />
        </Animated.View>
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }, sheet]}>
          <View style={styles.grabber} />
          <AppText variant="h2" style={styles.title}>
            Sort by
          </AppText>
          {SORT_OPTIONS.map((o) => {
            const selected = o.key === value;
            return (
              <PressableScale
                key={o.key}
                haptic
                scaleTo={0.98}
                accessibilityLabel={o.label}
                onPress={() => {
                  onSelect(o.key);
                  onClose();
                }}
                style={[styles.row, selected && styles.rowSelected]}
              >
                <View style={[styles.iconDisc, selected && styles.iconDiscSelected]}>
                  <Ionicons name={o.icon} size={18} color={selected ? colors.gold : colors.teal} />
                </View>
                <AppText variant="bodyStrong" style={styles.rowLabel} color={selected ? 'teal' : 'ink'}>
                  {o.label}
                </AppText>
                {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.teal} /> : null}
              </PressableScale>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: gutter,
    paddingTop: spacing.md,
    gap: spacing.xs,
    ...shadows.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: spacing.md,
  },
  title: { marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  rowSelected: { backgroundColor: colors.tealSoft },
  rowLabel: { flex: 1 },
  iconDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tealMist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDiscSelected: { backgroundColor: colors.teal },
});
