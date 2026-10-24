/**
 * Appearance override bridge (owned by the theme layer).
 *
 * `useTheme()` must honour the user's Appearance choice (System / Light / Dark) that lives in
 * `useSettingsStore` (src/store/settings.ts, created by the Shell agent). To avoid a dependency
 * cycle (store -> theme -> store) the theme never imports the store. Instead the store pushes
 * its value into this tiny external store:
 *
 *   import { setAppearanceOverride } from '@/theme/appearance';
 *   // on hydrate AND whenever `appearance` changes:
 *   setAppearanceOverride(state.appearance);          // 'system' | 'light' | 'dark'
 *
 * Typical wiring in settings.ts: call it inside `onRehydrateStorage` and inside the
 * `setAppearance` action (or `useSettingsStore.subscribe((s) => setAppearanceOverride(s.appearance))`).
 * `useTheme()` subscribes with `useSyncExternalStore`, so scheme changes apply live.
 */
import { useSyncExternalStore } from 'react';

export type AppearanceSetting = 'system' | 'light' | 'dark';

let current: AppearanceSetting = 'system';
const listeners = new Set<() => void>();

export function getAppearanceOverride(): AppearanceSetting {
  return current;
}

export function setAppearanceOverride(next: AppearanceSetting): void {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppearanceOverride(): AppearanceSetting {
  return useSyncExternalStore(subscribe, getAppearanceOverride, getAppearanceOverride);
}
