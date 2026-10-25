import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppApiError } from '../../src/lib/api/errors';
import type { QuoteResponse } from '../../src/lib/api/types';
import { buildQuoteRequest, createQuoteController, INITIAL_QUOTE_STATE, quoteKey, quoteReducer } from '../../src/features/cart/quote-state';

const quote = (total: number): QuoteResponse => ({
  pricing: { subtotalPence: total, deliveryPence: 0, discountPence: 0, totalPence: total, currency: 'gbp', promoCode: null, freeDeliveryRemainingPence: 0 },
  lines: [],
  unavailable: [],
});

describe('buildQuoteRequest', () => {
  it('merges, sorts and trims promo', () => {
    const r = buildQuoteRequest([{ productId: 'b', quantity: 1 }, { productId: 'a', quantity: 2 }, { productId: 'b', quantity: 2 }], ' SAVE ');
    expect(r).toEqual({ lines: [{ productId: 'a', quantity: 2 }, { productId: 'b', quantity: 3 }], promoCode: 'SAVE' });
    expect(buildQuoteRequest([{ productId: 'a', quantity: 1 }])).not.toHaveProperty('promoCode');
  });
});

describe('quoteReducer', () => {
  const k1 = 'k1';
  const k2 = 'k2';
  it('keeps previous data while loading and after error', () => {
    let s = quoteReducer(INITIAL_QUOTE_STATE, { type: 'request', key: k1 });
    s = quoteReducer(s, { type: 'success', key: k1, data: quote(100) });
    s = quoteReducer(s, { type: 'request', key: k2 });
    expect(s.status).toBe('loading');
    expect(s.data?.pricing.totalPence).toBe(100);
    s = quoteReducer(s, { type: 'failure', key: k2, error: new AppApiError({ status: 0, code: 'network_error', message: 'x' }) });
    expect(s.status).toBe('error');
    expect(s.data?.pricing.totalPence).toBe(100);
  });
  it('discards stale responses', () => {
    let s = quoteReducer(INITIAL_QUOTE_STATE, { type: 'request', key: k1 });
    s = quoteReducer(s, { type: 'request', key: k2 });
    const after = quoteReducer(s, { type: 'success', key: k1, data: quote(1) });
    expect(after).toBe(s);
  });
});

describe('createQuoteController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const req = (q: number) => buildQuoteRequest([{ productId: 'a', quantity: q }]);

  it('debounces rapid updates into one fetch', async () => {
    const fetchQuote = vi.fn(async (_r: unknown) => quote(100));
    const c = createQuoteController({ fetchQuote, debounceMs: 300 });
    c.update(req(1));
    c.update(req(2));
    c.update(req(3));
    await vi.advanceTimersByTimeAsync(299);
    expect(fetchQuote).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(fetchQuote.mock.calls[0][0]).toEqual(req(3));
    expect(c.getState().status).toBe('ready');
  });

  it('aborts the in-flight request and ignores its late result', async () => {
    const resolvers: ((q: QuoteResponse) => void)[] = [];
    const signals: AbortSignal[] = [];
    const fetchQuote = vi.fn((_r: unknown, s: AbortSignal) => {
      signals.push(s);
      return new Promise<QuoteResponse>((res) => resolvers.push(res));
    });
    const c = createQuoteController({ fetchQuote, debounceMs: 10 });
    c.update(req(1));
    await vi.advanceTimersByTimeAsync(11);
    c.update(req(2));
    await vi.advanceTimersByTimeAsync(11);
    expect(signals[0].aborted).toBe(true);
    resolvers[0](quote(111));
    resolvers[1](quote(222));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.getState().data?.pricing.totalPence).toBe(222);
  });

  it('empty cart resets to idle without fetching; same request is not re-fetched', async () => {
    const fetchQuote = vi.fn(async () => quote(5));
    const c = createQuoteController({ fetchQuote, debounceMs: 10 });
    c.update(req(1));
    await vi.advanceTimersByTimeAsync(11);
    c.update(req(1));
    await vi.advanceTimersByTimeAsync(11);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    c.update({ lines: [] });
    expect(c.getState().status).toBe('idle');
    expect(quoteKey(req(1))).toBe(quoteKey(req(1)));
  });

  it('surfaces API errors and refresh() retries', async () => {
    let fail = true;
    const fetchQuote = vi.fn(async () => {
      if (fail) throw new AppApiError({ status: 0, code: 'network_error', message: 'offline' });
      return quote(9);
    });
    const c = createQuoteController({ fetchQuote, debounceMs: 10 });
    c.update(req(1));
    await vi.advanceTimersByTimeAsync(11);
    expect(c.getState().status).toBe('error');
    fail = false;
    c.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.getState().status).toBe('ready');
  });
});
