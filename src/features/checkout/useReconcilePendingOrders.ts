import { useEffect } from 'react';
import { getHttpClient, isDemoMode } from '@/lib/api/http';
import { fetchOrder } from '@/lib/api/orders-client';
import { patchFromApi } from '@/features/account/order-mapping';
import { useCartStore } from '@/store/cart';
import { useOrdersStore } from '@/store/orders';
import { cartMatchesOrder } from './cart-match';
import { reconcilePendingOrders } from './reconcile';

/** Run once after launch, when the orders store and the secure tokens are loaded. */
export function useReconcilePendingOrders(): void {
  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;
    const run = async () => {
      const store = useOrdersStore;
      if (!store.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const off = store.persist.onFinishHydration(() => {
            off();
            resolve();
          });
          if (store.persist.hasHydrated()) resolve();
        });
      }
      await store.getState().hydrateTokens().catch(() => undefined);
      if (cancelled || store.getState().pending.length === 0) return;
      await reconcilePendingOrders({
        getPending: () => store.getState().pending,
        getToken: (id) => store.getState().getToken(id),
        fetchOrder: (id, token) => fetchOrder(getHttpClient(), id, token),
        promote: (o, remote) => {
          store.getState().confirmOrder(o, undefined, patchFromApi(remote, o));
          // Paid while the app was closed: do not leave the same basket behind to be bought twice.
          const cart = useCartStore.getState();
          if (cartMatchesOrder(cart.lines, o.lines)) cart.clear();
        },
        discard: (o) => store.getState().discardPending(o.id, { removeToken: true }),
        refresh: (o, remote) => store.getState().patchOrder(o.id, patchFromApi(remote, o)),
      });
    };
    run().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
}
