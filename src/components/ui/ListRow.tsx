import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

import { AppText } from './AppText';
import { Icon, IconName } from './Icon';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Settings-style: white glyph on a 30 pt `tintFill` rounded square. */
  icon?: IconName;
  value?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
  /** Defaults to true when `onPress` is set and there is no `trailing`. */
  chevron?: boolean;
  accessibilityLabel?: string;
}

export function ListRow({ title, subtitle, icon, value, onPress, trailing, destructive, chevron, accessibilityLabel }: ListRowProps) {
  const { c } = useTheme();
  const showChevron = chevron ?? (!!onPress && !trailing);

  const body = (
    <View style={[styles.row, { minHeight: subtitle ? 64 : 52 }]}>
      {icon ? (
        <View style={[styles.disc, { backgroundColor: destructive ? c.destructive : c.tintFill }]}>
          <Icon name={icon} size={17} color="#FFFFFF" weight="semibold" />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="body" color={destructive ? 'destructive' : 'label'} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="footnote" color="labelSecondary" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="body" color="labelSecondary" numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {trailing}
      {showChevron ? <Icon name="chevron.right" size={13} color="labelQuaternary" weight="semibold" /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, value, subtitle].filter(Boolean).join(', ')}
      style={({ pressed }) => ({ backgroundColor: pressed ? c.fill : 'transparent' })}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  disc: { width: 30, height: 30, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  value: { flexShrink: 1, maxWidth: '45%' },
});
