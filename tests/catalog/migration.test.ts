import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_PRODUCT_IDS,
  migrateCartState,
  migrateFavoritesState,
  migrateOrdersState,
  migrateProductId,
} from '@/data/id-migration';
import { bundledProducts } from '@/data/products';
import { heroSlides } from '@/data/hero';

const OLD = Object.keys(LEGACY_PRODUCT_IDS);

describe('id mapping', () => {
  it('maps exactly the five renamed slugs and leaves others alone', () => {
    expect(OLD).toHaveLength(5);
    expect(migrateProductId('meat-shami-kebab')).toBe('meat-shami-kebabs');
    expect(migrateProductId('vegetable-samosa-large')).toBe('vegatable-samosa');
    expect(migrateProductId('aloo-tikki')).toBe('aloo-tikki');
    expect(migrateProductId('constructor')).toBe('constructor');
    expect(migrateProductId('__proto__')).toBe('__proto__');
    expect(migrateProductId('')).toBe('');
  });

  it('no bundled product or hero slide still uses an old id; every target exists', () => {
    const ids = new Set(bundledProducts.map((p) => p.id));
    for (const old of OLD) expect(ids.has(old)).toBe(false);
    for (const target of Object.values(LEGACY_PRODUCT_IDS)) expect(ids.has(target)).toBe(true);
    for (const s of heroSlides) expect(ids.has(s.productId)).toBe(true);
  });
});

describe('migrateCartState', () => {
  it('renames lines, keeps quantities and other keys, is idempotent', () => {
    const input = {
      lines: [
        { productId: 'meat-peshawari-chapli-kebab', quantity: 2 },
        { productId: 'aloo-tikki', quantity: 1 },
      ],
      promoApplied: true,
    };
    const out = migrateCartState(input);
    expect(out).toEqual({
      lines: [
        { productId: 'meat-chapli-kebab', quantity: 2 },
        { productId: 'aloo-tikki', quantity: 1 },
      ],
      promoApplied: true,
    });
    expect(migrateCartState(out)).toEqual(out);
  });

  it('merges lines that collapse onto the same id (capped at 20) and skips junk lines', () => {
    const out = migrateCartState({
      lines: [
        { productId: 'meat-shami-kebab', quantity: 15 },
        { productId: 'meat-shami-kebabs', quantity: 10 },
        { productId: 5, quantity: 1 },
        null,
        { productId: 'aloo-tikki', quantity: 'x' },
      ],
    }) as { lines: { productId: string; quantity: number }[] };
    expect(out.lines).toEqual([
      { productId: 'meat-shami-kebabs', quantity: 20 },
      { productId: 'aloo-tikki', quantity: 1 },
    ]);
  });

  it.each([null, undefined, 'x', 5, {}, { lines: 'no' }])('passes through unusable state %j', (v) => {
    expect(migrateCartState(v)).toEqual(v);
  });
});

describe('migrateFavoritesState', () => {
  it('renames, de-duplicates, preserves order', () => {
    const out = migrateFavoritesState({
      ids: ['vegetable-samosa-large', 'aloo-tikki', 'vegatable-samosa', 7, 'tandoori-chicken-samosa-large'],
    });
    expect(out).toEqual({ ids: ['vegatable-samosa', 'aloo-tikki', 'tandoori-chicken-samosa'] });
    expect(migrateFavoritesState(out)).toEqual(out);
  });
  it.each([null, {}, { ids: 'x' }, 3])('passes through unusable state %j', (v) => {
    expect(migrateFavoritesState(v)).toEqual(v);
  });
});

describe('migrateOrdersState', () => {
  it('renames order line product ids and touches nothing else', () => {
    const order = {
      id: 'HUMI-1',
      total: 12.5,
      lines: [
        { productId: 'chicken-peshawari-chapli-kebab', name: 'X', price: 14, quantity: 1, image: 'u' },
        { productId: 'aloo-tikki', name: 'Y', price: 7.3, quantity: 2, image: 'v' },
      ],
    };
    const out = migrateOrdersState({ orders: [order, { id: 'no-lines' }, null] }) as { orders: unknown[] };
    expect(out.orders[0]).toEqual({
      ...order,
      lines: [{ ...order.lines[0], productId: 'chicken-chapli-kebab' }, order.lines[1]],
    });
    expect(out.orders[1]).toEqual({ id: 'no-lines' });
    expect(out.orders[2]).toBeNull();
    expect(migrateOrdersState(out)).toEqual(out);
  });
  it('keeps junk lines', () => {
    const out = migrateOrdersState({ orders: [{ lines: [null, { productId: 5 }] }] });
    expect(out).toEqual({ orders: [{ lines: [null, { productId: 5 }] }] });
  });
  it.each([null, {}, { orders: 'x' }])('passes through unusable state %j', (v) => {
    expect(migrateOrdersState(v)).toEqual(v);
  });
});

describe('persisted stores run the migration on rehydrate (version 0 -> 1)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('cart store', async () => {
    const storage = (await import('@react-native-async-storage/async-storage')).default;
    await storage.setItem(
      'humi-cart',
      JSON.stringify({ state: { lines: [{ productId: 'meat-shami-kebab', quantity: 3 }], promoApplied: false }, version: 0 }),
    );
    const { useCartStore } = await import('@/store/cart');
    await useCartStore.persist.rehydrate();
    expect(useCartStore.getState().lines).toEqual([{ productId: 'meat-shami-kebabs', quantity: 3 }]);
  });

  it('favourites store', async () => {
    const storage = (await import('@react-native-async-storage/async-storage')).default;
    await storage.setItem('humi-favorites', JSON.stringify({ state: { ids: ['vegetable-samosa-large'] }, version: 0 }));
    const { useFavoritesStore } = await import('@/store/favorites');
    await useFavoritesStore.persist.rehydrate();
    expect(useFavoritesStore.getState().ids).toEqual(['vegatable-samosa']);
  });
});
