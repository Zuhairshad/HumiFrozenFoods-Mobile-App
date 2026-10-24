import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, IconName } from './Icon';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap} accessible={false}>
      <Icon name={icon} size={48} color="labelTertiary" />
      <AppText variant="title3" align="center" accessibilityRole="header">
        {title}
      </AppText>
      {message ? (
        <AppText variant="callout" color="labelSecondary" align="center">
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button title={actionLabel} onPress={onAction} variant="tinted" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, paddingHorizontal: 32, paddingVertical: 48 },
  action: { marginTop: 12 },
});
