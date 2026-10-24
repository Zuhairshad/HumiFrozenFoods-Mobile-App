import { Text, TextProps, TextStyle } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { ColorRoles } from '@/theme/colors';
import { TextVariant, defaultMaxScale } from '@/theme/typography';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  /** A colour role name (e.g. 'labelSecondary') or any literal colour string. */
  color?: keyof ColorRoles | (string & {});
  align?: TextStyle['textAlign'];
  /** Overrides the Dynamic Type cap (default 1.6; 1.2 for brandDisplay). */
  maxScale?: number;
}

export function AppText({ variant = 'body', color = 'label', align, maxScale, style, ...rest }: AppTextProps) {
  const { c, type } = useTheme();
  const resolved = color in c ? c[color as keyof ColorRoles] : color;
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={maxScale ?? defaultMaxScale(variant)}
      {...rest}
      style={[type[variant], { color: resolved }, align ? { textAlign: align } : null, style]}
    />
  );
}
