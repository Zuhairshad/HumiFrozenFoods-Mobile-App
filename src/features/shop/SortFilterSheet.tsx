import { useCallback } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, Button, Icon, ListRow, ListSection, SegmentedControl } from '@/components/ui';
import { haptics } from '@/hooks/useHaptics';
import { useTheme } from '@/hooks/useTheme';
import { READY_OPTIONS, productCountLabel, type Diet, type ReadyIn } from './filters';
import { SORT_OPTIONS, type SortKey } from './sort';
import { useSheetFilters } from './useProductFilters';

const READY_LABELS = READY_OPTIONS.map((o) => o.label);
const FOOTER_HEIGHT = 128;

/**
 * Body of the `sort-filter` formSheet: Sort by (checkmark rows), Dietary (switches), Ready in
 * (segmented). Changes apply to the Shop grid live; the primary button shows the live count.
 */
export function SortFilterSheet() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { filters, count, activeCount, setSort, setReady, toggleDiet, reset } = useSheetFilters();

  const onSort = useCallback(
    (key: SortKey) => {
      if (key !== filters.sort) haptics.selection();
      setSort(key);
    },
    [filters.sort, setSort],
  );

  const onDiet = useCallback(
    (diet: Diet) => {
      haptics.selection();
      toggleDiet(diet);
    },
    [toggleDiet],
  );

  const readyIndex = Math.max(0, READY_OPTIONS.findIndex((o) => o.value === filters.ready));
  const onReady = useCallback(
    (index: number) => {
      const next: ReadyIn = READY_OPTIONS[index]?.value ?? 0;
      haptics.selection();
      setReady(next);
    },
    [setReady],
  );

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
  }, []);

  const bottom = Math.max(insets.bottom, 16);

  return (
    <View style={[styles.root, { backgroundColor: c.groupedBackground }]} accessibilityViewIsModal>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: FOOTER_HEIGHT + bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="title3" accessibilityRole="header" style={styles.title}>
          Sort and filter
        </AppText>

        <ListSection header="Sort by">
          {SORT_OPTIONS.map((o) => (
            <ListRow
              key={o.key}
              title={o.label}
              onPress={() => onSort(o.key)}
              trailing={o.key === filters.sort ? <Icon name="checkmark" size={18} color="tint" weight="semibold" /> : undefined}
            />
          ))}
        </ListSection>

        <ListSection header="Dietary">
          <ListRow
            title="Halal certified"
            trailing={
              <Switch
                value={filters.diets.includes('halal')}
                onValueChange={() => onDiet('halal')}
                trackColor={{ true: c.tintFill, false: c.fillStrong }}
                accessibilityLabel="Halal certified"
              />
            }
          />
          <ListRow
            title="Vegan friendly"
            trailing={
              <Switch
                value={filters.diets.includes('vegan')}
                onValueChange={() => onDiet('vegan')}
                trackColor={{ true: c.tintFill, false: c.fillStrong }}
                accessibilityLabel="Vegan friendly"
              />
            }
          />
        </ListSection>

        <View style={styles.segmentBlock}>
          <AppText variant="footnote" color="labelSecondary" style={styles.sectionLabel} accessibilityRole="header">
            Ready in
          </AppText>
          <SegmentedControl options={READY_LABELS} index={readyIndex} onChange={onReady} />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: c.groupedBackground, borderTopColor: c.separator, paddingBottom: bottom },
        ]}
      >
        <Button
          title={count === 0 ? 'No products match' : `Show ${productCountLabel(count)}`}
          onPress={close}
          size="lg"
          fullWidth
          disabled={count === 0}
        />
        <Button title="Reset" variant="plain" onPress={reset} disabled={activeCount === 0} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 24, paddingHorizontal: 20, gap: 24 },
  title: { textAlign: 'center' },
  segmentBlock: { gap: 8 },
  sectionLabel: { paddingHorizontal: 16 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 4,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
