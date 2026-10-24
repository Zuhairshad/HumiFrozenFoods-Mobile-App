import { useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions, type ListRenderItem } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Stack, useScrollToTop } from 'expo-router';
import { AppText, EmptyState, FilterChip } from '@/components/ui';
import { useTabInset } from '@/hooks/useTabInset';
import { useTheme } from '@/hooks/useTheme';
import type { Product } from '@/types';
import { CategoryRail } from './CategoryRail';
import { FilterButton } from './FilterButton';
import { ProductTile } from './ProductTile';
import { dietLabel, productCountLabel, type Diet } from './filters';
import { useProductFilters } from './useProductFilters';

const SIDE = 20;
const GAP = 12;
const A11Y_FONT_SCALE = 1.35;
const FADE_MS = 150;

const keyExtractor = (item: Product) => item.id;
const RowGap = () => <View style={styles.rowGap} />;

export function ShopScreen() {
  const { c } = useTheme();
  const tabInset = useTabInset();
  const { width, fontScale } = useWindowDimensions();
  const {
    filters,
    results,
    activeCount,
    setCategory,
    setSort,
    setReady,
    setQuery,
    toggleDiet,
    reset,
    openSheet,
  } = useProductFilters();

  const listRef = useRef<FlatList<Product>>(null);
  useScrollToTop(listRef);

  const columns = fontScale >= A11Y_FONT_SCALE ? 1 : 2;
  const cellWidth = columns === 1 ? width - SIDE * 2 : (width - SIDE * 2 - GAP) / 2;

  // Single 150 ms cross-fade when the category changes (design 5.2).
  const fade = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    fade.set(0.35);
    fade.set(withTiming(1, { duration: FADE_MS }));
  }, [filters.category, fade]);

  const headerRight = useCallback(
    () => <FilterButton active={activeCount > 0} count={activeCount} onPress={openSheet} />,
    [activeCount, openSheet],
  );

  const renderItem = useCallback<ListRenderItem<Product>>(
    ({ item }) => (
      <View style={{ width: cellWidth }}>
        <ProductTile product={item} />
      </View>
    ),
    [cellWidth],
  );

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <CategoryRail value={filters.category} onChange={setCategory} />
        <View style={styles.summary}>
          <AppText
            variant="footnote"
            color="labelSecondary"
            accessibilityLiveRegion="polite"
          >
            {productCountLabel(results.length)}
          </AppText>
          {activeCount > 0 || filters.q ? (
            <View style={styles.chips}>
              {filters.q ? (
                <FilterChip
                  label={`“${filters.q}”`}
                  selected
                  icon="xmark"
                  onPress={() => setQuery('')}
                />
              ) : null}
              {filters.diets.map((d: Diet) => (
                <FilterChip key={d} label={dietLabel(d)} selected icon="xmark" onPress={() => toggleDiet(d)} />
              ))}
              {filters.ready ? (
                <FilterChip label={`${filters.ready} min`} selected icon="xmark" onPress={() => setReady(0)} />
              ) : null}
              {filters.sort !== 'featured' ? (
                <FilterChip label="Sorted" selected icon="xmark" onPress={() => setSort('featured')} />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    ),
    [
      filters.category,
      filters.q,
      filters.diets,
      filters.ready,
      filters.sort,
      results.length,
      activeCount,
      setCategory,
      setSort,
      setReady,
      setQuery,
      toggleDiet,
    ],
  );

  const empty = useMemo(
    () => (
      <EmptyState
        icon="line.3.horizontal.decrease.circle"
        title="No matches"
        message="Try removing a filter."
        actionLabel="Clear filters"
        onAction={reset}
      />
    ),
    [reset],
  );

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ headerRight }} />
      <Animated.View style={[styles.root, fadeStyle]}>
        <FlatList
          ref={listRef}
          key={columns}
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.columns : undefined}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ItemSeparatorComponent={RowGap}
          contentInsetAdjustmentBehavior="automatic"
          scrollIndicatorInsets={{ bottom: tabInset - 16 }}
          contentContainerStyle={[styles.content, { paddingBottom: tabInset }]}
          initialNumToRender={8}
          windowSize={7}
          showsVerticalScrollIndicator={false}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: SIDE },
  rowGap: { height: 24 },
  columns: { columnGap: GAP },
  header: { marginHorizontal: -SIDE, gap: 8, paddingTop: 8, marginBottom: 4 },
  summary: { paddingHorizontal: SIDE, gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
