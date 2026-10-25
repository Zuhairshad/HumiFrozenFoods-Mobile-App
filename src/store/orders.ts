import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { OrderStatus as ApiOrderStatus, PaymentStatus } from '@/lib/api/types';
import type { Order } from '@/types';
import { migrateOrdersState } from '@/data/id-migration';
import { getOrderTokenStorage } from './order-token-storage';

export interface OrderContact {
  name: string;
  email: string;
  phone: string;
}

export interface OrderSlot {
  /** `YYYY-MM-DD` */
  date: string;
  window: 'morning' | 'afternoon' | 'evening';
  /** Pre-formatted, e.g. "Sat 25 Oct, 8am-12pm". */
  label: string;
}

/**
 * Order snapshot as stored on device (the "summary"). `id` is the human order number (the API's
 * `orderNumber`); `remoteId` is the API `orderId`. The guest token is NOT here: it lives behind
 * `OrderTokenStorage` (see order-token-storage.ts) and in the in-memory `tokens` map.
 */
export interface StoredOrder extends Order {
  contact?: OrderContact;
  slot?: OrderSlot;
  /** `demo` only for orders created by the offline mock. Never set to `paid` by the client. */
  paymentStatus?: PaymentStatus | 'demo';
  remoteId?: string;
  /** Raw API status (includes `pending_payment` / `cancelled`, which the v1 `status` cannot express). */
  remoteStatus?: ApiOrderStatus;
  /** When the snapshot was last refreshed from the API (ms). */
  syncedAt?: number;
}

interface OrdersState {
  orders: StoredOrder[];
  /** orderId (remoteId) -> guest token. In-memory mirror of OrderTokenStorage. */
  tokens: Record<string, string>;
  addOrder: (o: StoredOrder, guestToken?: string) => void;
  /** Shallow-merge into an existing order (by order number). */
  patchOrder: (id: string, patch: Partial<StoredOrder>) => void;
  getOrder: (id: string) => StoredOrder | undefined;
  getToken: (remoteId: string | undefined) => string | undefined;
  hydrateTokens: () => Promise<void>;
  clear: () => void;
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      tokens: {},
      addOrder: (o, guestToken) => {
        if (guestToken && o.remoteId) {
          const remoteId = o.remoteId;
          set((s) => ({ tokens: { ...s.tokens, [remoteId]: guestToken } }));
          // Best effort: if the keychain write fails the in-memory token still serves this session
          // and the order can be recovered with a lookup (order number + contact).
          getOrderTokenStorage()
            .set(remoteId, guestToken)
            .catch(() => undefined);
        }
        set((s) => ({ orders: [o, ...s.orders.filter((x) => x.id !== o.id)] }));
      },
      patchOrder: (id, patch) =>
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      getOrder: (id) => {
        const needle = id.trim().toUpperCase();
        return get().orders.find((o) => o.id.toUpperCase() === needle);
      },
      getToken: (remoteId) => (remoteId ? get().tokens[remoteId] : undefined),
      hydrateTokens: async () => {
        const stored = await getOrderTokenStorage().getAll();
        set((s) => ({ tokens: { ...stored, ...s.tokens } }));
      },
      clear: () => {
        set({ orders: [], tokens: {} });
        getOrderTokenStorage().clear().catch(() => undefined);
      },
    }),
    {
      name: 'humi-orders',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ orders: s.orders }),
      // v1: product ids were renamed to the live API slugs (src/data/id-migration.ts). Idempotent.
      version: 1,
      migrate: (persisted) => migrateOrdersState(persisted) as { orders: StoredOrder[] },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Move any legacy inline tokens out of the snapshot, then load tokens from their storage.
        const legacy = state.orders.filter((o) => (o as { guestToken?: string }).guestToken && o.remoteId);
        for (const o of legacy) {
          const t = (o as { guestToken?: string }).guestToken as string;
          if (t !== 'demo-guest-token') getOrderTokenStorage().set(o.remoteId as string, t).catch(() => undefined);
        }
        void state.hydrateTokens();
      },
    },
  ),
);
