import { memo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { FilterChip } from '@/components/ui';
import { categories } from '@/data';
import type { CategoryFilter } from './filters';

export interface CategoryRailProps {
  value: CategoryFilter;
  onChange: (next: CategoryFilter) => void;
}

const ITEMS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  ...categories.map((cat) => ({ id: cat.id as CategoryFilter, label: cat.title })),
];

/** Horizontal filled-capsule category selector (design 5.2). */
function CategoryRailBase({ value, onChange }: CategoryRailProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
    >
      {ITEMS.map((item) => (
        <FilterChip
          key={item.id}
          label={item.label}
          selected={item.id === value}
          onPress={() => {
            if (item.id !== value) onChange(item.id);
          }}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
});

export const CategoryRail = memo(CategoryRailBase);
