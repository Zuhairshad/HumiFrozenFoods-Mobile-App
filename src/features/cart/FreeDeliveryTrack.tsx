import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppText, Icon } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';

export interface FreeDeliveryTrackProps {
  /** `freeDeliveryRemainingPence` from the quote (0 when unlocked). */
  remainingPence: number;
  /** Server `delivery.freeThresholdPence`. The track is hidden when delivery is never free (null). */
  thresholdPence: number | null;
  /** Numbers are a local placeholder. */
  estimate?: boolean;
}

export function FreeDeliveryTrack({ remainingPence, thresholdPence, estimate }: FreeDeliveryTrackProps) {
  const { c, motion } = useTheme();
  const reduced = useReducedMotion();
  const threshold = thresholdPence ?? 0;
  const unlocked = remainingPence <= 0;
  const ratio = threshold > 0 ? Math.min(1, Math.max(0, (threshold - remainingPence) / threshold)) : 0;
  const progress = useSharedValue(ratio);

  useEffect(() => {
    progress.set(reduced ? ratio : withSpring(ratio, motion.springs.smooth));
  }, [ratio, reduced, progress, motion.springs.smooth]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.0001, progress.get()) }] }));

  if (thresholdPence === null || thresholdPence <= 0) return null;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Free delivery progress"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    >
      <View style={styles.textRow}>
        {unlocked ? <Icon name="checkmark.circle" fill size={16} color="accent" /> : null}
        <AppText variant="footnote" color={unlocked ? 'success' : 'labelSecondary'} style={styles.text}>
          {unlocked
            ? "You've unlocked free delivery"
            : `${formatPrice(remainingPence / 100)} away from free delivery${estimate ? ' (estimate)' : ''}`}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: c.fill }]}>
        <Animated.View style={[styles.fill, { backgroundColor: c.accent }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  textRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { flexShrink: 1 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, width: '100%', borderRadius: 2, transformOrigin: 'left center' },
});
