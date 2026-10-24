import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { AppText, Button, Surface } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

export function SuccessCard({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel: string; onAction: () => void }) {
  return (
    <Surface radius="xl" shadow="md" padded={spacing.xxl}>
      <View style={styles.center}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.badge}>
          <Ionicons name="checkmark" size={40} color={colors.tealInk} />
        </Animated.View>
        <AppText variant="h2" align="center">
          {title}
        </AppText>
        <AppText variant="body" color="muted" align="center">
          {message}
        </AppText>
        <View style={styles.action}>
          <Button title={actionLabel} onPress={onAction} variant="primary" />
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.md },
  badge: {
    width: 80,
    height: 80,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  action: { marginTop: spacing.md },
});
