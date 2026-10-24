import { useEffect, useState, useSyncExternalStore } from 'react';
import { Image } from 'expo-image';
import { useFonts } from 'expo-font';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { getBestSellers, heroSlides } from '@/data';
import { useCartStore } from '@/store/cart';
import { useFavoritesStore } from '@/store/favorites';
import { useOrdersStore } from '@/store/orders';
import { useSettingsStore } from '@/store/settings';

type Persisted = {
  persist: {
    hasHydrated(): boolean;
    onFinishHydration(fn: () => void): () => void;
  };
};

function useHydrated(store: Persisted): boolean {
  return useSyncExternalStore(
    (onChange) => store.persist.onFinishHydration(onChange),
    () => store.persist.hasHydrated(),
    () => true,
  );
}

function featuredImage(): string | undefined {
  if (heroSlides.length === 0) return undefined;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return heroSlides[dayOfYear % heroSlides.length]?.image;
}

/** Prefetch the featured card image and the first shelf thumbnails; never rejects. */
async function prefetchImages(): Promise<void> {
  const urls: string[] = [];
  const hero = featuredImage();
  if (hero) urls.push(hero);
  for (const p of getBestSellers(6)) urls.push(p.image);
  await Promise.allSettled(urls.map((u) => Image.prefetch(u)));
}

/**
 * Splash readiness: Playfair loaded (or failed), persisted stores hydrated and
 * images prefetched. BrandSplash caps the wait at BRAND_SPLASH_MAX_MS regardless.
 */
export function useAppReady(): boolean {
  const [fontsLoaded, fontError] = useFonts({ PlayfairDisplay_700Bold });
  const cart = useHydrated(useCartStore);
  const favorites = useHydrated(useFavoritesStore);
  const orders = useHydrated(useOrdersStore);
  const settings = useHydrated(useSettingsStore);
  const [imagesDone, setImagesDone] = useState(false);

  useEffect(() => {
    let alive = true;
    prefetchImages()
      .catch(() => {})
      .finally(() => alive && setImagesDone(true));
    return () => {
      alive = false;
    };
  }, []);

  return (fontsLoaded || !!fontError) && cart && favorites && orders && settings && imagesDone;
}
