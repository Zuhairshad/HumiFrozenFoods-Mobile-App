import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, gutter, spacing } from '@/theme';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  transparent?: boolean;
  light?: boolean;
}

export function ScreenHeader({ title, subtitle, onBack, right, transparent, light }: ScreenHeaderProps) {
  return (
    <View style={[styles.row, !transparent && { backgroundColor: light ? colors.tealInk : colors.cream }]}>
      {onBack ? (
        <IconButton
          icon="chevron-back"
          onPress={onBack}
          variant={light ? 'glass' : 'solid'}
          accessibilityLabel="Go back"
        />
      ) : null}
      <View style={styles.text}>
        <AppText variant="h2" color={light ? 'white' : 'ink'} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={light ? 'tealSoft' : 'muted'} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: spacing.sm, paddingHorizontal: gutter },
  text: { flex: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
