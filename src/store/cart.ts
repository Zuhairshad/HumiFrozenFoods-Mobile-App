import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CartLine } from '@/types';
import { migrateCartState } from '@/data/id-migration';

export const MIN_QTY = 1;
export const MAX_QTY = 20;

const clamp = (n: number) => Math.min(MAX_QTY, Math.max(MIN_QTY, Math.floor(n)));

interface CartState {
  lines: CartLine[];
  promoApplied: boolean;
  add: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  applyPromo: (code: string) => boolean;
  removePromo: () => void;
}

type CartPersisted = { lines: CartLine[]; promoApplied: boolean };

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      promoApplied: false,
      add: (productId, qty = 1) => {
        if (!Number.isFinite(qty) || qty <= 0) return;
        set((s) => {
          const existing = s.lines.find((l) => l.productId === productId);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.productId === productId ? { ...l, quantity: clamp(l.quantity + qty) } : l,
              ),
            };
          }
          return { lines: [...s.lines, { productId, quantity: clamp(qty) }] };
        });
      },
      setQty: (productId, qty) =>
        set((s) => {
          if (!Number.isFinite(qty) || qty <= 0) {
            return { lines: s.lines.filter((l) => l.productId !== productId) };
          }
          return {
            lines: s.lines.map((l) => (l.productId === productId ? { ...l, quantity: clamp(qty) } : l)),
          };
        }),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [], promoApplied: false }),
      // Deprecated: the client cannot validate promos. The promo code lives in store/promo.ts and the
      // server's quote decides. Kept (always false) so `useCart` still type-checks.
      applyPromo: () => false,
      removePromo: () => set({ promoApplied: false }),
    }),
    {
      name: 'humi-cart',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ lines: s.lines, promoApplied: s.promoApplied }),
      // v1: product ids were renamed to the live API slugs (src/data/id-migration.ts). Idempotent.
      version: 1,
      migrate: (persisted) => migrateCartState(persisted) as CartPersisted,
    },
  ),
);
