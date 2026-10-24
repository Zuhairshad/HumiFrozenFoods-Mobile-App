import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { maxFontScale } from '@/theme/typography';

import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'tinted' | 'plain' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

const HEIGHT = { sm: 36, md: 44, lg: 52 } as const;
const PAD = { sm: 14, md: 18, lg: 24 } as const;

export function Button({ title, onPress, variant = 'primary', size = 'md', icon, loading, disabled, fullWidth, accessibilityLabel }: ButtonProps) {
  const { c } = useTheme();
  const [pressed, setPressed] = useState(false);
  const inactive = !!disabled || !!loading;

  let bg = 'transparent';
  let fg: string = c.tint;
  if (variant === 'primary') {
    bg = pressed ? c.tintPressed : c.tintFill;
    fg = c.onTint;
  } else if (variant === 'tinted') {
    bg = c.tintSoft;
  } else if (variant === 'destructive') {
    bg = c.fill;
    fg = c.destructive;
  }

  return (
    <PressableScale
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      scaleTo={0.97}
      pressedOpacity={variant === 'plain' ? 0.6 : undefined}
      disabled={inactive}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ busy: !!loading }}
      hitSlop={size === 'sm' ? 4 : undefined}
      style={[
        styles.base,
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: variant === 'plain' ? 8 : PAD[size],
          backgroundColor: bg,
          alignSelf: fullWidth ? 'stretch' : 'auto',
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 18} color={fg} weight="semibold" /> : null}
        <AppText variant={size === 'sm' ? 'subheadStrong' : 'headline'} color={fg} maxScale={maxFontScale.control} numberOfLines={1}>
          {title}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 999, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
