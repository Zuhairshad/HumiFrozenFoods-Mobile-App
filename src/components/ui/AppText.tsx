import { Text, TextProps, TextStyle } from 'react-native';
import { ColorName, colors, TextVariant, textStyles } from '@/theme';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: ColorName | (string & {});
  align?: TextStyle['textAlign'];
}

export function AppText({ variant = 'body', color = 'ink', align, style, ...rest }: AppTextProps) {
  const resolved = color in colors ? colors[color as ColorName] : color;
  return (
    <Text
      {...rest}
      style={[textStyles[variant], { color: resolved }, align ? { textAlign: align } : null, style]}
    />
  );
}
