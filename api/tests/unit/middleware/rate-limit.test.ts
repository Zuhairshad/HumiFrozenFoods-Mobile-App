import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../../../src/lib/http.js';
import { createLogger } from '../../../src/lib/logger.js';
import { MemoryRateLimitStore, type RateLimitStore } from '../../../src/lib/rate-limit-store.js';
import { clientIp } from '../../../src/middleware/client-ip.js';
import { rateLimit, type RateLimitOptions } from '../../../src/middleware/rate-limit.js';
import type { AppEnv } from '../../../src/types.js';
import { errorBody } from '../helpers.js';

function build(configure: (app: Hono<AppEnv>) => void, trusted: string | undefined = 'x-real-ip') {
  const app = new Hono<AppEnv>();
  app.use(async (c, next) => {
    c.set('requestId', 'req-test-0001');
    c.set('logger', createLogger({ level: 'silent' }));
    await next();
  });
  app.use(clientIp(trusted));
  configure(app);
  app.onError(createErrorHandler(true));
  return app;
}

const from = (ip: string) => ({ headers: { 'x-real-ip': ip } });

describe('rateLimit', () => {
  it('limits per IP and exposes standard headers', async () => {
    let now = 0;
    const store = new MemoryRateLimitStore({ now: () => now });
    const app = build((a) => {
      a.use(rateLimit({ store, name: 'g', limit: 2, windowMs: 10_000, now: () => now }));
      a.get('/', (c) => c.json({ ok: true }));
    });

    const first = await app.request('/', from('1.1.1.1'));
    expect(first.status).toBe(200);
    expect(first.headers.get('ratelimit-limit')).toBe('2');
    expect(first.headers.get('ratelimit-remaining')).toBe('1');
    expect(first.headers.get('ratelimit-reset')).toBe('10');
    await app.request('/', from('1.1.1.1'));

    const blocked = await app.request('/', from('1.1.1.1'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('10');
    expect(blocked.headers.get('ratelimit-remaining')).toBe('0');
    expect((await errorBody(blocked)).error.code).toBe('rate_limited');

    expect((await app.request('/', from('2.2.2.2'))).status).toBe(200); // other IPs unaffected

    now = 10_000;
    expect((await app.request('/', from('1.1.1.1'))).status).toBe(200); // window reset
  });

  it('keeps per-route budgets separate from the global one', async () => {
    const store = new MemoryRateLimitStore();
    const app = build((a) => {
      a.use(rateLimit({ store, name: 'global', limit: 100, windowMs: 60_000 }));
      a.post('/orders', rateLimit({ store, name: 'orders', limit: 1, windowMs: 60_000 }), (c) => c.json({ ok: true }));
      a.get('/products', (c) => c.json({ ok: true }));
    });
    expect((await app.request('/orders', { method: 'POST', ...from('1.1.1.1') })).status).toBe(200);
    expect((await app.request('/orders', { method: 'POST', ...from('1.1.1.1') })).status).toBe(429);
    expect((await app.request('/products', from('1.1.1.1'))).status).toBe(200);
  });

  it('supports a custom key', async () => {
    const store = new MemoryRateLimitStore();
    const app = build((a) => {
      a.use(rateLimit({ store, name: 'k', limit: 1, windowMs: 1000, key: (c) => c.req.header('x-user') ?? 'anon' }));
      a.get('/', (c) => c.json({}));
    });
    expect((await app.request('/', { headers: { 'x-user': 'a' } })).status).toBe(200);
    expect((await app.request('/', { headers: { 'x-user': 'b' } })).status).toBe(200);
    expect((await app.request('/', { headers: { 'x-user': 'a' } })).status).toBe(429);
  });

  it('cannot be evaded by spoofing forwarding headers when none is trusted', async () => {
    const store = new MemoryRateLimitStore();
    const app = build((a) => {
      a.use(rateLimit({ store, name: 'g', limit: 1, windowMs: 1000 }));
      a.get('/', (c) => c.json({}));
    }, undefined);
    await app.request('/', { headers: { 'x-forwarded-for': '1.1.1.1' } });
    expect((await app.request('/', { headers: { 'x-forwarded-for': '2.2.2.2' } })).status).toBe(429);
  });

  describe('store failures', () => {
    const failing: RateLimitStore = { hit: () => Promise.reject(new Error('redis down')) };
    const make = (extra: Partial<RateLimitOptions>) =>
      build((a) => {
        a.use(rateLimit({ store: failing, name: 'g', limit: 1, windowMs: 1000, ...extra }));
        a.get('/', (c) => c.json({ ok: true }));
      });

    it('fails open by default so an outage does not take the API down', async () => {
      expect((await make({}).request('/', from('1.1.1.1'))).status).toBe(200);
    });

    it('can fail closed for routes where abuse is costly', async () => {
      expect((await make({ failOpen: false }).request('/', from('1.1.1.1'))).status).toBe(500);
    });
  });
});
