import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radii, shadows } from '@/theme';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import type { IoniconName } from './types';

export interface IconButtonProps {
  icon: IoniconName;
  onPress: () => void;
  variant?: 'solid' | 'glass' | 'plain' | 'gold' | 'dark';
  size?: number;
  badge?: number;
  accessibilityLabel: string;
}

export function IconButton({
  icon,
  onPress,
  variant = 'solid',
  size = 44,
  badge,
  accessibilityLabel,
}: IconButtonProps) {
  const iconColor =
  const box = { width: size, height: size, borderRadius: radii.pill };

  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.9}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        box,
        variant === 'dark' && { backgroundColor: colors.tealInk },
        variant === 'gold' && shadows.gold,
        variant === 'glass' && styles.glass,
      ]}
    >
      {variant === 'gold' ? (
        <LinearGradient
          colors={gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radii.pill }]}
        />
      ) : null}
      {variant === 'glass' ? (
        Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassDark }]} />
        ) : (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        )
      ) : null}
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={iconColor} />
      {badge && badge > 0 ? (
        <View style={styles.badge}>
            {badge > 99 ? '99+' : String(badge)}
          </AppText>
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  glass: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12, letterSpacing: 0 },
});
