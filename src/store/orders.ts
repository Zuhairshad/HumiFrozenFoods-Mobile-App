import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Order } from '@/types';

interface OrdersState {
  orders: Order[];
  addOrder: (o: Order) => void;
  getOrder: (id: string) => Order | undefined;
  clear: () => void;
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      addOrder: (o) => set((s) => ({ orders: [o, ...s.orders.filter((x) => x.id !== o.id)] })),
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
