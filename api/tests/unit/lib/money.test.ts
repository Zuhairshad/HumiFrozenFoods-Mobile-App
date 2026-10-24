import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  applyBasisPoints,
  formatGBP,
  fromPence,
  multiply,
  pence,
  subtract,
  sum,
  toPence,
} from '../../../src/lib/money.js';

describe('pence()', () => {
  it('accepts safe integers including zero and negatives', () => {
    expect(pence(0)).toBe(0);
    expect(pence(-250)).toBe(-250);
  });

  it.each([1.5, NaN, Infinity, 2 ** 53])('rejects %s', (value) => {
    expect(() => pence(value)).toThrow(RangeError);
  });
});

describe('toPence()', () => {
  it.each([
    ['12.99', 1299],
    ['0.05', 5],
    ['5', 500],
    ['5.5', 550],
    ['0', 0],
    ['-0.00', 0],
    ['-3.10', -310],
    [' 7.00 ', 700],
    [12.99, 1299],
    [0.1 + 0.2, 30],
    [19.9, 1990],
    [-0.0, 0],
  ])('converts %s to %s pence', (input, expected) => {
    expect(toPence(input)).toBe(expected);
  });

  it.each(['1.005', '1.', '.5', 'abc', '', '1e3', '1,000.00', '--1'])('rejects string %j', (input) => {
    expect(() => toPence(input)).toThrow(RangeError);
  });

  it('refuses to round numbers silently', () => {
    expect(() => toPence(1.005)).toThrow(/more than two decimal places/);
    expect(() => toPence(NaN)).toThrow(RangeError);
    expect(() => toPence(Infinity)).toThrow(RangeError);
  });
});

describe('fromPence() and formatGBP()', () => {
  it('renders exact decimals', () => {
    expect(fromPence(pence(1299))).toBe('12.99');
    expect(fromPence(pence(5))).toBe('0.05');
    expect(fromPence(pence(0))).toBe('0.00');
    expect(fromPence(pence(-1050))).toBe('-10.50');
  });

  it('formats pounds with grouping and sign', () => {
    expect(formatGBP(pence(1299))).toBe('£12.99');
    expect(formatGBP(pence(123456789))).toBe('£1,234,567.89');
    expect(formatGBP(pence(-5))).toBe('-£0.05');
    expect(formatGBP(pence(0))).toBe('£0.00');
  });

  it('round-trips through toPence', () => {
    for (const p of [0, 1, 99, 100, 101, 999_999, 12_345_678]) {
      expect(toPence(fromPence(pence(p)))).toBe(p);
    }
  });
});

describe('arithmetic', () => {
  it('adds, subtracts and sums as integers', () => {
    expect(add(pence(10), pence(20))).toBe(30);
    expect(subtract(pence(10), pence(20))).toBe(-10);
    expect(sum([pence(10), pence(20), pence(30)])).toBe(60);
    expect(sum([])).toBe(0);
  });

  it('throws instead of losing precision on overflow', () => {
    expect(() => add(pence(Number.MAX_SAFE_INTEGER), pence(1))).toThrow(RangeError);
  });

  it('multiplies by a valid quantity only', () => {
    expect(multiply(pence(499), 3)).toBe(1497);
    expect(multiply(pence(499), 0)).toBe(0);
    expect(() => multiply(pence(499), -1)).toThrow(RangeError);
    expect(() => multiply(pence(499), 1.5)).toThrow(RangeError);
  });
});

describe('applyBasisPoints() rounding rules', () => {
  it('computes exact percentages without rounding', () => {
    expect(applyBasisPoints(pence(1000), 2000)).toBe(200);
  });

  it('half-up rounds ties away from zero', () => {
    // 5% of 10p = 0.5p, 5% of 30p = 1.5p
    expect(applyBasisPoints(pence(10), 500, 'half-up')).toBe(1);
    expect(applyBasisPoints(pence(30), 500, 'half-up')).toBe(2);
    expect(applyBasisPoints(pence(-10), 500, 'half-up')).toBe(-1);
    expect(applyBasisPoints(pence(-30), 500, 'half-up')).toBe(-2);
  });

  it('half-even rounds ties to the even neighbour', () => {
    expect(applyBasisPoints(pence(10), 500, 'half-even')).toBe(0);
    expect(applyBasisPoints(pence(30), 500, 'half-even')).toBe(2);
    expect(applyBasisPoints(pence(50), 500, 'half-even')).toBe(2);
    expect(applyBasisPoints(pence(-10), 500, 'half-even')).toBe(0);
    expect(applyBasisPoints(pence(-30), 500, 'half-even')).toBe(-2);
  });

  it('rounds non-ties to the nearest value', () => {
    expect(applyBasisPoints(pence(1), 4900, 'half-up')).toBe(0);
    expect(applyBasisPoints(pence(1), 5100, 'half-up')).toBe(1);
    expect(applyBasisPoints(pence(-1), 5100, 'half-up')).toBe(-1);
    expect(applyBasisPoints(pence(-1), 4900, 'half-even')).toBe(0);
  });

  it('floor and ceil go toward negative and positive infinity', () => {
    expect(applyBasisPoints(pence(1), 5000, 'floor')).toBe(0);
    expect(applyBasisPoints(pence(1), 5000, 'ceil')).toBe(1);
    expect(applyBasisPoints(pence(-1), 5000, 'floor')).toBe(-1);
    expect(applyBasisPoints(pence(-1), 5000, 'ceil')).toBe(0);
    expect(applyBasisPoints(pence(100), 5000, 'floor')).toBe(50);
    expect(applyBasisPoints(pence(100), 5000, 'ceil')).toBe(50);
  });

  it('is exact for values where float multiplication drifts', () => {
    // 1.15 * 100 === 114.99999999999999 in floats; integer math must give 115 of 2300 at 5%
    expect(applyBasisPoints(pence(2300), 500)).toBe(115);
  });

  it('handles products beyond 2^53 via bigint', () => {
    expect(applyBasisPoints(pence(Number.MAX_SAFE_INTEGER - 1), 10_000)).toBe(Number.MAX_SAFE_INTEGER - 1);
  });

  it('rejects non-integer basis points', () => {
    expect(() => applyBasisPoints(pence(100), 12.5)).toThrow(RangeError);
  });
});

describe('allocate()', () => {
  it('always sums to the total', () => {
    const parts = allocate(pence(100), [1, 1, 1]);
    expect(parts).toEqual([34, 33, 33]);
    expect(sum(parts)).toBe(100);
  });

  it('respects weights and zero weights', () => {
    expect(allocate(pence(1000), [3, 0, 1])).toEqual([750, 0, 250]);
  });

  it('handles negative totals symmetrically', () => {
    const parts = allocate(pence(-100), [1, 1, 1]);
    expect(parts).toEqual([-34, -33, -33]);
    expect(sum(parts)).toBe(-100);
  });

  it('breaks remainder ties by position and larger remainders first', () => {
    expect(allocate(pence(10), [1, 2])).toEqual([3, 7]);
    expect(allocate(pence(2), [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it('rejects invalid weights', () => {
    expect(() => allocate(pence(1), [])).toThrow(RangeError);
    expect(() => allocate(pence(1), [0, 0])).toThrow(RangeError);
    expect(() => allocate(pence(1), [-1, 2])).toThrow(RangeError);
    expect(() => allocate(pence(1), [1.5])).toThrow(RangeError);
  });
});
