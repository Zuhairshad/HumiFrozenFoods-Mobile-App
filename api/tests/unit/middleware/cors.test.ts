import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { corsPolicy } from '../../../src/middleware/cors.js';
import { createErrorHandler } from '../../../src/lib/http.js';
import { createLogger } from '../../../src/lib/logger.js';
import type { AppEnv } from '../../../src/types.js';
import { errorBody } from '../helpers.js';

function build(origins: string[]) {
  const app = new Hono<AppEnv>();
  app.use(async (c, next) => {
    c.set('requestId', 'req-test-0001');
    c.set('logger', createLogger({ level: 'silent' }));
    await next();
  });
  app.use(corsPolicy(origins));
  app.get('/r', (c) => c.json({ ok: true }));
  app.post('/r', (c) => c.json({ ok: true }));
  app.onError(createErrorHandler(true));
  return app;
}

const ALLOWED = 'https://shop.example.com';

describe('corsPolicy', () => {
  const app = build([ALLOWED]);

  it('lets requests with no Origin (native mobile apps) through, without CORS headers', async () => {
    const res = await app.request('/r', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('reflects only allow-listed origins and varies on Origin', async () => {
    const res = await app.request('/r', { headers: { origin: ALLOWED } });
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    expect(res.headers.get('vary')).toContain('Origin');
    expect(res.headers.get('access-control-expose-headers')).toContain('X-Request-Id');
  });

  it('gives unlisted origins no CORS headers on safe requests', async () => {
    const res = await app.request('/r', { headers: { origin: 'https://evil.example' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects state-changing requests from unlisted origins with 403', async () => {
    const res = await app.request('/r', { method: 'POST', headers: { origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
    expect((await errorBody(res)).error.code).toBe('origin_not_allowed');
  });

  it('treats the opaque "null" origin as unlisted', async () => {
    const res = await app.request('/r', { method: 'POST', headers: { origin: 'null' } });
    expect(res.status).toBe(403);
  });

  it('answers preflight for allowed origins only', async () => {
    const ok = await app.request('/r', {
      method: 'OPTIONS',
      headers: { origin: ALLOWED, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,authorization' },
    });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    expect(ok.headers.get('access-control-allow-methods')).toContain('POST');
    expect(ok.headers.get('access-control-max-age')).toBe('600');

    const denied = await app.request('/r', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('denies every browser origin by default (empty allow-list)', async () => {
    const closed = build([]);
    const res = await closed.request('/r', { headers: { origin: ALLOWED } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect((await closed.request('/r', { method: 'POST', headers: { origin: ALLOWED } })).status).toBe(403);
  });
});
