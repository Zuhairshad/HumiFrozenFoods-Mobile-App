import { memo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { categories } from '@/data';
import { Chip } from '@/components/ui';
import { gutter, spacing } from '@/theme';
import type { CategoryId } from '@/types';

export type CategoryFilter = CategoryId | 'all';

interface CategoryChipsProps {
  value: CategoryFilter;
  onChange: (c: CategoryFilter) => void;
}

export const CategoryChips = memo(function CategoryChips({ value, onChange }: CategoryChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      <Chip label="All" selected={value === 'all'} onPress={() => onChange('all')} />
      {categories.map((c) => (
        <Chip key={c.id} label={c.title} selected={value === c.id} onPress={() => onChange(c.id)} />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: gutter, gap: spacing.sm, alignItems: 'center' },
});
