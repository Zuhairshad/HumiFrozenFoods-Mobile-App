declare const penceBrand: unique symbol;

/** An integer number of pence. Floats never represent money in this codebase. */
export type Pence = number & { readonly [penceBrand]: true };

export type Rounding = 'half-up' | 'half-even' | 'floor' | 'ceil';

export function pence(value: number): Pence {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Pence must be a safe integer, received ${String(value)}`);
  }
  return value as Pence;
}

const DECIMAL_POUNDS = /^(-)?(\d{1,13})(?:\.(\d{1,2}))?$/;

/**
 * Converts pounds to pence without ever rounding silently.
 * - Strings are parsed as exact decimals with at most two fractional digits.
 * - Numbers are accepted only if they are a whole number of pence within float
 *   noise (so 12.99 and 0.1 + 0.2 work, but 1.005 throws instead of guessing).
 */
export function toPence(pounds: string | number): Pence {
  if (typeof pounds === 'number') {
    if (!Number.isFinite(pounds)) throw new RangeError('Amount must be finite');
    const scaled = pounds * 100;
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > 1e-6) {
      throw new RangeError(`Amount ${String(pounds)} has more than two decimal places`);
    }
    return pence(rounded === 0 ? 0 : rounded);
  }
  const match = DECIMAL_POUNDS.exec(pounds.trim());
  if (!match) throw new RangeError('Amount must be a decimal with at most two decimal places');
  const [, sign, whole = '0', frac = ''] = match;
  const total = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return pence(sign && total !== 0 ? -total : total);
}

/** Exact decimal string, e.g. 1299 -> "12.99". A string avoids reintroducing floats. */
export function fromPence(value: Pence): string {
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${value < 0 ? '-' : ''}${String(whole)}.${frac}`;
}

export function formatGBP(value: Pence): string {
  const abs = Math.abs(value);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(abs % 100).padStart(2, '0');
  return `${value < 0 ? '-' : ''}£${whole}.${frac}`;
}

export function add(a: Pence, b: Pence): Pence {
  return pence(a + b);
}

export function subtract(a: Pence, b: Pence): Pence {
  return pence(a - b);
}

export function sum(values: readonly Pence[]): Pence {
  return values.reduce<Pence>((acc, v) => add(acc, v), pence(0));
}

export function multiply(unit: Pence, quantity: number): Pence {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('Quantity must be a non-negative integer');
  }
  return pence(unit * quantity);
}

function divideRound(numerator: bigint, denominator: bigint, mode: Rounding): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');
  const quotient = numerator / denominator; // truncates toward zero
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const negative = numerator < 0n;
  const floor = negative ? quotient - 1n : quotient;
  switch (mode) {
    case 'floor':
      return floor;
    case 'ceil':
      return floor + 1n;
    case 'half-up':
    case 'half-even': {
      const twice = (negative ? -remainder : remainder) * 2n;
      if (twice !== denominator) return twice > denominator ? floor + 1n : floor;
      // Exactly half. half-up rounds away from zero; half-even picks the even neighbour.
      if (mode === 'half-up') return negative ? floor : floor + 1n;
      return floor % 2n === 0n ? floor : floor + 1n;
    }
  }
}

/** value * basisPoints / 10_000 (100 bps = 1%), rounded explicitly. */
export function applyBasisPoints(value: Pence, basisPoints: number, rounding: Rounding = 'half-up'): Pence {
  if (!Number.isSafeInteger(basisPoints)) throw new RangeError('Basis points must be an integer');
  const result = divideRound(BigInt(value) * BigInt(basisPoints), 10_000n, rounding);
  return pence(Number(result));
}

/**
 * Splits `total` across `weights` so the parts always sum to exactly `total`
 * (largest-remainder method). Use for spreading discounts or fees across lines.
 */
export function allocate(total: Pence, weights: readonly number[]): Pence[] {
  if (weights.length === 0) throw new RangeError('At least one weight is required');
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new RangeError('Weights must be non-negative integers');
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) throw new RangeError('Weights must not all be zero');

  const sign = total < 0 ? -1n : 1n;
  const absTotal = BigInt(total) * sign;
  const denominator = BigInt(weightSum);
  const shares = weights.map((w, index) => {
    const exact = absTotal * BigInt(w);
    return { index, base: exact / denominator, remainder: exact % denominator };
  });
  let leftover = absTotal - shares.reduce((acc, s) => acc + s.base, 0n);
  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const share of byRemainder) {
    if (leftover === 0n) break;
    share.base += 1n;
    leftover -= 1n;
  }
  return shares.map((s) => pence(Number(s.base * sign)));
}
