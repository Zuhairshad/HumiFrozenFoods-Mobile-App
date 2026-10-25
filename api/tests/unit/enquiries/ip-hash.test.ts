import { describe, expect, it } from 'vitest';
import { hashIp } from '../../../src/enquiries/ip-hash.js';

describe('hashIp', () => {
  it('is deterministic, 32 hex chars and does not contain the address', () => {
    const a = hashIp('203.0.113.7', 'salt-one');
    expect(a).toBe(hashIp('203.0.113.7', 'salt-one'));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain('203');
  });

  it('depends on both the salt and the address', () => {
    expect(hashIp('203.0.113.7', 'salt-one')).not.toBe(hashIp('203.0.113.7', 'salt-two'));
    expect(hashIp('203.0.113.7', 'salt-one')).not.toBe(hashIp('203.0.113.8', 'salt-one'));
  });

  it('refuses an empty salt', () => {
    expect(() => hashIp('1.2.3.4', '')).toThrow();
  });
});
