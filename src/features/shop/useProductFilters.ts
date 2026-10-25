import { useCallback, useMemo, useState } from 'react';
import { router, useLocalSearchParams, useNavigation, useRoute } from 'expo-router';
import { useProducts } from '@/hooks/useProducts';
import {
  DEFAULT_FILTERS,
  activeRefinements,
  applyFilters,
  filtersToParams,
  parseFilters,
  type CategoryFilter,
  type Diet,
  type FilterParams,
  type ProductFilters,
  type ReadyIn,
} from './filters';
import type { SortKey } from './sort';

/** Stable identity for a filter value so memoised results do not recompute on unrelated renders. */
function filtersKey(f: ProductFilters): string {
  return [f.category, f.q, f.sort, f.diets.join(','), f.ready].join('|');
}

/** Pure patch helper shared by the Shop screen and the Sort & Filter sheet. */
export function patchFilters(current: ProductFilters, patch: Partial<ProductFilters>): ProductFilters {
  return { ...current, ...patch };
}

export function toggleDietIn(current: ProductFilters, diet: Diet): ProductFilters {
  const diets = current.diets.includes(diet)
    ? current.diets.filter((d) => d !== diet)
    : [...current.diets, diet];
  return { ...current, diets };
}

/**
 * Shop filter state, held in the URL (`?category=&q=&sort=&diet=&ready=`) so other screens can
 * deep link (`/shop?category=kebabs`, `/shop?diet=vegan`, `/shop?quick=1`).
 */
export function useProductFilters() {
  const params = useLocalSearchParams<FilterParams>();
  const route = useRoute();
  const products = useProducts();

  const parsed = parseFilters(params);
  const key = filtersKey(parsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable identity of `parsed`
  const filters = useMemo(() => parsed, [key]);
  const results = useMemo(() => applyFilters(filters, products), [filters, products]);

  const update = useCallback((patch: Partial<ProductFilters>) => {
    router.setParams(filtersToParams(patchFilters(filters, patch)));
  }, [filters]);

  const setCategory = useCallback((category: CategoryFilter) => update({ category }), [update]);
  const setSort = useCallback((sort: SortKey) => update({ sort }), [update]);
  const setReady = useCallback((ready: ReadyIn) => update({ ready }), [update]);
  const setQuery = useCallback((q: string) => update({ q }), [update]);
  const toggleDiet = useCallback(
    (diet: Diet) => router.setParams(filtersToParams(toggleDietIn(filters, diet))),
    [filters],
  );
  const clearRefinements = useCallback(
    () => update({ sort: 'featured', diets: [], ready: 0 }),
    [update],
  );
  const reset = useCallback(() => router.setParams(filtersToParams(DEFAULT_FILTERS)), []);

  const openSheet = useCallback(() => {
    router.push({
      pathname: '/sort-filter',
      params: { ...filtersToParams(filters), source: route.key },
    });
  }, [filters, route.key]);

  return {
    filters,
    results,
    activeCount: activeRefinements(filters),
    setCategory,
    setSort,
    setReady,
    setQuery,
    toggleDiet,
    clearRefinements,
    reset,
    openSheet,
  };
}

/**
 * Draft state for the Sort & Filter sheet. The sheet is its own route, so it keeps a local copy
 * (seeded from its params) and forwards every change to the Shop route that opened it, which gives
 * the Shop grid a live update behind the sheet and lets the sheet show a live result count.
 */
export function useSheetFilters() {
  const params = useLocalSearchParams<FilterParams & { source?: string }>();
  const navigation = useNavigation();
  const source = Array.isArray(params.source) ? params.source[0] : params.source;
  const products = useProducts();

  const [filters, setFilters] = useState<ProductFilters>(() => parseFilters(params));
  const results = useMemo(() => applyFilters(filters, products), [filters, products]);

  const commit = useCallback(
    (next: ProductFilters) => {
      setFilters(next);
      if (!source) return;
      navigation.dispatch({
        type: 'SET_PARAMS',
        payload: { params: filtersToParams(next) },
        source,
      });
    },
    [navigation, source],
  );

  const setSort = useCallback((sort: SortKey) => commit(patchFilters(filters, { sort })), [commit, filters]);
  const setReady = useCallback((ready: ReadyIn) => commit(patchFilters(filters, { ready })), [commit, filters]);
  const toggleDiet = useCallback((diet: Diet) => commit(toggleDietIn(filters, diet)), [commit, filters]);
  const reset = useCallback(
    () => commit(patchFilters(filters, { sort: 'featured', diets: [], ready: 0 })),
    [commit, filters],
  );

  return {
    filters,
    count: results.length,
    activeCount: activeRefinements(filters),
    setSort,
    setReady,
    toggleDiet,
    reset,
  };
}
