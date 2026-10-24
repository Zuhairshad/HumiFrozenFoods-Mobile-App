import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { setAppearanceOverride } from '@/theme/appearance';

export type Appearance = 'system' | 'light' | 'dark';

export const MAX_RECENT_SEARCHES = 8;

/**
 * Pushes the chosen appearance to the theme layer (src/theme/appearance.ts).
 * Guarded so a theme failure can never break the persisted store.
 */
function pushAppearance(appearance: Appearance) {
  try {
    setAppearanceOverride(appearance);
  } catch {
    /* theme override is best-effort */
  }
}

function isAppearance(value: unknown): value is Appearance {
  return value === 'system' || value === 'light' || value === 'dark';
}

interface SettingsState {
  appearance: Appearance;
  recentSearches: string[];
  setAppearance: (appearance: Appearance) => void;
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      appearance: 'system',
      recentSearches: [],
      setAppearance: (appearance) => {
        set({ appearance });
        pushAppearance(appearance);
      },
      addRecentSearch: (query) => {
        const q = query.trim();
        if (!q) return;
        set((s) => ({
          recentSearches: [
            q,
            ...s.recentSearches.filter((r) => r.toLowerCase() !== q.toLowerCase()),
          ].slice(0, MAX_RECENT_SEARCHES),
        }));
      },
      removeRecentSearch: (query) =>
        set((s) => ({ recentSearches: s.recentSearches.filter((r) => r !== query) })),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'humi-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ appearance: s.appearance, recentSearches: s.recentSearches }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<SettingsState, 'appearance' | 'recentSearches'>>;
        return {
          ...current,
          appearance: isAppearance(p.appearance) ? p.appearance : current.appearance,
          recentSearches: Array.isArray(p.recentSearches)
            ? p.recentSearches.filter((r): r is string => typeof r === 'string').slice(0, MAX_RECENT_SEARCHES)
            : current.recentSearches,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) pushAppearance(state.appearance);
      },
    },
  ),
);
