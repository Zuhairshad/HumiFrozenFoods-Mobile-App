import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radii, shadows, spacing } from '@/theme';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import type { IoniconName } from './types';

type Variant = 'primary' | 'gold' | 'outline' | 'ghost' | 'light';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IoniconName;
  iconRight?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<Size, number> = { sm: 40, md: 52, lg: 60 };
const ICON: Record<Size, number> = { sm: 16, md: 19, lg: 21 };
const PAD: Record<Size, number> = { sm: spacing.lg, md: spacing.xxl, lg: spacing.xxxl };

const FG: Record<Variant, string> = {
  primary: colors.white,
  gold: colors.tealInk,
  outline: colors.teal,
  ghost: colors.teal,
  light: colors.teal,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
}: ButtonProps) {
  const fg = FG[variant];
  const height = HEIGHT[size];
  const inactive = disabled || loading;

  const content = (
    <View style={[styles.row, { paddingHorizontal: PAD[size] }]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={ICON[size]} color={fg} /> : null}
          <AppText
            variant="title"
            color={fg}
            style={[styles.title, size === 'sm' && styles.titleSm]}
            numberOfLines={1}
          >
            {title}
          </AppText>
          {iconRight ? <Ionicons name={iconRight} size={ICON[size]} color={fg} /> : null}
        </>
      )}
    </View>
  );

  const container: StyleProp<ViewStyle> = [
    styles.base,
    { height, minWidth: height },
    fullWidth && styles.full,
    variant === 'primary' && { backgroundColor: colors.teal, ...shadows.md },
    variant === 'gold' && shadows.gold,
    variant === 'outline' && styles.outline,
    variant === 'light' && { backgroundColor: colors.white, ...shadows.sm },
    inactive && styles.inactive,
    style,
  ];

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      haptic={variant === 'primary' || variant === 'gold'}
      scaleTo={0.97}
      accessibilityLabel={title}
      style={container}
    >
      {variant === 'gold' ? (
        <LinearGradient
          colors={gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radii.pill }]}
        />
      ) : null}
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.pill, overflow: 'visible', alignItems: 'center', justifyContent: 'center' },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  title: { letterSpacing: 0.2 },
  titleSm: { fontSize: 14 },
  outline: { borderWidth: 1.5, borderColor: colors.teal, backgroundColor: 'transparent' },
  inactive: { opacity: 0.5 },
});
