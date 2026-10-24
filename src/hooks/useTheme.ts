import { useMemo } from 'react';
import { TextStyle, ViewStyle, useColorScheme } from 'react-native';

import { useAppearanceOverride } from '@/theme/appearance';
import { ColorRoles, darkColors, lightColors } from '@/theme/colors';
import { noShadow, radius, shadows, space } from '@/theme/layout';
import { motion } from '@/theme/motion';
import { TextVariant, textStyles } from '@/theme/typography';

export interface Theme {
  scheme: 'light' | 'dark';
  isDark: boolean;
  c: ColorRoles;
  type: Record<TextVariant, TextStyle>;
  space: typeof space;
  radius: typeof radius;
  /** Shadows are empty in dark mode (2.5). */
  shadow: Record<'float' | 'card', ViewStyle>;
  motion: typeof motion;
}

const light: Theme = {
  scheme: 'light',
  isDark: false,
  c: lightColors,
  type: textStyles,
  space,
  radius,
  shadow: shadows,
  motion,
};

const dark: Theme = {
  ...light,
  scheme: 'dark',
  isDark: true,
  c: darkColors,
  shadow: { float: noShadow, card: noShadow },
};

/** Resolve the active theme: Settings override (via theme/appearance) else the system scheme. */
export function useTheme(): Theme {
  const override = useAppearanceOverride();
  const system = useColorScheme();
  const scheme = override === 'system' ? (system === 'dark' ? 'dark' : 'light') : override;
  return useMemo(() => (scheme === 'dark' ? dark : light), [scheme]);
}
