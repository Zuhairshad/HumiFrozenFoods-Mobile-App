import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { products, searchProducts, categories } from '@/data';
import { AppText, EmptyState, Reveal, Screen } from '@/components/ui';
import { ProductCard } from '@/components/product/ProductCard';
import { useCart } from '@/hooks/useCart';
import { colors, gutter, spacing, TAB_BAR_CLEARANCE } from '@/theme';
import type { CategoryId, Product } from '@/types';
import { CartPeekBar, CART_PEEK_HEIGHT } from './CartPeekBar';
import { CategoryChips, CategoryFilter } from './CategoryChips';
import { DietKey, FilterBar } from './FilterBar';
import { SearchBar } from './SearchBar';
import { SortSheet } from './SortSheet';
import { sortProducts, SortKey } from './sort';

const TITLE_HEIGHT = 84;
const COLLAPSE_DISTANCE = 70;
const GUTTER_HALF = spacing.md / 2;
const STAGGER_CAP = 8;

const AnimatedFlatList = Animated.FlatList<Product>;

function parseParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function toCategory(v: string | undefined): CategoryFilter {
  return categories.some((c) => c.id === v) ? (v as CategoryId) : 'all';
}

export function ShopScreen() {
  const params = useLocalSearchParams<{ category?: string; q?: string }>();
  const categoryParam = parseParam(params.category);
  const qParam = parseParam(params.q);

  const [query, setQuery] = useState(qParam ?? '');
  const [debounced, setDebounced] = useState(qParam ?? '');
  const [category, setCategory] = useState<CategoryFilter>(toCategory(categoryParam));
  const [sort, setSort] = useState<SortKey>('featured');
  const [halal, setHalal] = useState(false);
  const [vegan, setVegan] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const { count } = useCart();

  // Keep UI in sync when navigated here with new params (e.g. from Home).
  useEffect(() => {
    setCategory(toCategory(categoryParam));
  }, [categoryParam]);
  useEffect(() => {
    if (qParam !== undefined) {
      setQuery(qParam);
      setDebounced(qParam);
    }
  }, [qParam]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(() => {
    const q = debounced.trim();
    let list = q ? searchProducts(q) : products;
    if (category !== 'all') list = list.filter((p) => p.category === category);
    if (halal) list = list.filter((p) => p.tags.includes('Halal Certified'));
    if (vegan) list = list.filter((p) => p.tags.includes('Vegan Friendly'));
    return sortProducts(list, sort);
  }, [debounced, category, halal, vegan, sort]);

  const hasFilters = category !== 'all' || halal || vegan || sort !== 'featured' || query.length > 0;

  const clearAll = useCallback(() => {
    setQuery('');
    setDebounced('');
    setCategory('all');
    setHalal(false);
    setVegan(false);
    setSort('featured');
  }, []);

  const onToggleDiet = useCallback((k: DietKey) => {
    if (k === 'halal') setHalal((v) => !v);
    else setVegan((v) => !v);
  }, []);
  const openSort = useCallback(() => setSortOpen(true), []);
  const closeSort = useCallback(() => setSortOpen(false), []);

  // Collapsing large title.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const titleStyle = useAnimatedStyle(() => ({
    height: interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [TITLE_HEIGHT, 0], Extrapolation.CLAMP),
    opacity: interpolate(scrollY.value, [0, COLLAPSE_DISTANCE * 0.7], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [0, COLLAPSE_DISTANCE], [0, -12], Extrapolation.CLAMP) },
    ],
  }));

  const renderItem = useCallback(
    ({ item, index }: { item: Product; index: number }) => {
      const card = <ProductCard product={item} variant="grid" index={index} />;
      return (
        <View style={styles.cell}>
          {index < STAGGER_CAP ? <Reveal delay={index * 60}>{card}</Reveal> : card}
        </View>
      );
    },
    [],
  );
  const keyExtractor = useCallback((p: Product) => p.id, []);

  const header = (
    <View style={styles.listHeader}>
      <AppText variant="caption" color="muted">
        {results.length} {results.length === 1 ? 'product' : 'products'}
      </AppText>
      {hasFilters ? (
        <AppText variant="label" color="teal" onPress={clearAll} accessibilityRole="button" style={styles.clearLink}>
          Clear filters
        </AppText>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} edges={['top']}>
      <View style={styles.top}>
        <Animated.View style={[styles.titleWrap, titleStyle]}>
          <AppText variant="h1">Shop</AppText>
          <AppText variant="body" color="muted">
            {products.length} handcrafted frozen favourites
          </AppText>
        </Animated.View>
        <View style={styles.search}>
          <SearchBar value={query} onChangeText={setQuery} />
        </View>
        <View style={styles.chips}>
          <CategoryChips value={category} onChange={setCategory} />
        </View>
        <FilterBar sort={sort} onOpenSort={openSort} halal={halal} vegan={vegan} onToggleDiet={onToggleDiet} />
      </View>

      <AnimatedFlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={2}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title="Nothing found"
            message="We couldn't find anything matching your filters. Try a different search or clear the filters."
            actionLabel="Clear filters"
            onAction={clearAll}
          />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: TAB_BAR_CLEARANCE + (count > 0 ? CART_PEEK_HEIGHT + spacing.lg : 0) },
        ]}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews
      />

      <CartPeekBar />
      <SortSheet visible={sortOpen} value={sort} onSelect={setSort} onClose={closeSort} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { backgroundColor: colors.cream, paddingBottom: spacing.md, gap: spacing.md, zIndex: 2 },
  titleWrap: { paddingHorizontal: gutter, paddingTop: spacing.sm, overflow: 'hidden', justifyContent: 'flex-end' },
  search: { paddingHorizontal: gutter },
  chips: {},
  listContent: { paddingHorizontal: gutter - GUTTER_HALF },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER_HALF,
    paddingBottom: spacing.md,
  },
  clearLink: { paddingVertical: spacing.xs },
  cell: { flex: 1, maxWidth: '50%', paddingHorizontal: GUTTER_HALF, paddingBottom: spacing.md },
});
