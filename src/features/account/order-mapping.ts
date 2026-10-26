import type { Address, Order as ApiOrder, PricedLine, Pricing, Slot, OrderStatus as ApiStatus } from '../../lib/api/types';
import type { StoredOrder } from '../../store/orders';
import type { OrderStatus } from '../../types';
import { formatSlotLabel } from '../checkout/slots';
import { toDisplayName } from '@/data/merge';

const pounds = (p: number) => Math.round(p) / 100;

export const formatAddress = (a: Address): string => [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(', ');

/** API status -> the 4-step v1 status. `pending_payment` / `cancelled` are kept in `remoteStatus`. */
export function toLocalStatus(s: ApiStatus, fallback: OrderStatus = 'placed'): OrderStatus {
  switch (s) {
    case 'pending_payment':
    case 'placed':
      return 'placed';
    case 'preparing':
    case 'out-for-delivery':
    case 'delivered':
      return s;
    case 'cancelled':
      return fallback;
  }
}

export function linesFromApi(lines: PricedLine[]): StoredOrder['lines'] {
  return lines.map((l) => ({ productId: l.productId, name: toDisplayName(l.name), price: pounds(l.unitPricePence), quantity: l.quantity, image: l.image ?? '' }));
}

export function totalsFromApi(p: Pricing) {
  return { subtotal: pounds(p.subtotalPence), delivery: pounds(p.deliveryPence), discount: pounds(p.discountPence), total: pounds(p.totalPence) };
}

export const slotFromApi = (s: Slot): NonNullable<StoredOrder['slot']> => ({ ...s, label: formatSlotLabel(s.date, s.window) });

/** Full snapshot from a server order (lookup, or first sight of an order). */
export function orderFromApi(o: ApiOrder, prev?: StoredOrder, now: number = Date.now()): StoredOrder {
  return {
    id: o.orderNumber,
    placedAt: o.placedAt,
    lines: linesFromApi(o.lines),
    ...totalsFromApi(o.pricing),
    status: toLocalStatus(o.status, prev?.status),
    address: formatAddress(o.address),
    contact: o.contact,
    slot: slotFromApi(o.slot),
    paymentStatus: o.paymentStatus,
    remoteId: o.orderId,
    remoteStatus: o.status,
    syncedAt: now,
  };
}

/** Patch for an existing snapshot: server wins for status, payment and money; keeps the rest. */
export function patchFromApi(o: ApiOrder, prev: StoredOrder, now: number = Date.now()): Partial<StoredOrder> {
  return {
    status: toLocalStatus(o.status, prev.status),
    remoteStatus: o.status,
    paymentStatus: o.paymentStatus,
    ...totalsFromApi(o.pricing),
    contact: o.contact,
    syncedAt: now,
  };
}
