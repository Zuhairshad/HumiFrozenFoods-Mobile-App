import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

export interface SectionHeaderProps {
  overline?: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  align?: 'left' | 'center';
  light?: boolean;
}

export function SectionHeader({ overline, title, actionLabel, onAction, align = 'left', light }: SectionHeaderProps) {
  const center = align === 'center';
  return (
    <View style={[styles.row, center && styles.center]}>
      <View style={[styles.text, center && styles.textCenter]}>
        {overline ? (
          <AppText variant="overline" color={light ? 'gold' : 'goldDeep'} align={align}>
            {overline}
          </AppText>
        ) : null}
        <AppText variant="h2" color={light ? 'white' : 'ink'} align={align}>
          {title}
        </AppText>
      </View>
      {actionLabel && onAction && !center ? (
        <PressableScale onPress={onAction} haptic accessibilityLabel={actionLabel} style={styles.action}>
          <AppText variant="label" color={light ? 'gold' : 'teal'}>
            {actionLabel}
          </AppText>
          <Ionicons name="arrow-forward" size={14} color={light ? colors.gold : colors.teal} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  center: { justifyContent: 'center' },
  text: { flex: 1, gap: spacing.xs },
  textCenter: { alignItems: 'center', flex: 0 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, justifyContent: 'center', paddingBottom: 2 },
});
