import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Order } from '@/types';

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
 * Order as stored on device. Extends the v1 `Order` conservatively: every new
 * field is optional so v1 persisted orders keep loading. `id` is the human
 * order number (HUMI-48213); `remoteId` + `guestToken` address the server.
 */
export interface StoredOrder extends Order {
  contact?: OrderContact;
  slot?: OrderSlot;
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded' | 'demo';
  remoteId?: string;
  guestToken?: string;
}

interface OrdersState {
  orders: StoredOrder[];
  addOrder: (o: StoredOrder) => void;
  /** Shallow-merge into an existing order (used when the server refreshes it). */
  patchOrder: (id: string, patch: Partial<StoredOrder>) => void;
  getOrder: (id: string) => StoredOrder | undefined;
  clear: () => void;
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      addOrder: (o) => set((s) => ({ orders: [o, ...s.orders.filter((x) => x.id !== o.id)] })),
      patchOrder: (id, patch) =>
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      getOrder: (id) => {
        const needle = id.trim().toUpperCase();
        return get().orders.find((o) => o.id.toUpperCase() === needle);
      },
      clear: () => set({ orders: [] }),
    }),
    {
      name: 'humi-orders',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ orders: s.orders }),
    },
  ),
);
