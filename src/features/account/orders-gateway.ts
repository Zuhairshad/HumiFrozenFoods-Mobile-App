import { useOrdersStore } from '@/store/orders';
import type { Order } from '@/types';
import { readOrderExtras } from './order-utils';

export interface OrderLookupRequest {
  /** Order number as printed on the confirmation, e.g. "HUMI-48213". */
  orderId: string;
  /** The email address or phone number used at checkout. */
  contact: string;
}

export type OrderLookupFailure = 'invalid' | 'not-found' | 'unavailable';

export type OrderLookupResult =
  | { ok: true; order: Order }
  | { ok: false; reason: OrderLookupFailure };

export interface OrdersGateway {
  /** Guest lookup. `not-found` covers both an unknown order and a contact mismatch (no enumeration). */
  lookup(request: OrderLookupRequest): Promise<OrderLookupResult>;
}

const digits = (v: string) => v.replace(/\D/g, '');

/** Compare phone numbers on their last 10 digits so "+44 7403..." matches "07403...". */
function samePhone(a: string, b: string): boolean {
  const da = digits(a);
  const db = digits(b);
  if (da.length < 9 || db.length < 9) return false;
  return da.slice(-10) === db.slice(-10);
}

export function contactMatches(order: Order, contact: string): boolean {
  const input = contact.trim();
  if (!input) return false;
  const { email, phone } = readOrderExtras(order);
  // Orders saved before contact details were recorded can only be matched by number.
  if (!email && !phone) return true;
  if (input.includes('@')) return !!email && email.toLowerCase() === input.toLowerCase();
  return !!phone && samePhone(phone, input);
}

/** Looks an order up in the orders saved on this device. */
export const localOrdersGateway: OrdersGateway = {
  async lookup({ orderId, contact }) {
    if (!orderId.trim() || !contact.trim()) return { ok: false, reason: 'invalid' };
    const order = useOrdersStore.getState().getOrder(orderId);
    if (!order || !contactMatches(order, contact)) return { ok: false, reason: 'not-found' };
    return { ok: true, order };
  },
};

let active: OrdersGateway = localOrdersGateway;

export function getOrdersGateway(): OrdersGateway {
  return active;
}

/** Swap in the HTTP implementation once the server lookup exists. */
export function setOrdersGateway(gateway: OrdersGateway): void {
  active = gateway;
}
