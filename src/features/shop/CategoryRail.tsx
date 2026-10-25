import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { FilterChip } from '@/components/ui';
import { useCategories } from '@/hooks/useProducts';
import type { CategoryFilter } from './filters';

export interface CategoryRailProps {
  value: CategoryFilter;
  onChange: (next: CategoryFilter) => void;
}

/** Horizontal filled-capsule category selector (design 5.2). */
function CategoryRailBase({ value, onChange }: CategoryRailProps) {
  const categories = useCategories();
  const items = useMemo<{ id: CategoryFilter; label: string }[]>(
    () => [{ id: 'all', label: 'All' }, ...categories.map((cat) => ({ id: cat.id, label: cat.title }))],
    [categories],
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
    >
      {items.map((item) => (
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
