import { AppApiError } from './errors';
import type { HttpClient } from './http';
import type { ConfigResponse } from './types';

function bad(): never {
  throw new AppApiError({ status: 200, code: 'invalid_response', message: 'Unexpected config response.' });
}

/** Light structural validation: the app must never run on a half-formed delivery rule. */
export function parseConfig(v: unknown): ConfigResponse {
  const c = v as Partial<ConfigResponse> | null;
  if (!c || typeof c !== 'object') return bad();
  const d = c.delivery;
  if (!d || typeof d.feePence !== 'number' || typeof d.minOrderPence !== 'number') return bad();
  if (d.freeThresholdPence !== null && typeof d.freeThresholdPence !== 'number') return bad();
  if (!c.promo || typeof c.promo.enabled !== 'boolean') return bad();
  if (!c.payments || typeof c.payments.enabled !== 'boolean') return bad();
  return {
    currency: 'gbp',
    delivery: { feePence: d.feePence, freeThresholdPence: d.freeThresholdPence, minOrderPence: d.minOrderPence },
    promo: { enabled: c.promo.enabled },
    payments: { provider: 'stripe', enabled: c.payments.enabled },
    lowStockThreshold: typeof c.lowStockThreshold === 'number' ? c.lowStockThreshold : 5,
    slotWindows: Array.isArray(c.slotWindows) ? c.slotWindows : [],
  };
}

export async function fetchConfig(client: HttpClient, signal?: AbortSignal): Promise<ConfigResponse> {
  return parseConfig(await client.request<unknown>({ method: 'GET', path: '/v1/config', signal, timeoutMs: 8000 }));
}
