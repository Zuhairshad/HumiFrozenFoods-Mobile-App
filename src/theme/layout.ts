import { ViewStyle } from 'react-native';

/** 4pt spacing scale. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  giant: 64,
} as const;

/** Horizontal screen gutter. */
export const gutter = 20;

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

/** Soft, layered, teal-tinted shadows (iOS shadow* + Android elevation). */
export const shadows: Record<'sm' | 'md' | 'lg' | 'gold', ViewStyle> = {
  sm: { shadowColor: '#08302F', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  md: { shadowColor: '#08302F', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  lg: { shadowColor: '#08302F', shadowOpacity: 0.18, shadowRadius: 32, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
  gold: { shadowColor: '#D4A017', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
};

/** Height reserved at the bottom of scroll content for the floating tab bar. */
export const TAB_BAR_CLEARANCE = 112;
