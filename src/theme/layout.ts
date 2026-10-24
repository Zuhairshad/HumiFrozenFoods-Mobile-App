import { ViewStyle } from 'react-native';

/** 4pt grid (2.2). */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;
export type SpaceName = keyof typeof space;

/** Horizontal screen margin. */
export const margin = 20;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  capsule: 999,
} as const;
export type RadiusName = keyof typeof radii;

export interface RadiusStyle {
  borderRadius: number;
  borderCurve: 'continuous';
}

/** `radius('lg')` or `radius(31)` -> `{ borderRadius, borderCurve: 'continuous' }`. */
export function radius(r: RadiusName | number): RadiusStyle {
  return { borderRadius: typeof r === 'number' ? r : radii[r], borderCurve: 'continuous' };
}

/** Nested rule: inner radius = outer radius minus padding, clamped to 6. */
export function innerRadius(outer: number, padding: number): number {
  return Math.max(6, outer - padding);
}

const SHADOW_COLOR = '#08302F';

/** Only floating objects have shadows, and only in light mode (2.5). */
export const shadows: Record<'float' | 'card', ViewStyle> = {
  float: {
    shadowColor: SHADOW_COLOR,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  card: {
    shadowColor: SHADOW_COLOR,
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
};

export const noShadow: ViewStyle = {
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
};

/** Floating glass tab bar geometry (3.2, 3.6). */
export const TAB_CAPSULE_HEIGHT = 62;
export const TAB_BREATHING = 16;

export function tabBarBottomOffset(safeBottom: number): number {
  return Math.max(safeBottom - 8, 12);
}

/** Bottom padding that tab-root scroll content needs (3.6). */
export function computeTabInset(safeBottom: number): number {
  return TAB_CAPSULE_HEIGHT + tabBarBottomOffset(safeBottom) + TAB_BREATHING;
}

/** Reference value on a Face ID iPhone (safe bottom 34): 104. Prefer `useTabInset()`. */
export const TAB_INSET = computeTabInset(34);

/** fontScale at which layouts switch to the accessibility variants (7.1). */
export const A11Y_FONT_SCALE = 1.35;
