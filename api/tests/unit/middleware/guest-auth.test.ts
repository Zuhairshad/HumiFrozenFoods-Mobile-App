import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createGuestTokenService } from '../../../src/auth/guest-token.js';
import { Keyring } from '../../../src/auth/keyring.js';
import { createErrorHandler } from '../../../src/lib/http.js';
import { createLogger } from '../../../src/lib/logger.js';
import { requireGuestOrderToken } from '../../../src/middleware/guest-auth.js';
import type { AppEnv } from '../../../src/types.js';
import { errorBody } from '../helpers.js';

const service = createGuestTokenService({ keyring: new Keyring([['k1', randomBytes(32)]]), ttlSeconds: 60 });
const app = new Hono<AppEnv>();
app.use(async (c, next) => {
  c.set('requestId', 'req-test-0001');
  c.set('logger', createLogger({ level: 'silent' }));
  await next();
});
app.get('/orders/:orderId', requireGuestOrderToken(service), (c) => c.json({ order: c.req.param('orderId') }));
app.get('/by/:id', requireGuestOrderToken(service, 'id'), (c) => c.json({ ok: true }));
app.get('/no-param', requireGuestOrderToken(service), (c) => c.json({ ok: true }));
app.onError(createErrorHandler(true));

describe('requireGuestOrderToken', () => {
  const { token } = service.issue('order1');
  const bearer = (value: string) => ({ headers: { authorization: value } });

  it('allows the matching order', async () => {
    const res = await app.request('/orders/order1', bearer(`Bearer ${token}`));
    expect(res.status).toBe(200);
  });

  it('supports a custom param name', async () => {
    expect((await app.request('/by/order1', bearer(`Bearer ${token}`))).status).toBe(200);
  });

  it.each([
    ['no header', '/orders/order1', undefined],
    ['wrong scheme', '/orders/order1', `Basic ${token}`],
    ['lower-case scheme', '/orders/order1', `bearer ${token}`],
    ['garbage token', '/orders/order1', 'Bearer abc'],
    ['another order', '/orders/order2', `Bearer ${token}`],
    ['route without the param', '/no-param', `Bearer ${token}`],
  ])('answers an identical 401 for %s', async (_label, path, header) => {
    const res = await app.request(path, header ? bearer(header) : undefined);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
    const body = await errorBody(res);
    expect(body.error).toMatchObject({ code: 'invalid_token', message: 'Invalid or expired access token' });
  });
});
