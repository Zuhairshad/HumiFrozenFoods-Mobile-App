import { GatewayError } from './errors';
import { API_BASE_URL, apiRequest } from './http';
import type { OrderDto } from './types';

/**
 * GET {EXPO_PUBLIC_API_BASE_URL}/v1/orders/:id with `Authorization: Bearer <guestToken>`.
 * Returns null in demo mode (no server): callers fall back to the locally stored order.
 */
export async function fetchOrder(orderId: string, guestToken: string): Promise<OrderDto | null> {
  if (!API_BASE_URL) return null;
  if (!guestToken) throw new GatewayError('unauthorized', 'Missing order access token.');
  return apiRequest<OrderDto>(API_BASE_URL, {
    method: 'GET',
    path: `/v1/orders/${encodeURIComponent(orderId)}`,
    headers: { Authorization: `Bearer ${guestToken}` },
    timeoutMs: 10000,
  });
}
