import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { migrateFavoritesState } from '@/data/id-migration';

interface FavoritesState {
  ids: string[];
  toggle: (id: string) => void;
  has: (id: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({ ids: s.ids.includes(id) ? s.ids.filter((i) => i !== id) : [id, ...s.ids] })),
      has: (id) => get().ids.includes(id),
    }),
    {
      name: 'humi-favorites',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ ids: s.ids }),
      // v1: product ids were renamed to the live API slugs (src/data/id-migration.ts). Idempotent.
      version: 1,
      migrate: (persisted) => migrateFavoritesState(persisted) as { ids: string[] },
    },
  ),
);
