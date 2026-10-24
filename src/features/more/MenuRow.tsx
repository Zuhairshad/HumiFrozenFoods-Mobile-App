import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Badge, PressableScale } from '@/components/ui';
import type { IoniconName } from '@/components/ui/types';
import { colors, radii, spacing } from '@/theme';

export interface MenuRowProps {
  icon: IoniconName;
  title: string;
  subtitle?: string;
  badge?: string;
  onPress: () => void;
  last?: boolean;
}

export function MenuRow({ icon, title, subtitle, badge, onPress, last }: MenuRowProps) {
  return (
    <PressableScale onPress={onPress} haptic scaleTo={0.985} accessibilityLabel={title}>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Ionicons name={icon} size={20} color={colors.goldDeep} />
        </View>
        <View style={[styles.body, !last && styles.divider]}>
          <View style={styles.text}>
            <AppText variant="title">{title}</AppText>
            {subtitle ? (
              <AppText variant="caption" color="muted" numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {badge ? <Badge label={badge} tone="gold" size="sm" /> : null}
          <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, minHeight: 60 },
  tile: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.md,
    paddingRight: spacing.lg,
    minHeight: 60,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  text: { flex: 1 },
});
