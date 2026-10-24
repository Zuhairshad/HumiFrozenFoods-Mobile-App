import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resolveClientIp } from '../../../src/lib/client-ip.js';

async function ipFor(trusted: string | undefined, headers: Record<string, string>, env?: unknown): Promise<string> {
  const app = new Hono();
  app.get('/', (c) => c.text(resolveClientIp(c, trusted)));
  return (await app.request('/', { headers }, env)).text();
}

describe('resolveClientIp', () => {
  it('ignores forwarding headers unless explicitly trusted', async () => {
    expect(await ipFor(undefined, { 'x-forwarded-for': '6.6.6.6' })).toBe('unknown');
  });

  it('uses the trusted header, first hop only', async () => {
    expect(await ipFor('x-forwarded-for', { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })).toBe('1.2.3.4');
    expect(await ipFor('x-real-ip', { 'x-real-ip': '9.9.9.9' })).toBe('9.9.9.9');
  });

  it('caps header length', async () => {
    expect((await ipFor('x-real-ip', { 'x-real-ip': 'a'.repeat(500) })).length).toBe(64);
  });

  it('falls back to the socket address, then "unknown"', async () => {
    const env = { incoming: { socket: { remoteAddress: '203.0.113.5' } } };
    expect(await ipFor('x-real-ip', {}, env)).toBe('203.0.113.5');
    expect(await ipFor(undefined, {}, { incoming: { socket: {} } })).toBe('unknown');
    expect(await ipFor(undefined, {}, { incoming: {} })).toBe('unknown');
  });
});
