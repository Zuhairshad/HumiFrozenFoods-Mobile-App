import { describe, expect, it } from 'vitest';
import { cartMatchesOrder } from '../../src/features/checkout/cart-match';

const line = (productId: string, quantity: number) => ({ productId, quantity });

describe('cartMatchesOrder', () => {
  it('matches the same items and quantities regardless of order', () => {
    expect(cartMatchesOrder([line('a', 2), line('b', 1)], [line('b', 1), line('a', 2)])).toBe(true);
  });

  it('does not match when a quantity differs', () => {
    expect(cartMatchesOrder([line('a', 3)], [line('a', 2)])).toBe(false);
  });

  it('does not match when the customer added another product since', () => {
    expect(cartMatchesOrder([line('a', 2), line('c', 1)], [line('a', 2)])).toBe(false);
  });

  it('does not match when a product was swapped for another', () => {
    expect(cartMatchesOrder([line('a', 1), line('c', 1)], [line('a', 1), line('b', 1)])).toBe(false);
  });

  it('never matches an empty cart (nothing to clear)', () => {
    expect(cartMatchesOrder([], [line('a', 1)])).toBe(false);
    expect(cartMatchesOrder([], [])).toBe(false);
  });

  it('treats duplicate lines for one product as their sum', () => {
    expect(cartMatchesOrder([line('a', 1), line('a', 1)], [line('a', 2), line('a', 0)])).toBe(true);
    expect(cartMatchesOrder([line('a', 1), line('a', 1)], [line('a', 3), line('a', 0)])).toBe(false);
  });
});
