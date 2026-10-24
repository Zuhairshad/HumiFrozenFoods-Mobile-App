import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, PressableScale } from '@/components/ui';
import { haptics } from '@/hooks/useHaptics';
import { colors, gutter, radii, shadows, spacing } from '@/theme';

export const SLOT_WINDOWS = ['09:00 – 12:00', '12:00 – 15:00', '15:00 – 18:00'] as const;

export interface Slot {
  day: number;
  window: number;
}

export function slotDate(day: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + day + 1);
  return d;
}

export function slotLabel(slot: Slot): string {
  const d = slotDate(slot.day);
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${date}, ${SLOT_WINDOWS[slot.window]}`;
}

interface Props {
  value: Slot | null;
  onChange: (s: Slot) => void;
  error?: string;
}

export function SlotPicker({ value, onChange, error }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.days}
        style={styles.bleed}
      >
        {[0, 1, 2, 3, 4].map((day) => {
          const d = slotDate(day);
          const selected = value?.day === day;
          return (
            <PressableScale
              key={day}
              onPress={() => {
                haptics.selection();
                onChange({ day, window: value?.window ?? 0 });
              }}
              style={[styles.day, selected && styles.daySelected]}
              accessibilityLabel={d.toDateString()}
            >
              <AppText variant="overline" color={selected ? 'tealInk' : 'muted'}>
                {d.toLocaleDateString('en-GB', { weekday: 'short' })}
              </AppText>
              <AppText variant="h2" color={selected ? 'tealInk' : 'ink'}>
                {d.getDate()}
              </AppText>
              <AppText variant="caption" color={selected ? 'tealInk' : 'muted'}>
                {d.toLocaleDateString('en-GB', { month: 'short' })}
              </AppText>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={styles.windows}>
        {SLOT_WINDOWS.map((w, i) => {
          const selected = value?.window === i;
          return (
            <PressableScale
              key={w}
              onPress={() => {
                haptics.selection();
                onChange({ day: value?.day ?? 0, window: i });
              }}
              style={[styles.window, selected && styles.windowSelected]}
            >
              <AppText variant="bodyStrong" color={selected ? 'white' : 'ink'}>
                {w}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
      {error ? (
        <AppText variant="caption" color="red">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  bleed: { marginHorizontal: -gutter },
  days: { paddingHorizontal: gutter, gap: spacing.sm },
  day: {
    width: 72,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  daySelected: { backgroundColor: colors.goldSoft, borderColor: colors.gold, ...shadows.sm },
  windows: { gap: spacing.sm },
  window: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.paper,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  windowSelected: { backgroundColor: colors.teal, borderColor: colors.teal },
});
