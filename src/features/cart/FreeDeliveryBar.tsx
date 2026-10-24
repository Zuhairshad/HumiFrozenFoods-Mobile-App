import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText, Surface } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import { FREE_DELIVERY_THRESHOLD } from '@/lib/pricing';
import { colors, gradients, radii, spacing } from '@/theme';

interface Props {
  subtotal: number;
  remaining: number;
}

export function FreeDeliveryBar({ subtotal, remaining }: Props) {
  const unlocked = remaining <= 0;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(Math.min(1, subtotal / FREE_DELIVERY_THRESHOLD), { damping: 18, stiffness: 120 });
  }, [subtotal, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Surface tone={unlocked ? 'teal' : 'paper'} radius="md" padded={spacing.lg}>
      <View style={styles.row}>
        <View style={[styles.icon, unlocked ? styles.iconOn : styles.iconOff]}>
          <Ionicons
            name={unlocked ? 'checkmark' : 'bicycle-outline'}
            size={18}
            color={unlocked ? colors.tealInk : colors.teal}
          />
        </View>
        <AppText variant="bodyStrong" color={unlocked ? 'white' : 'ink'} style={styles.text}>
          {unlocked ? "You've unlocked free delivery!" : `Add ${formatPrice(remaining)} more for free delivery`}
        </AppText>
      </View>
      <View style={[styles.track, unlocked && styles.trackOn]}>
        <Animated.View style={[styles.fill, fill]}>
          <LinearGradient
            colors={gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  iconOff: { backgroundColor: colors.tealSoft },
  iconOn: { backgroundColor: colors.gold },
  text: { flex: 1 },
  track: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.sand,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  trackOn: { backgroundColor: 'rgba(255,255,255,0.2)' },
  fill: { height: '100%', borderRadius: radii.pill, overflow: 'hidden' },
});
