import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Surface } from '@/components/ui';
import { spacing } from '@/theme';

export function MenuGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.wrap}>
      {title ? (
        <AppText variant="overline" color="muted" style={styles.title}>
          {title}
        </AppText>
      ) : null}
      <Surface padded={false} radius="lg" shadow="sm" style={styles.card}>
        <View style={styles.clip}>{children}</View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.sm },
  card: {},
  clip: { overflow: 'hidden', borderRadius: 24 },
});
