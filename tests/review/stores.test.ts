import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateCartState } from '../../src/data/id-migration';
import { MAX_LINES, useCartStore } from '../../src/store/cart';
import { useOrdersStore } from '../../src/store/orders';
import { setOrderTokenStorage } from '../../src/store/order-token-storage';

vi.mock('expo-secure-store', () => ({
  isAvailableAsync: async () => false,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

describe('cart limits (contract: 1-20 per product, at most 30 lines)', () => {
  beforeEach(() => useCartStore.getState().clear());

  it('refuses a 31st distinct line instead of building a basket the server will reject', () => {
    const { add } = useCartStore.getState();
    for (let i = 0; i < MAX_LINES + 5; i++) add(`p${i}`);
    expect(useCartStore.getState().lines).toHaveLength(MAX_LINES);
    add('p0', 3); // existing lines can still grow
    expect(useCartStore.getState().lines.find((l) => l.productId === 'p0')?.quantity).toBe(4);
  });

  it('migration clamps corrupt persisted quantities into 1..20 integers and caps lines', () => {
    const lines = [
      { productId: 'a', quantity: 0 },
      { productId: 'b', quantity: -4 },
      { productId: 'c', quantity: 2.7 },
      { productId: 'd', quantity: 99 },
      ...Array.from({ length: 40 }, (_, i) => ({ productId: `x${i}`, quantity: 1 })),
    ];
    const out = migrateCartState({ lines, promoApplied: false }) as { lines: { productId: string; quantity: number }[] };
    expect(out.lines.length).toBeLessThanOrEqual(30);
    for (const l of out.lines) {
      expect(Number.isInteger(l.quantity)).toBe(true);
      expect(l.quantity).toBeGreaterThanOrEqual(1);
      expect(l.quantity).toBeLessThanOrEqual(20);
    }
  });
});

describe('orders store token persistence', () => {
  it('a failing secure-store write is swallowed (no unhandled rejection) and the in-memory token still works', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    setOrderTokenStorage({
      getAll: async () => ({}),
      set: async () => {
        throw new Error('keychain unavailable');
      },
      remove: async () => {},
      clear: async () => {},
    });
    useOrdersStore.getState().addOrder(
      { id: 'N1', placedAt: new Date().toISOString(), lines: [], subtotal: 0, delivery: 0, discount: 0, total: 0, status: 'placed', address: '', remoteId: 'o1' } as never,
      'tok',
    );
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(useOrdersStore.getState().getToken('o1')).toBe('tok');
  });
});
