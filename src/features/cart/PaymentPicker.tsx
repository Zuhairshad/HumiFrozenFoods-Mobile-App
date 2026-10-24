import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Badge, PressableScale } from '@/components/ui';
import type { IoniconName } from '@/components/ui';
import { haptics } from '@/hooks/useHaptics';
import { colors, radii, spacing } from '@/theme';

export type PaymentMethod = 'cod' | 'card';

const OPTIONS: { id: PaymentMethod; title: string; sub: string; icon: IoniconName }[] = [
  { id: 'cod', title: 'Pay on delivery', sub: 'Cash or card to the driver', icon: 'cash-outline' },
  { id: 'card', title: 'Card', sub: 'Demo only, no real charge', icon: 'card-outline' },
];

interface Props {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}

export function PaymentPicker({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      {OPTIONS.map((o) => {
        const selected = value === o.id;
        return (
          <PressableScale
            key={o.id}
            onPress={() => {
              haptics.selection();
              onChange(o.id);
            }}
            style={[styles.option, selected && styles.selected]}
            accessibilityLabel={o.title}
          >
            <View style={[styles.icon, selected && styles.iconSelected]}>
              <Ionicons name={o.icon} size={20} color={selected ? colors.tealInk : colors.teal} />
            </View>
            <View style={styles.text}>
              <AppText variant="bodyStrong">{o.title}</AppText>
              <AppText variant="caption" color="muted">
                {o.sub}
              </AppText>
            </View>
            {o.id === 'card' ? <Badge label="Demo" tone="sand" size="sm" /> : null}
            <View style={[styles.radio, selected && styles.radioOn]}>
              {selected ? <View style={styles.dot} /> : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  selected: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  icon: { width: 40, height: 40, borderRadius: radii.pill, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: colors.gold },
  text: { flex: 1 },
  radio: { width: 22, height: 22, borderRadius: radii.pill, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.teal },
  dot: { width: 10, height: 10, borderRadius: radii.pill, backgroundColor: colors.teal },
});
