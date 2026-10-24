import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppText, Icon } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { formatPrice } from '@/lib/format';
import { FREE_DELIVERY_THRESHOLD } from '@/lib/pricing';
import { useReducedMotion } from 'react-native-reanimated';

export interface FreeDeliveryTrackProps {
  /** Pounds still needed for free delivery (0 when unlocked). */
  remaining: number;
}

export function FreeDeliveryTrack({ remaining }: FreeDeliveryTrackProps) {
  const { c, motion } = useTheme();
  const reduced = useReducedMotion();
  const unlocked = remaining <= 0;
  const subtotal = Math.min(FREE_DELIVERY_THRESHOLD, Math.max(0, FREE_DELIVERY_THRESHOLD - remaining));
  const progress = useSharedValue(subtotal / FREE_DELIVERY_THRESHOLD);

  useEffect(() => {
    const target = subtotal / FREE_DELIVERY_THRESHOLD;
    progress.set(reduced ? target : withSpring(target, motion.springs.smooth));
  }, [subtotal, reduced, progress, motion.springs.smooth]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.0001, progress.get()) }] }));

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Free delivery progress"
      accessibilityValue={{ min: 0, max: FREE_DELIVERY_THRESHOLD, now: Math.round(subtotal * 100) / 100 }}
    >
      <View style={styles.textRow}>
        {unlocked ? <Icon name="checkmark.circle" fill size={16} color="accent" /> : null}
        <AppText variant="footnote" color={unlocked ? 'success' : 'labelSecondary'} style={styles.text}>
          {unlocked ? "You've unlocked free delivery" : `${formatPrice(remaining)} away from free delivery`}
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
