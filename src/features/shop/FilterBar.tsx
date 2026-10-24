import { memo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from '@/components/ui';
import { gutter, spacing } from '@/theme';
import { SORT_OPTIONS, SortKey } from './sort';

export type DietKey = 'halal' | 'vegan';

interface FilterBarProps {
  sort: SortKey;
  onOpenSort: () => void;
  halal: boolean;
  vegan: boolean;
  onToggleDiet: (k: DietKey) => void;
}

export const FilterBar = memo(function FilterBar({ sort, onOpenSort, halal, vegan, onToggleDiet }: FilterBarProps) {
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Sort';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      <Chip icon="swap-vertical" label={sort === 'featured' ? 'Sort' : sortLabel} selected={sort !== 'featured'} onPress={onOpenSort} />
      <Chip icon="shield-checkmark-outline" label="Halal" selected={halal} onPress={() => onToggleDiet('halal')} />
      <Chip icon="leaf-outline" label="Vegan Friendly" selected={vegan} onPress={() => onToggleDiet('vegan')} />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: gutter, gap: spacing.sm, alignItems: 'center' },
});
