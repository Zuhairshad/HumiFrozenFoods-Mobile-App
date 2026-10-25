import { AppApiError } from './errors';
import type { HttpClient } from './http';
import type { QuoteRequest, QuoteResponse } from './types';

/** POST /v1/checkout/quote. Pure read of prices (no side effects) so it is safe to retry. */
export async function postQuote(client: HttpClient, req: QuoteRequest, signal?: AbortSignal): Promise<QuoteResponse> {
  const res = await client.request<QuoteResponse>({
    method: 'POST',
    path: '/v1/checkout/quote',
    body: req,
    signal,
    timeoutMs: 10000,
    retry: undefined,
  });
  if (!res || typeof res !== 'object' || !res.pricing || !Array.isArray(res.lines)) {
    throw new AppApiError({ status: 200, code: 'invalid_response', message: 'Unexpected response from the server.' });
  }
  return { ...res, unavailable: Array.isArray(res.unavailable) ? res.unavailable : [] };
}
