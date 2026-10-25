import { isAppApiError, type AppApiError } from '../../lib/api/errors';
import { getHttpClient, isDemoMode } from '../../lib/api/http';
import { fetchOrder } from '../../lib/api/orders-client';
import type { Order as ApiOrder } from '../../lib/api/types';
import { useOrdersStore, type StoredOrder } from '../../store/orders';
import { patchFromApi } from './order-mapping';

export type SyncResult =
  | { kind: 'updated'; order: ApiOrder }
  | { kind: 'skipped' } // demo order / demo mode / no token
  | { kind: 'offline' } // kept the stored snapshot
  | { kind: 'error'; error: AppApiError };

export const isLiveOrder = (o: StoredOrder | undefined): o is StoredOrder => !!o && !!o.remoteId && o.paymentStatus !== 'demo';

/** Fetch fresh status for one stored order (by order number) and merge it into the snapshot. */
export async function syncOrder(orderNumber: string, signal?: AbortSignal): Promise<SyncResult> {
  const store = useOrdersStore.getState();
  const local = store.getOrder(orderNumber);
  const token = store.getToken(local?.remoteId);
  if (isDemoMode || !isLiveOrder(local) || !token) return { kind: 'skipped' };
  try {
    const remote = await fetchOrder(getHttpClient(), local.remoteId as string, token, signal);
    useOrdersStore.getState().patchOrder(local.id, patchFromApi(remote, local));
    return { kind: 'updated', order: remote };
  } catch (e) {
    if (isAppApiError(e)) return e.isNetwork || e.isAborted ? { kind: 'offline' } : { kind: 'error', error: e };
    throw e;
  }
}

/** Refresh every non-final live order. Resolves when all are done. */
export async function syncAllOrders(): Promise<void> {
  const orders = useOrdersStore.getState().orders;
  await Promise.all(
    orders
      .filter((o) => isLiveOrder(o) && o.status !== 'delivered' && o.remoteStatus !== 'cancelled')
      .map((o) => syncOrder(o.id).catch(() => undefined)),
  );
}
