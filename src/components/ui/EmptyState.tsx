import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import type { IoniconName } from './types';

export interface EmptyStateProps {
  icon: IoniconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.halo}>
        <View style={styles.disc}>
          <Ionicons name={icon} size={36} color={colors.teal} />
        </View>
      </View>
      <AppText variant="h2" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" color="muted" align="center" style={styles.msg}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button title={actionLabel} onPress={onAction} variant="gold" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: spacing.xxxl, paddingVertical: spacing.huge, gap: spacing.sm },
  halo: {
    width: 120,
    height: 120,
    borderRadius: radii.pill,
    backgroundColor: colors.tealMist,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  disc: {
    width: 80,
    height: 80,
    borderRadius: radii.pill,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msg: { maxWidth: 300 },
  action: { marginTop: spacing.xl },
});
