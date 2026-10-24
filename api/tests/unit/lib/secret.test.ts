import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { Secret } from '../../../src/lib/secret.js';

describe('Secret', () => {
  const secret = new Secret('sk_live_topsecret');

  it('reveals only explicitly', () => {
    expect(secret.reveal()).toBe('sk_live_topsecret');
  });

  it('is redacted in every implicit rendering', () => {
    expect(String(secret)).toBe('[REDACTED]');
    expect(secret.toString()).not.toContain('topsecret');
    expect(JSON.stringify({ secret })).toBe('{"secret":"[REDACTED]"}');
    expect(inspect({ secret })).not.toContain('topsecret');
    expect(Object.keys(secret)).toEqual([]);
    expect(JSON.stringify(Object.entries(secret))).not.toContain('topsecret');
  });
});
