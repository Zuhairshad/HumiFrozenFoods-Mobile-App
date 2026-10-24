import { BadRequestError } from './errors.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 16;

/**
 * Rejects untrusted objects that could act as Mongo operators or pollute
 * prototypes: keys starting with `$`, containing `.`, or named like prototype
 * hooks. Runs before schema validation so no later code can forget it.
 */
export function assertSafeKeys(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH) {
    throw new BadRequestError('Request is nested too deeply', 'unsafe_input');
  }
  if (Array.isArray(value)) {
    for (const item of value as unknown[]) assertSafeKeys(item, depth + 1);
    return;
  }
  if (typeof value !== 'object' || value === null) return;

  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) {
      throw new BadRequestError('Request contains a disallowed key', 'unsafe_input');
    }
    assertSafeKeys(child, depth + 1);
  }
}
