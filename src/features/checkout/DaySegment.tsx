import { ScrollView, StyleSheet } from 'react-native';
import { FilterChip } from '@/components/ui';
import type { DeliveryDay } from './slots';

export interface DaySegmentProps {
  days: DeliveryDay[];
  value: string | null;
  onChange: (dateKey: string) => void;
}

/** Next five delivery days as capsules (today only before 15:00). */
export function DaySegment({ days, value, onChange }: DaySegmentProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      style={styles.scroll}
      accessibilityRole="tablist"
    >
      {days.map((d) => (
        <FilterChip key={d.key} label={d.label} selected={d.key === value} onPress={() => onChange(d.key)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginBottom: 12 },
  content: { paddingHorizontal: 20, gap: 8 },
});
