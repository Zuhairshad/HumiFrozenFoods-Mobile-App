import { isAppApiError } from '../../lib/api/errors';
import { API_BASE_URL, getHttpClient } from '../../lib/api/http';
import { fetchOrder, lookupOrder } from '../../lib/api/orders-client';
import { useOrdersStore } from '../../store/orders';
import type { Order } from '../../types';
import { orderFromApi } from './order-mapping';
import { readOrderExtras } from './order-utils';

export interface OrderLookupRequest {
  /** Order number as printed on the confirmation, e.g. "HUMI-48213". */
  orderId: string;
  /** The email address or phone number used at checkout. */
  contact: string;
}

export type OrderLookupFailure = 'invalid' | 'not-found' | 'unavailable' | 'offline' | 'rate-limited';

export type OrderLookupResult =
  | { ok: true; order: Order }
  | { ok: false; reason: OrderLookupFailure; retryAfter?: number };

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

/** POST /v1/orders/lookup, then GET the order with the returned guest token and save it on device. */
export const httpOrdersGateway: OrdersGateway = {
  async lookup({ orderId, contact }) {
    const number = orderId.trim();
    const input = contact.trim();
    if (!number || !input) return { ok: false, reason: 'invalid' };
    try {
      const client = getHttpClient();
      const found = await lookupOrder(client, { orderNumber: number, ...(input.includes('@') ? { email: input } : { phone: input }) });
      const remote = await fetchOrder(client, found.orderId, found.guestToken);
      const store = useOrdersStore.getState();
      const stored = orderFromApi(remote, store.getOrder(remote.orderNumber));
      store.addOrder(stored, found.guestToken);
      return { ok: true, order: stored };
    } catch (e) {
      if (!isAppApiError(e)) return { ok: false, reason: 'unavailable' };
      if (e.status === 404) return { ok: false, reason: 'not-found' };
      if (e.isRateLimited) return { ok: false, reason: 'rate-limited', retryAfter: e.retryAfter };
      if (e.isNetwork) return { ok: false, reason: 'offline' };
      if (e.status === 400) return { ok: false, reason: 'invalid' };
      return { ok: false, reason: 'unavailable' };
    }
  },
};

let active: OrdersGateway = API_BASE_URL ? httpOrdersGateway : localOrdersGateway;

export function getOrdersGateway(): OrdersGateway {
  return active;
}

/** Swap the gateway (tests). Defaults to HTTP when EXPO_PUBLIC_API_BASE_URL is set, else device-local. */
export function setOrdersGateway(gateway: OrdersGateway): void {
  active = gateway;
}
