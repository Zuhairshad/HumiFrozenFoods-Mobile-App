import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createLogger } from '../../../src/lib/logger.js';
import { jsonBody } from '../../../src/lib/validation.js';
import type { AppEnv } from '../../../src/types.js';
import { captureLogs, errorBody, testApp } from '../helpers.js';
import { createErrorHandler } from '../../../src/lib/http.js';
import { healthRoutes } from '../../../src/routes/health.js';

const mount = (app: Hono<AppEnv>) => {
  app.get('/boom', () => {
    throw new Error('mongodb://user:password@host exploded at /srv/secret.js');
  });
  app.post('/echo', jsonBody(z.strictObject({ name: z.string() })), (c) => c.json(c.req.valid('json')));
  app.put('/echo', (c) => c.json({ ok: true }));
};

const JSON_HEADERS = { 'content-type': 'application/json' };

describe('health endpoints', () => {
  it('GET /healthz is liveness-only and never touches the database', async () => {
    let pings = 0;
    const app = testApp(undefined, { database: { ping: () => { pings += 1; return Promise.resolve(); } } });
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
    expect(pings).toBe(0);
  });

  it('GET /readyz is 200 when the database answers', async () => {
    const res = await testApp().request('/readyz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
  });

  it('GET /readyz is 503 without leaking the failure when the database is down', async () => {
    const capture = captureLogs();
    const app = testApp(undefined, {
      logger: createLogger({ level: 'warn', destination: capture.stream }),
      database: { ping: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:27017')) },
    });
    const res = await app.request('/readyz');
    expect(res.status).toBe(503);
    const body = await errorBody(res);
    expect(body.error.code).toBe('not_ready');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    expect(capture.text()).toContain('ECONNREFUSED'); // operators still get the detail
  });

  it('GET /readyz is 503 when the ping hangs', async () => {
    const host = new Hono<AppEnv>();
    host.use(async (c, next) => {
      c.set('requestId', 'req-test-0001');
      c.set('logger', createLogger({ level: 'silent' }));
      await next();
    });
    host.route('/', healthRoutes({ ping: () => new Promise<void>(() => undefined) }, 20));
    host.onError(createErrorHandler(true));
    const res = await host.request('/readyz');
    expect(res.status).toBe(503);
    expect((await errorBody(res)).error.code).toBe('not_ready');
  });

  it('health probes are not rate limited', async () => {
    const app = testApp(undefined, {}, { RATE_LIMIT_MAX: '1' });
    for (let i = 0; i < 5; i += 1) expect((await app.request('/healthz')).status).toBe(200);
  });
});

describe('error handling', () => {
  it('unknown routes get a JSON 404 envelope with the request id', async () => {
    const res = await testApp(mount).request('/nope', { headers: { 'x-request-id': 'trace-12345678' } });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await errorBody(res)).toEqual({
      error: { code: 'not_found', message: 'Resource not found', requestId: 'trace-12345678' },
    });
  });

  it('405 lists allowed methods', async () => {
    const res = await testApp(mount).request('/echo', { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST, PUT');
    expect((await errorBody(res)).error.code).toBe('method_not_allowed');

    const health = await testApp().request('/healthz', { method: 'POST' });
    expect(health.status).toBe(405);
    expect(health.headers.get('allow')).toBe('GET, HEAD');
  });

  it('answers HEAD on GET routes', async () => {
    expect((await testApp().request('/healthz', { method: 'HEAD' })).status).toBe(200);
  });

  it('500 never leaks internals in production', async () => {
    const app = testApp(mount, {}, { NODE_ENV: 'production', ...prodEnv() });
    const res = await app.request('/boom');
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('internal_error');
    for (const leak of ['password', 'mongodb://', 'secret.js', 'exploded', 'stack', ' at ']) {
      expect(text).not.toContain(leak);
    }
  });

  it('500 logs the real error server-side with the request id', async () => {
    const capture = captureLogs();
    const app = testApp(mount, { logger: createLogger({ level: 'error', destination: capture.stream }) });
    const res = await app.request('/boom');
    const { error } = await errorBody(res);
    const entry = capture.lines().find((l) => l.msg === 'request failed');
    expect(entry).toMatchObject({ requestId: error.requestId, code: 'internal_error' });
    expect(JSON.stringify(entry)).toContain('exploded');
  });

  it('500 outside production exposes the cause message but not the stack', async () => {
    const res = await testApp(mount).request('/boom');
    const text = JSON.stringify(await res.json());
    expect(text).toContain('exploded');
    expect(text).not.toContain('node_modules');
  });
});

describe('request pipeline', () => {
  it('rejects non-JSON writes with 415 before reaching handlers', async () => {
    const res = await testApp(mount).request('/echo', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    expect(res.status).toBe(415);
  });

  it('rejects oversized bodies with 413', async () => {
    const app = testApp(mount, {}, { BODY_LIMIT_BYTES: '1024' });
    const res = await app.request('/echo', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name: 'x'.repeat(2000) }) });
    expect(res.status).toBe(413);
  });

  it('rejects unknown fields and operator keys', async () => {
    const app = testApp(mount);
    const post = (body: unknown) => app.request('/echo', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
    expect((await post({ name: 'a', extra: 1 })).status).toBe(400);
    expect(await errorBody(await post({ name: { $ne: null } }))).toMatchObject({ error: { code: 'unsafe_input' } });
    const ok = await post({ name: 'a' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ name: 'a' });
  });

  it('applies global rate limiting by client IP and sets security headers on errors too', async () => {
    const app = testApp(mount, {}, { RATE_LIMIT_MAX: '2', TRUSTED_IP_HEADER: 'x-real-ip' });
    const get = (ip: string) => app.request('/nope', { headers: { 'x-real-ip': ip } });
    await get('9.9.9.9');
    await get('9.9.9.9');
    const limited = await get('9.9.9.9');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('x-content-type-options')).toBe('nosniff');
    expect(limited.headers.get('x-request-id')).toBeTruthy();
    expect((await get('8.8.8.8')).status).toBe(404);
  });

  it('applies CORS policy ahead of routing', async () => {
    const app = testApp(mount, {}, { ALLOWED_ORIGINS: 'https://shop.example.com' });
    const res = await app.request('/echo', { method: 'POST', headers: { ...JSON_HEADERS, origin: 'https://evil.example' }, body: '{"name":"a"}' });
    expect(res.status).toBe(403);
  });

  it('times out slow handlers', async () => {
    const app = testApp(
      (a) => {
        a.get('/slow', async (c) => {
          await new Promise((r) => setTimeout(r, 700));
          return c.json({});
        });
      },
      {},
      { REQUEST_TIMEOUT_MS: '150' },
    );
    expect((await app.request('/slow')).status).toBe(504);
  });
});

function prodEnv(): Record<string, string> {
  return {
    PUBLIC_API_BASE: 'https://api.example.com',
    STRIPE_SECRET_KEY: 'sk_live_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    GUEST_TOKEN_KEYS: `k:${'A'.repeat(43)}`,
  };
}
