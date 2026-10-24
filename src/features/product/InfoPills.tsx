import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui';
import type { IoniconName } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';
import type { Product } from '@/types';

interface Pill {
  icon: IoniconName;
  value: string;
  label: string;
}

export function InfoPills({ product }: { product: Product }) {
  const pills: Pill[] = [
    { icon: 'time-outline', value: `${product.readyInMins} mins`, label: 'Ready in' },
    { icon: 'ribbon-outline', value: 'Halal', label: 'Certified' },
    { icon: 'snow-outline', value: 'Frozen', label: 'Cook from' },
  ];
  return (
    <View style={styles.row}>
      {pills.map((p) => (
        <View key={p.label} style={styles.pill} accessible accessibilityLabel={`${p.label} ${p.value}`}>
          <View style={styles.icon}>
            <Ionicons name={p.icon} size={20} color={colors.teal} />
          </View>
          <AppText variant="bodyStrong" align="center">
            {p.value}
          </AppText>
          <AppText variant="caption" color="muted" align="center">
            {p.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  pill: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.paper,
    borderRadius: radii.md,
    ...shadows.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
});
