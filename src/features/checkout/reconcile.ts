import { isAppApiError } from '../../lib/api/errors';
import type { Order } from '../../lib/api/types';
import { PENDING_ORDER_MAX_AGE_MS, type StoredOrder } from '../../store/orders';

export type ReconcileAction = 'promoted' | 'discarded' | 'kept' | 'skipped';

export interface ReconcileDeps {
  getPending: () => StoredOrder[];
  getToken: (remoteId: string | undefined) => string | undefined;
  fetchOrder: (remoteId: string, token: string) => Promise<Order>;
  /** The server says paid (or refunded): move to `orders`, patched with what the server said. */
  promote: (order: StoredOrder, remote: Order) => void;
  /** Never paid (cancelled / failed / too old): drop it and its token. */
  discard: (order: StoredOrder) => void;
  /** Still pending and < 24 h: refresh the stored snapshot. */
  refresh?: (order: StoredOrder, remote: Order) => void;
  now?: () => number;
}

/**
 * App-start reconciliation (R2). For every locally stored `pending_payment` order, fetch its status ONCE:
 *   paid/refunded           -> promote to the orders list
 *   cancelled / failed      -> purge
 *   still pending, < 24 h   -> keep (shown as "Awaiting payment")
 *   still pending, >= 24 h  -> purge (the server expires these anyway)
 * A network error keeps the order (nothing is claimed either way); an order that can no longer be
 * authenticated (no token / 401 / 403) is purged only once it is older than 24 h.
 */
export async function reconcilePendingOrders(deps: ReconcileDeps): Promise<Record<string, ReconcileAction>> {
  const now = (deps.now ?? Date.now)();
  const out: Record<string, ReconcileAction> = {};
  await Promise.all(
    deps.getPending().map(async (o) => {
      const old = !Number.isFinite(new Date(o.placedAt).getTime()) || now - new Date(o.placedAt).getTime() >= PENDING_ORDER_MAX_AGE_MS;
      const token = deps.getToken(o.remoteId);
      if (!o.remoteId || !token) {
        if (old) {
          deps.discard(o);
          out[o.id] = 'discarded';
        } else out[o.id] = 'skipped';
        return;
      }
      try {
        const remote = await deps.fetchOrder(o.remoteId, token);
        if (remote.paymentStatus === 'paid' || remote.paymentStatus === 'refunded') {
          deps.promote(o, remote);
          out[o.id] = 'promoted';
        } else if (remote.status === 'cancelled' || remote.paymentStatus === 'failed' || old) {
          deps.discard(o);
          out[o.id] = 'discarded';
        } else {
          deps.refresh?.(o, remote);
          out[o.id] = 'kept';
        }
      } catch (e) {
        if (isAppApiError(e) && (e.status === 401 || e.status === 403) && old) {
          deps.discard(o);
          out[o.id] = 'discarded';
        } else out[o.id] = 'skipped';
      }
    }),
  );
  return out;
}
