import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { withAlpha } from '@/theme/colors';
import { maxFontScale } from '@/theme/typography';

import { AppText } from './AppText';
import { Icon, IconName } from './Icon';

export interface TagProps {
  label: string;
  tone?: 'neutral' | 'tint' | 'success' | 'destructive' | 'accent';
  icon?: IconName;
}

/** Sentence-case 12 pt status/info tag. Never on grid or shelf photos (do-not 7). */
export function Tag({ label, tone = 'neutral', icon }: TagProps) {
  const { c } = useTheme();
  let bg: string = c.fill;
  let fg: string = c.labelSecondary;
  if (tone === 'tint') {
    bg = c.tintSoft;
    fg = c.tint;
  } else if (tone === 'success') {
    bg = withAlpha(c.success, 0.14);
    fg = c.success;
  } else if (tone === 'destructive') {
    bg = withAlpha(c.destructive, 0.14);
    fg = c.destructive;
  } else if (tone === 'accent') {
    bg = c.accentSoft;
    fg = c.accentText;
  }
  return (
    <View style={[styles.tag, { backgroundColor: bg }]} accessible accessibilityLabel={label}>
      {icon ? <Icon name={icon} size={12} color={fg} weight="semibold" /> : null}
      <AppText variant="caption1Strong" color={fg} maxScale={maxFontScale.control} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
});
