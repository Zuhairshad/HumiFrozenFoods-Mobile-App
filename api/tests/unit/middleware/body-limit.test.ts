import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../../../src/lib/http.js';
import { createLogger } from '../../../src/lib/logger.js';
import { requestBodyLimit } from '../../../src/middleware/body-limit.js';
import type { AppEnv } from '../../../src/types.js';
import { errorBody } from '../helpers.js';

const app = new Hono<AppEnv>();
app.use(async (c, next) => {
  c.set('requestId', 'req-test-0001');
  c.set('logger', createLogger({ level: 'silent' }));
  await next();
});
app.use(requestBodyLimit(10));
app.post('/', async (c) => c.json({ length: (await c.req.text()).length }));
app.onError(createErrorHandler(true));

function chunked(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

describe('requestBodyLimit', () => {
  it('accepts bodies at the limit', async () => {
    const res = await app.request('/', { method: 'POST', body: '0123456789' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ length: 10 });
  });

  it('rejects by Content-Length with the standard envelope', async () => {
    const res = await app.request('/', { method: 'POST', body: '0123456789X' });
    expect(res.status).toBe(413);
    expect(await errorBody(res)).toMatchObject({ error: { code: 'payload_too_large', details: { maxBytes: 10 } } });
  });

  it('rejects chunked bodies that lie about, or omit, their length', async () => {
    const res = await app.request('/', {
      method: 'POST',
      body: chunked(['01234', '56789', 'X']),
      headers: { 'transfer-encoding': 'chunked' },
      duplex: 'half',
    } as RequestInit);
    expect(res.status).toBe(413);
  });

  it('passes small chunked bodies through intact', async () => {
    const res = await app.request('/', {
      method: 'POST',
      body: chunked(['01', '23']),
      headers: { 'transfer-encoding': 'chunked' },
      duplex: 'half',
    } as RequestInit);
    expect(await res.json()).toEqual({ length: 4 });
  });

  it('ignores bodiless requests', async () => {
    expect((await app.request('/', { method: 'POST' })).status).toBe(200);
  });
});
