import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../../../src/lib/errors.js';
import {
  generateOrderNumber,
  isValidOrderNumber,
  MAX_ORDER_NUMBER_ATTEMPTS,
  ORDER_NUMBER_PATTERN,
  randomOrderNumber,
} from '../../../src/orders/order-number.js';

describe('randomOrderNumber', () => {
  it.each([1, 8, 9, 10, 12, 16, 24])('has exactly %i digits', (digits) => {
    for (let i = 0; i < 50; i += 1) expect(randomOrderNumber(digits)).toMatch(new RegExp(`^\\d{${String(digits)}}$`));
  });

  it('keeps leading zeros by padding', () => {
    expect(randomOrderNumber(12, () => 7)).toBe('000000007007');
  });

  it('pads each chunk independently', () => {
    expect(randomOrderNumber(12, () => 5)).toBe('000000005005');
    expect(randomOrderNumber(3, () => 0)).toBe('000');
  });

  it('draws from the full range using chunks no larger than crypto.randomInt allows', () => {
    const maxima: number[] = [];
    randomOrderNumber(24, (max) => {
      maxima.push(max);
      return 0;
    });
    expect(maxima).toEqual([1e9, 1e9, 1e6]);
    expect(Math.max(...maxima)).toBeLessThan(2 ** 48);
  });

  it.each([0, -1, 1.5, 25, Number.NaN])('rejects length %s', (digits) => {
    expect(() => randomOrderNumber(digits)).toThrow(RangeError);
  });

  it('produces varied values with the real generator', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomOrderNumber(12)));
    expect(seen.size).toBeGreaterThan(195);
  });
});

describe('generateOrderNumber', () => {
  it('returns the first free number', async () => {
    const exists = vi.fn(() => Promise.resolve(false));
    const n = await generateOrderNumber({ orderNumberExists: exists }, 12, () => 1);
    expect(n).toBe('000000001001');
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('retries on collision and succeeds on the last allowed attempt', async () => {
    let calls = 0;
    const exists = vi.fn(() => Promise.resolve(++calls < MAX_ORDER_NUMBER_ATTEMPTS));
    await expect(generateOrderNumber({ orderNumberExists: exists }, 12)).resolves.toMatch(/^\d{12}$/);
    expect(exists).toHaveBeenCalledTimes(5);
  });

  it('throws a 409 conflict after 5 collisions', async () => {
    const exists = vi.fn(() => Promise.resolve(true));
    const error = await generateOrderNumber({ orderNumberExists: exists }, 12).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ status: 409, code: 'order_number_unavailable' });
    expect(exists).toHaveBeenCalledTimes(5);
  });
});

describe('order number validation', () => {
  it.each(['123456789012', '1', '12-34', '1'.repeat(24)])('accepts %s', (v) => {
    expect(isValidOrderNumber(v)).toBe(true);
  });

  it.each(['', 'abc', '12 34', '1'.repeat(25), '12\n34', '１２３', '$ne', '12.5'])('rejects %j', (v) => {
    expect(isValidOrderNumber(v)).toBe(false);
    expect(ORDER_NUMBER_PATTERN.test(v)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidOrderNumber({ $ne: '' })).toBe(false);
    expect(isValidOrderNumber(123)).toBe(false);
    expect(isValidOrderNumber(['1'])).toBe(false);
  });
});
