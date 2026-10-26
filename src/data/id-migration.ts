import type { CartLine } from '@/types';

/**
 * Bundled product ids that differed from the live API slugs (verified against GET /api/products on
 * 2026-10-25). Persisted carts, favourites and orders written by older builds use the LEFT ids.
 */
export const LEGACY_PRODUCT_IDS: Readonly<Record<string, string>> = {
  'meat-peshawari-chapli-kebab': 'meat-chapli-kebab',
  'chicken-peshawari-chapli-kebab': 'chicken-chapli-kebab',
  'tandoori-chicken-samosa-large': 'tandoori-chicken-samosa',
  'vegetable-samosa-large': 'vegatable-samosa',
  'meat-shami-kebab': 'meat-shami-kebabs',
};

export function migrateProductId(id: string): string {
  return Object.prototype.hasOwnProperty.call(LEGACY_PRODUCT_IDS, id) ? LEGACY_PRODUCT_IDS[id] : id;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Persisted cart `{ lines, promoApplied }`. Idempotent. Lines that collapse onto one id are summed (max 20). */
export function migrateCartState(persisted: unknown): unknown {
  if (!isRecord(persisted) || !Array.isArray(persisted.lines)) return persisted;
  const merged = new Map<string, number>();
  for (const l of persisted.lines as unknown[]) {
    if (!isRecord(l) || typeof l.productId !== 'string') continue;
    const id = migrateProductId(l.productId);
    const qty = typeof l.quantity === 'number' && Number.isFinite(l.quantity) ? l.quantity : 1;
    merged.set(id, Math.min(20, (merged.get(id) ?? 0) + qty));
  }
  // Contract limits: whole quantities 1..20, at most 30 lines (the server rejects anything else).
  const lines: CartLine[] = [...merged]
    .map(([productId, quantity]) => ({ productId, quantity: Math.min(20, Math.max(1, Math.floor(quantity))) }))
    .slice(0, 30);
  return { ...persisted, lines };
}

/** Persisted favourites `{ ids }`. Idempotent, de-duplicated, order preserved. */
export function migrateFavoritesState(persisted: unknown): unknown {
  if (!isRecord(persisted) || !Array.isArray(persisted.ids)) return persisted;
  const ids: string[] = [];
  for (const id of persisted.ids as unknown[]) {
    if (typeof id !== 'string') continue;
    const next = migrateProductId(id);
    if (!ids.includes(next)) ids.push(next);
  }
  return { ...persisted, ids };
}

/** Persisted orders `{ orders: [{ lines: [{ productId }] }] }`. Idempotent; everything else untouched. */
export function migrateOrdersState(persisted: unknown): unknown {
  if (!isRecord(persisted) || !Array.isArray(persisted.orders)) return persisted;
  const orders = (persisted.orders as unknown[]).map((o) => {
    if (!isRecord(o) || !Array.isArray(o.lines)) return o;
    return {
      ...o,
      lines: (o.lines as unknown[]).map((l) =>
        isRecord(l) && typeof l.productId === 'string' ? { ...l, productId: migrateProductId(l.productId) } : l,
      ),
    };
  });
  return { ...persisted, orders };
}
