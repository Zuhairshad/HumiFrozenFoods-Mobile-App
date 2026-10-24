import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../../../src/lib/http.js';
import { createLogger } from '../../../src/lib/logger.js';
import { requireJson } from '../../../src/middleware/require-json.js';
import type { AppEnv } from '../../../src/types.js';
import { errorBody } from '../helpers.js';

const app = new Hono<AppEnv>();
app.use(async (c, next) => {
  c.set('requestId', 'req-test-0001');
  c.set('logger', createLogger({ level: 'silent' }));
  await next();
});
app.use(requireJson());
app.all('/', (c) => c.json({ ok: true }));
app.onError(createErrorHandler(true));

const send = (method: string, headers?: Record<string, string>, body: string | null = '{}') =>
  app.request('/', { method, headers, body: method === 'GET' || body === null ? undefined : body });

describe('requireJson', () => {
  it.each(['application/json', 'application/json; charset=utf-8', 'APPLICATION/JSON', 'application/json;charset=UTF-8'])(
    'accepts %s',
    async (type) => {
      expect((await send('POST', { 'content-type': type })).status).toBe(200);
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s with a non-JSON body as 415', async (method) => {
    const res = await send(method, { 'content-type': 'text/plain' });
    expect(res.status).toBe(415);
    expect((await errorBody(res)).error.code).toBe('unsupported_media_type');
  });

  it.each(['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp', 'text/json', 'application/json-patch+json'])(
    'rejects %s',
    async (type) => {
      expect((await send('POST', { 'content-type': type })).status).toBe(415);
    },
  );

  it('rejects a body with no declared type (when the runtime does not infer one)', async () => {
    const res = await app.request('/', { method: 'POST', body: new Blob(['{}']) });
    expect(res.status).toBe(415);
  });

  it('lets bodiless writes and reads through', async () => {
    expect((await send('DELETE', undefined, null)).status).toBe(200);
    expect((await app.request('/', { method: 'POST' })).status).toBe(200);
    expect((await send('GET')).status).toBe(200);
  });
});
