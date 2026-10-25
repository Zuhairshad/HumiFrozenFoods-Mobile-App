import { randomInt } from 'node:crypto';
import type { OrdersRepository } from '../domain/ports.js';
import { ConflictError } from '../lib/errors.js';

/** Digits and dashes only: the only characters that may ever reach a `tracking_number` equality filter. */
export const ORDER_NUMBER_PATTERN = /^[0-9-]{1,24}$/;
export const MAX_ORDER_NUMBER_ATTEMPTS = 5;

export type RandomInt = (maxExclusive: number) => number;

const cryptoInt: RandomInt = (max) => randomInt(max);
// crypto.randomInt is limited to ranges below 2^48, so long numbers are built from 9-digit chunks.
const CHUNK_DIGITS = 9;

export function isValidOrderNumber(value: unknown): value is string {
  return typeof value === 'string' && ORDER_NUMBER_PATTERN.test(value);
}

/** Uniform decimal digits; leading zeros are kept so every number has exactly `digits` characters. */
export function randomOrderNumber(digits: number, rand: RandomInt = cryptoInt): string {
  if (!Number.isInteger(digits) || digits < 1 || digits > 24) {
    throw new RangeError('Order number length must be an integer from 1 to 24');
  }
  let result = '';
  for (let remaining = digits; remaining > 0; remaining -= CHUNK_DIGITS) {
    const size = Math.min(CHUNK_DIGITS, remaining);
    result += String(rand(10 ** size)).padStart(size, '0');
  }
  return result;
}

export async function generateOrderNumber(
  repository: Pick<OrdersRepository, 'orderNumberExists'>,
  digits: number,
  rand: RandomInt = cryptoInt,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    const candidate = randomOrderNumber(digits, rand);
    if (!(await repository.orderNumberExists(candidate))) return candidate;
  }
  throw new ConflictError('Could not allocate an order number, please retry', 'order_number_unavailable');
}
