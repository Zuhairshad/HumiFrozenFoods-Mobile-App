import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../../../src/middleware/security-headers.js';
import type { AppEnv } from '../../../src/types.js';

describe('securityHeaders', () => {
  const app = new Hono<AppEnv>();
  app.use(securityHeaders());
  app.get('/plain', (c) => c.json({}));
  app.get('/cached', (c) => {
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({});
  });

  it('sets a locked-down header set', async () => {
    const h = (await app.request('/plain')).headers;
    expect(h.get('content-security-policy')).toContain("default-src 'none'");
    expect(h.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(h.get('strict-transport-security')).toContain('max-age=63072000');
    expect(h.get('x-content-type-options')).toBe('nosniff');
    expect(h.get('x-frame-options')).toBe('DENY');
    expect(h.get('referrer-policy')).toBe('no-referrer');
    expect(h.get('cross-origin-resource-policy')).toBe('same-site');
  });

  it('defaults to no-store but respects a route that opts in to caching', async () => {
    expect((await app.request('/plain')).headers.get('cache-control')).toBe('no-store');
    expect((await app.request('/cached')).headers.get('cache-control')).toBe('public, max-age=60');
  });
});
