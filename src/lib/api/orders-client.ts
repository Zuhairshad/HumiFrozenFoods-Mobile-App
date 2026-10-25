import { AppApiError } from './errors';
import type { HttpClient } from './http';
import type { Order, OrderLookupRequest, OrderLookupResponse } from './types';

/** GET /v1/orders/:id with the guest token. */
export async function fetchOrder(client: HttpClient, orderId: string, guestToken: string, signal?: AbortSignal): Promise<Order> {
  if (!guestToken) throw new AppApiError({ status: 401, code: 'unauthorized', message: 'Missing order access token.' });
  return client.request<Order>({
    method: 'GET',
    path: `/v1/orders/${encodeURIComponent(orderId)}`,
    bearer: guestToken,
    signal,
    timeoutMs: 10000,
  });
}

/** POST /v1/orders/lookup. 404 means "no such order OR contact mismatch" (never distinguished). */
export async function lookupOrder(client: HttpClient, req: OrderLookupRequest, signal?: AbortSignal): Promise<OrderLookupResponse> {
  const res = await client.request<OrderLookupResponse>({ method: 'POST', path: '/v1/orders/lookup', body: req, signal, timeoutMs: 10000 });
  if (!res?.orderId || !res.guestToken) {
    throw new AppApiError({ status: 200, code: 'invalid_response', message: 'Unexpected response from the server.' });
  }
  return res;
}
