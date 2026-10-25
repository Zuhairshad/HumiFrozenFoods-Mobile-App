import type { OrderDraft } from '../../lib/api/types';
import type { PaymentIntentResult } from '../../lib/api/stripe-gateway';
import type { StoredOrder } from '../../store/orders';
import { formatAddress, linesFromApi, slotFromApi, totalsFromApi } from '../account/order-mapping';

/**
 * Local snapshot right after PaymentSheet reports success. `paymentStatus` is 'pending' (real) or
 * 'demo': NEVER 'paid'. Only GET /v1/orders/:id (webhook-driven) can say paid.
 */
export function buildOrderRecord(draft: OrderDraft, res: PaymentIntentResult, now: Date = new Date()): StoredOrder {
  return {
    id: res.orderNumber,
    placedAt: now.toISOString(),
    lines: linesFromApi(res.lines),
    ...totalsFromApi(res.pricing),
    status: 'placed',
    address: formatAddress(draft.address),
    contact: draft.contact,
    slot: slotFromApi(draft.slot),
    paymentStatus: res.demo ? 'demo' : 'pending',
    remoteId: res.orderId,
    remoteStatus: res.demo ? undefined : 'pending_payment',
  };
}
