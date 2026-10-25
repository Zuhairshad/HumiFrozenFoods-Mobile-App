import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildQuoteRequest, createQuoteController } from '../../src/features/cart/quote-state';
import type { QuoteResponse } from '../../src/lib/api/types';

const quote = (total: number): QuoteResponse => ({
  pricing: { subtotalPence: total, deliveryPence: 0, discountPence: 0, totalPence: total, currency: 'gbp', promoCode: null, freeDeliveryRemainingPence: 0 },
  lines: [],
  unavailable: [],
});

describe('quote controller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('an identical request re-submitted during the debounce window does not cancel the pending fetch', async () => {
    const fetchQuote = vi.fn(async () => quote(500));
    const c = createQuoteController({ fetchQuote });
    c.update(buildQuoteRequest([{ productId: 'a', quantity: 1 }]));
    // e.g. the catalogue refreshed: new array identity, same content
    c.update(buildQuoteRequest([{ productId: 'a', quantity: 1 }]));
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(c.getState().status).toBe('ready');
  });

  it('a slow older quote never overwrites a newer one', async () => {
    const resolvers: ((q: QuoteResponse) => void)[] = [];
    const fetchQuote = vi.fn(() => new Promise<QuoteResponse>((r) => resolvers.push(r)));
    const c = createQuoteController({ fetchQuote, debounceMs: 10 });
    c.update(buildQuoteRequest([{ productId: 'a', quantity: 1 }]));
    await vi.advanceTimersByTimeAsync(20);
    c.update(buildQuoteRequest([{ productId: 'a', quantity: 2 }]));
    await vi.advanceTimersByTimeAsync(20);
    resolvers[1](quote(2000));
    await vi.advanceTimersByTimeAsync(0);
    resolvers[0](quote(1000));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.getState().data?.pricing.totalPence).toBe(2000);
  });
});
