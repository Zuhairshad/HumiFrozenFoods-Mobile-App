import { forwardRef } from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { ColorName, colors, TextVariant, textStyles } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: ColorName | (string & {});
  align?: TextStyle['textAlign'];
}

export const AppText = forwardRef<Text, AppTextProps>(function AppText(
  { variant = 'body', color = 'ink', align, style, ...rest },
  ref,
) {
  const resolved = color in colors ? colors[color as ColorName] : color;
  return (
    <Text
      ref={ref}
      {...rest}
      style={[textStyles[variant], { color: resolved }, align ? { textAlign: align } : null, style]}
    />
  );
});
