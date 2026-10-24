import { Platform, TextStyle } from 'react-native';

/** System font: SF on iOS ('System'), Roboto on Android and the system-ui stack on web (both `undefined`). */
export const systemFamily: string | undefined = Platform.OS === 'ios' ? 'System' : undefined;

/** The only custom font in the app (splash wordmark, Today card headline, order confirmation). */
export const BRAND_FONT = 'PlayfairDisplay_700Bold';

export type TextVariant =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'subheadStrong'
  | 'footnote'
  | 'footnoteStrong'
  | 'caption1'
  | 'caption1Strong'
  | 'caption2'
  | 'priceLarge'
  | 'price'
  | 'brandDisplay';

type W = NonNullable<TextStyle['fontWeight']>;

function t(size: number, line: number, weight: W, tracking: number, tabular = false): TextStyle {
  return {
    fontFamily: systemFamily,
    fontSize: size,
    lineHeight: line,
    fontWeight: weight,
    letterSpacing: tracking,
    ...(tabular ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : null),
  };
}

export const textStyles: Record<TextVariant, TextStyle> = {
  largeTitle: t(34, 41, '700', 0.37),
  title1: t(28, 34, '700', 0.36),
  title2: t(22, 28, '700', 0.35),
  title3: t(20, 25, '600', 0.38),
  headline: t(17, 22, '600', -0.41),
  body: t(17, 22, '400', -0.41),
  callout: t(16, 21, '400', -0.32),
  subhead: t(15, 20, '400', -0.24),
  subheadStrong: t(15, 20, '600', -0.24),
  footnote: t(13, 18, '400', -0.08),
  footnoteStrong: t(13, 18, '600', -0.08),
  caption1: t(12, 16, '400', 0),
  caption1Strong: t(12, 16, '500', 0),
  caption2: t(11, 13, '500', 0.06),
  priceLarge: t(22, 28, '700', 0.35, true),
  price: t(15, 20, '600', -0.24, true),
  brandDisplay: {
    fontFamily: BRAND_FONT,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
};

/** Dynamic Type caps (2.1.4). */
export const maxFontScale = {
  body: 1.6,
  control: 1.3,
  brand: 1.2,
  tabBar: 1.0,
} as const;

export function defaultMaxScale(variant: TextVariant): number {
  return variant === 'brandDisplay' ? maxFontScale.brand : maxFontScale.body;
}
