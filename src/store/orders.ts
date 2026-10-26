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

/** Pending (never-paid-yet) snapshots older than this are hidden and purged. */
export const PENDING_ORDER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface OrdersState {
  orders: StoredOrder[];
  /**
   * Orders saved BEFORE the PaymentSheet opens (status `pending_payment`). They are kept apart from
   * `orders` so every list, count and badge only ever sees orders that were actually paid or
   * confirmed. A pending entry moves to `orders` when the sheet succeeds or the server says paid, and is
   * discarded when the server reports it cancelled/failed or it is older than 24 h.
   */
  pending: StoredOrder[];
  /** orderId (remoteId) -> guest token. In-memory mirror of OrderTokenStorage. */
  tokens: Record<string, string>;
  addOrder: (o: StoredOrder, guestToken?: string) => void;
  /** Persist an order (+ token) as `pending_payment` before the sheet opens. Keeps the original `placedAt` on re-save. */
  savePending: (o: StoredOrder, guestToken: string) => void;
  /** Move a pending order into `orders` (sheet success, or the server said paid). `patch` comes from the server. */
  confirmOrder: (o: StoredOrder, guestToken?: string, patch?: Partial<StoredOrder>) => void;
  /** Drop a pending order (explicit cancel/decline, or the server reports it cancelled/failed). */
  discardPending: (id: string, opts?: { removeToken?: boolean }) => void;
  /** Pending orders that are still < 24 h old (the only ones the UI may show). */
  getVisiblePending: (now?: number) => StoredOrder[];
  /** Shallow-merge into an existing order (by order number). A pending order the server now reports paid moves to `orders`. */
  patchOrder: (id: string, patch: Partial<StoredOrder>) => void;
  getOrder: (id: string) => StoredOrder | undefined;
  getToken: (remoteId: string | undefined) => string | undefined;
  hydrateTokens: () => Promise<void>;
  clear: () => void;
}

/** Best effort: if the keychain write fails the in-memory token still serves this session. */
function persistToken(remoteId: string, token: string): void {
  getOrderTokenStorage()
    .set(remoteId, token)
    .catch(() => undefined);
}

export function isPendingFresh(o: StoredOrder, now: number = Date.now()): boolean {
  const t = new Date(o.placedAt).getTime();
  return Number.isFinite(t) && now - t < PENDING_ORDER_MAX_AGE_MS;
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      pending: [],
      tokens: {},
      addOrder: (o, guestToken) => {
        if (guestToken && o.remoteId) {
          const remoteId = o.remoteId;
          set((s) => ({ tokens: { ...s.tokens, [remoteId]: guestToken } }));
          persistToken(remoteId, guestToken);
        }
        set((s) => ({ orders: [o, ...s.orders.filter((x) => x.id !== o.id)] }));
      },
      savePending: (o, guestToken) => {
        const remoteId = o.remoteId;
        if (remoteId) {
          set((s) => ({ tokens: { ...s.tokens, [remoteId]: guestToken } }));
          persistToken(remoteId, guestToken);
        }
        set((s) => {
          const prev = s.pending.find((x) => x.id === o.id);
          const next: StoredOrder = { ...o, paymentStatus: 'pending', remoteStatus: 'pending_payment', placedAt: prev?.placedAt ?? o.placedAt };
          return { pending: [next, ...s.pending.filter((x) => x.id !== o.id)] };
        });
      },
      confirmOrder: (o, guestToken, patch) => {
        const base = get().pending.find((x) => x.id === o.id) ?? o;
        const merged: StoredOrder = { ...base, ...o, placedAt: base.placedAt, ...patch };
        set((s) => ({ pending: s.pending.filter((x) => x.id !== o.id) }));
        get().addOrder(merged, guestToken);
      },
      discardPending: (id, opts) => {
        const gone = get().pending.find((x) => x.id === id);
        set((s) => ({ pending: s.pending.filter((x) => x.id !== id) }));
        if (opts?.removeToken && gone?.remoteId) {
          const remoteId = gone.remoteId;
          set((s) => {
            const { [remoteId]: _removed, ...rest } = s.tokens;
            return { tokens: rest };
          });
          getOrderTokenStorage()
            .remove(remoteId)
            .catch(() => undefined);
        }
      },
      getVisiblePending: (now = Date.now()) => get().pending.filter((o) => isPendingFresh(o, now)),
      patchOrder: (id, patch) => {
        const inPending = get().pending.find((o) => o.id === id);
        if (inPending) {
          if (patch.paymentStatus === 'paid' || patch.paymentStatus === 'refunded') {
            get().confirmOrder(inPending, undefined, patch);
          } else {
            set((s) => ({ pending: s.pending.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
          }
          return;
        }
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
      },
      getOrder: (id) => {
        const needle = id.trim().toUpperCase();
        const match = (o: StoredOrder) => o.id.toUpperCase() === needle;
        return get().orders.find(match) ?? get().pending.find(match);
      },
      getToken: (remoteId) => (remoteId ? get().tokens[remoteId] : undefined),
      hydrateTokens: async () => {
        const stored = await getOrderTokenStorage().getAll();
        set((s) => ({ tokens: { ...stored, ...s.tokens } }));
      },
      clear: () => {
        set({ orders: [], pending: [], tokens: {} });
        getOrderTokenStorage().clear().catch(() => undefined);
      },
    }),
    {
      name: 'humi-orders',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ orders: s.orders, pending: s.pending }),
      // v1: product ids were renamed to the live API slugs (src/data/id-migration.ts). Idempotent.
      version: 1,
      migrate: (persisted) => migrateOrdersState(persisted) as { orders: StoredOrder[]; pending?: StoredOrder[] },
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
