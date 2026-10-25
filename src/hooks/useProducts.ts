import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { categories } from '@/data/categories';
import { categoriesWithProducts, findProduct } from '@/data/selectors';
import { useCatalogStore, type CatalogStatus } from '@/store/catalog';
import type { Category, Product } from '@/types';

/** The catalogue (live once fetched, bundled before). Re-renders when live data arrives. */
export function useProducts(): Product[] {
  return useCatalogStore((s) => s.products);
}

/** One product by slug; `undefined` when it does not exist (or was unpublished). */
export function useProduct(id: string | undefined): Product | undefined {
  return useCatalogStore((s) => (id ? findProduct(s.products, id) : undefined));
}

/** Browsable categories that currently hold at least one product. */
export function useCategories(): Category[] {
  const products = useProducts();
  return useMemo(() => categoriesWithProducts(categories, products), [products]);
}

export function useCatalogStatus(): CatalogStatus {
  return useCatalogStore((s) => s.status);
}

/**
 * Keeps the catalogue fresh: refresh on mount (TTL-guarded) and force one when the app returns to the
 * foreground. Aborts on unmount. Mount it on screens that stay alive (Home, Shop).
 */
export function useCatalogSync(): void {
  useEffect(() => {
    const controller = new AbortController();
    const { refresh } = useCatalogStore.getState();
    void refresh({ signal: controller.signal });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh({ force: true, signal: controller.signal });
    });
    return () => {
      sub.remove();
      controller.abort();
    };
  }, []);
}

/** Pull-to-refresh wiring: `refreshing` flag + `onRefresh` that forces a refetch. */
export function usePullToRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void useCatalogStore
      .getState()
      .refresh({ force: true })
      .finally(() => setRefreshing(false));
  }, []);
  return { refreshing, onRefresh };
}
