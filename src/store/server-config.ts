import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { fetchConfig } from '../lib/api/config-client';
import { getHttpClient, isDemoMode } from '../lib/api/http';
import type { ConfigResponse } from '../lib/api/types';

/**
 * FALLBACK_CONFIG equals the API defaults (docs/api-contract.md section 5). It is used ONLY for
 * estimates before the first successful GET /v1/config; the server stays the price authority.
 * Promo and payments are treated as disabled until the server says otherwise.
 */
export const FALLBACK_CONFIG: ConfigResponse = {
  currency: 'gbp',
  delivery: { feePence: 799, freeThresholdPence: 5000, minOrderPence: 0 },
  promo: { enabled: false },
  payments: { provider: 'stripe', enabled: true },
  lowStockThreshold: 5,
  slotWindows: [],
};

export const CONFIG_REFRESH_MS = 60 * 60 * 1000;

export type ConfigSource = 'fallback' | 'cached' | 'live';

interface ServerConfigState {
  /** Last known server value (persisted). null until the first successful fetch ever. */
  config: ConfigResponse | null;
  fetchedAt: number | null;
  /** 'live' = fetched during this app run. */
  source: ConfigSource;
  loading: boolean;
  refresh: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useServerConfigStore = create<ServerConfigState>()(
  persist(
    (set, get) => ({
      config: null,
      fetchedAt: null,
      source: 'fallback',
      loading: false,
      refresh: () => {
        if (isDemoMode) return Promise.resolve();
        inFlight ??= (async () => {
          set({ loading: true });
          try {
            const config = await fetchConfig(getHttpClient());
            set({ config, fetchedAt: Date.now(), source: 'live' });
          } catch {
            // Keep the last known value; try again on the next tick/mount.
            if (get().config && get().source === 'fallback') set({ source: 'cached' });
          } finally {
            set({ loading: false });
            inFlight = null;
          }
        })();
        return inFlight;
      },
    }),
    {
      name: 'humi-server-config',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ config: s.config, fetchedAt: s.fetchedAt }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ServerConfigState> | undefined;
        return { ...current, ...(p?.config ? { config: p.config, fetchedAt: p.fetchedAt ?? null, source: 'cached' as const } : null) };
      },
    },
  ),
);

/** The value to compute with: last known server config, else FALLBACK_CONFIG. */
export function useServerConfig(): { config: ConfigResponse; source: ConfigSource } {
  const config = useServerConfigStore((s) => s.config);
  const source = useServerConfigStore((s) => s.source);
  return { config: config ?? FALLBACK_CONFIG, source: config ? source : 'fallback' };
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Fetch now and then hourly. Idempotent: call from app start and/or any screen that needs config. */
export function startConfigSync(): void {
  if (isDemoMode) return;
  const { refresh, fetchedAt } = useServerConfigStore.getState();
  if (!fetchedAt || Date.now() - fetchedAt > CONFIG_REFRESH_MS || useServerConfigStore.getState().source !== 'live') void refresh();
  timer ??= setInterval(() => void useServerConfigStore.getState().refresh(), CONFIG_REFRESH_MS);
}

export function useConfigSync(): void {
  useEffect(() => {
    startConfigSync();
  }, []);
}
