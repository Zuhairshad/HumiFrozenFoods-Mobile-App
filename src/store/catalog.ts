import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mergeCatalog } from '@/data/merge';
import { bundledProducts } from '@/data/products';
import { fetchLiveCatalog, getCatalogBaseUrl } from '@/lib/api/catalog-client';
import type { CategoryId, Product } from '@/types';

export { categoryFromCollection, mergeCatalog, mergeProduct } from '@/data/merge';

/** idle: nothing fetched yet | loading | ready: live data in hand | offline: last fetch failed | demo: no API configured */
export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'offline' | 'demo';

export const CATALOG_TTL_MS = 5 * 60 * 1000;

export interface RefreshOptions {
  /** Skip the TTL check (pull-to-refresh, app foreground). */
  force?: boolean;
  /** Abort when the caller unmounts. The request itself is only cancelled when every caller has aborted. */
  signal?: AbortSignal;
}

interface CatalogState {
  products: Product[];
  fetchedAt: number | null;
  status: CatalogStatus;
  /** Stale-while-revalidate: resolves when finished, never rejects. Failures set status 'offline'. */
  refresh: (opts?: RefreshOptions) => Promise<void>;
}

const CATEGORY_IDS: readonly string[] = ['savory-snacks', 'kebabs', 'vegetable-samosas', 'samosas', 'other'];

/** Defensive check for products read back from AsyncStorage (could be from an older build or corrupted). */
function toStoredProduct(v: unknown): Product | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.length === 0 || typeof p.name !== 'string') return null;
  if (typeof p.pricePence !== 'number' || !Number.isInteger(p.pricePence) || p.pricePence < 0) return null;
  if (typeof p.price !== 'number' || typeof p.inStock !== 'boolean') return null;
  if (typeof p.category !== 'string' || !CATEGORY_IDS.includes(p.category)) return null;
  if (typeof p.image !== 'string') return null;
  return {
    ...(p as unknown as Product),
    category: p.category as CategoryId,
    description: typeof p.description === 'string' ? p.description : '',
    tags: Array.isArray(p.tags) ? (p.tags as Product['tags']) : [],
    weight: typeof p.weight === 'string' ? p.weight : '',
    ingredients: typeof p.ingredients === 'string' ? p.ingredients : '',
    readyInMins: typeof p.readyInMins === 'number' ? p.readyInMins : 0,
    rating: typeof p.rating === 'number' ? p.rating : 0,
    reviewCount: typeof p.reviewCount === 'number' ? p.reviewCount : 0,
  };
}

interface Inflight {
  promise: Promise<void>;
  controller: AbortController;
  waiters: number;
}
let inflight: Inflight | null = null;

function attach(flight: Inflight, signal: AbortSignal | undefined): void {
  flight.waiters += 1;
  signal?.addEventListener(
    'abort',
    () => {
      flight.waiters -= 1;
      if (flight.waiters <= 0) flight.controller.abort();
    },
    { once: true },
  );
}

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => ({
      products: bundledProducts,
      fetchedAt: null,
      status: getCatalogBaseUrl() ? 'idle' : 'demo',

      refresh: async ({ force = false, signal }: RefreshOptions = {}) => {
        if (signal?.aborted) return;
        if (!getCatalogBaseUrl()) {
          if (get().status !== 'demo') set({ status: 'demo' });
          return;
        }
        if (inflight) {
          attach(inflight, signal);
          return inflight.promise;
        }
        const { fetchedAt, status } = get();
        if (!force && fetchedAt !== null && Date.now() - fetchedAt < CATALOG_TTL_MS) {
          if (status !== 'ready') set({ status: 'ready' });
          return;
        }

        const previous: CatalogStatus = status === 'loading' ? 'idle' : status;
        const controller = new AbortController();
        set({ status: 'loading' });

        const run = async () => {
          try {
            const result = await fetchLiveCatalog({ signal: controller.signal });
            if (result.mode === 'demo') {
              set({ status: 'demo' });
            } else if (result.products.length === 0) {
              // An empty (or fully malformed) list is treated as a failed fetch: never blank the menu.
              set({ status: 'offline' });
            } else {
              set({
                products: mergeCatalog(result.products, bundledProducts),
                fetchedAt: Date.now(),
                status: 'ready',
              });
            }
          } catch (e) {
            const aborted = e instanceof Error && 'kind' in e && (e as { kind?: string }).kind === 'aborted';
            set({ status: aborted ? previous : 'offline' });
          } finally {
            inflight = null;
          }
        };

        const flight: Inflight = { controller, waiters: 0, promise: Promise.resolve() };
        inflight = flight;
        flight.promise = run();
        attach(flight, signal);
        return flight.promise;
      },
    }),
    {
      name: 'humi-catalog',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ products: s.products, fetchedAt: s.fetchedAt }),
      merge: (persisted, current) => {
        // Without an API there is nothing live to trust: the bundled menu is the truth.
        if (!getCatalogBaseUrl() || typeof persisted !== 'object' || persisted === null) return current;
        const p = persisted as { products?: unknown; fetchedAt?: unknown };
        if (!Array.isArray(p.products)) return current;
        const products = p.products.map(toStoredProduct).filter((x): x is Product => x !== null);
        if (products.length === 0) return current;
        const fetchedAt = typeof p.fetchedAt === 'number' && Number.isFinite(p.fetchedAt) ? p.fetchedAt : null;
        return { ...current, products, fetchedAt };
      },
    },
  ),
);

/** Current snapshot for non-reactive callers (gateways, selectors). UI must use the hooks instead. */
export const getCatalogProducts = (): Product[] => useCatalogStore.getState().products;
