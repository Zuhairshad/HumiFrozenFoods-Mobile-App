import { describe, expect, it, vi } from 'vitest';
import { createHttpClient, parseRetryAfter } from '../../src/lib/api/http';
import { AppApiError } from '../../src/lib/api/errors';
import { createHttpStripeGateway } from '../../src/lib/api/stripe-gateway';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const mk = (impl: (url: string, init: RequestInit) => Promise<Response>) => {
  const fetchImpl = vi.fn(impl) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  const sleeps: number[] = [];
  const client = createHttpClient({ baseUrl: 'https://api.test/', fetchImpl, sleep: async (ms) => void sleeps.push(ms), random: () => 0.5 });
  return { client, fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn>, sleeps };
};

const caught = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppApiError;
  }
  throw new Error('expected rejection');
};

describe('http client', () => {
  it('parses the error envelope incl. details array and requestId', async () => {
    const { client } = mk(async () =>
      json(400, { error: { code: 'validation_failed', message: 'Bad', requestId: 'r1', details: [{ path: 'contact.email', message: 'Enter a valid email' }] } }),
    );
    const e = await caught(client.request({ method: 'POST', path: '/x', body: {} }));
    expect(e).toBeInstanceOf(AppApiError);
    expect(e).toMatchObject({ status: 400, code: 'validation_failed', message: 'Bad', requestId: 'r1' });
    expect(e.fieldErrors).toEqual({ 'contact.email': 'Enter a valid email' });
  });

  it('reads Retry-After on 429 and does not retry POST without a key', async () => {
    const { client, fetchImpl } = mk(async () => json(429, { error: { code: 'rate_limited', message: 'Slow down' } }, { 'Retry-After': '42' }));
    const e = await caught(client.request({ method: 'POST', path: '/x', body: {} }));
    expect(e.retryAfter).toBe(42);
    expect(e.isRateLimited).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('distinguishes network failure from HTTP error', async () => {
    const { client } = mk(async () => {
      throw new TypeError('Network request failed');
    });
    const e = await caught(client.request({ method: 'POST', path: '/x', body: {} }));
    expect(e).toMatchObject({ status: 0, code: 'network_error' });
    expect(e.isNetwork).toBe(true);
  });

  it('retries GET with backoff then succeeds', async () => {
    let n = 0;
    const { client, fetchImpl, sleeps } = mk(async () => (++n < 3 ? json(503, { error: { code: 'internal_error', message: 'x' } }) : json(200, { ok: true })));
    await expect(client.request({ method: 'GET', path: '/x' })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([300, 600]);
  });

  it('does not retry 4xx GET', async () => {
    const { client, fetchImpl } = mk(async () => json(404, { error: { code: 'not_found', message: 'no' } }));
    await caught(client.request({ method: 'GET', path: '/x' }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('payment-intent retries 2x on network/5xx/429 with the SAME Idempotency-Key', async () => {
    const calls: Record<string, string>[] = [];
    let n = 0;
    const { client } = mk(async (_u, init) => {
      calls.push(init.headers as Record<string, string>);
      n++;
      if (n === 1) throw new TypeError('offline');
      if (n === 2) return json(429, { error: { code: 'rate_limited', message: 'x' } }, { 'Retry-After': '1' });
      return json(201, { orderId: 'o', orderNumber: 'N', guestToken: 't', clientSecret: 's', pricing: { totalPence: 100 }, lines: [] });
    });
    const gw = createHttpStripeGateway(client);
    const res = await gw.createPaymentIntent(
      { lines: [{ productId: 'a', quantity: 1 }], contact: { name: 'A B', email: 'a@b.co', phone: '07000000000' }, address: { line1: '1 St', city: 'X', postcode: 'M1 1AA' }, slot: { date: '2026-10-26', window: 'morning' } },
      { idempotencyKey: 'key-1' },
    );
    expect(res.demo).toBe(false);
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((h) => h['Idempotency-Key']))).toEqual(new Set(['key-1']));
  });

  it('gives up after 2 retries', async () => {
    const { client, fetchImpl } = mk(async () => json(500, { error: { code: 'internal_error', message: 'x' } }));
    const e = await caught(client.request({ method: 'POST', path: '/x', body: {}, idempotencyKey: 'k', retry: { retries: 2 } }));
    expect(e.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('times out as a network-class error and respects caller abort', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    const client = createHttpClient({ baseUrl: 'https://a', fetchImpl, sleep: async () => {} });
    const p = caught(client.request({ method: 'POST', path: '/x', body: {}, timeoutMs: 1000 }));
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toMatchObject({ code: 'timeout' });
    const ctl = new AbortController();
    const q = caught(client.request({ method: 'POST', path: '/x', body: {}, signal: ctl.signal }));
    ctl.abort();
    expect(await q).toMatchObject({ code: 'aborted' });
    vi.useRealTimers();
  });

  it('sends bearer token and parses Retry-After dates', async () => {
    const { client, fetchImpl } = mk(async () => json(200, { a: 1 }));
    await client.request({ method: 'GET', path: '/v1/orders/1', bearer: 'tok' });
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 0)).toBe(10);
  });
});
