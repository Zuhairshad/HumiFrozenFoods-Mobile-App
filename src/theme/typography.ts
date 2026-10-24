import { TextStyle } from 'react-native';

/**
 * Font family names as registered by useFonts() in src/app/_layout.tsx.
 * Display = Playfair Display (the site uses a serif for headings), Body = Inter.
 */
export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  displayBlack: 'PlayfairDisplay_800ExtraBold',
  displayItalic: 'PlayfairDisplay_700Bold_Italic',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export type TextVariant =
  | 'hero'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'overline'
  | 'price';

export const textStyles: Record<TextVariant, TextStyle> = {
  hero: { fontFamily: fonts.displayBlack, fontSize: 44, lineHeight: 48, letterSpacing: -1 },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.display, fontSize: 19, lineHeight: 25 },
  title: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 23 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 16, letterSpacing: 0.2 },
  overline: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  price: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
};
