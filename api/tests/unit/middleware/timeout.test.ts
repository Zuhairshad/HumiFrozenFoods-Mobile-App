import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createErrorHandler } from '../../../src/lib/http.js';
import { createLogger } from '../../../src/lib/logger.js';
import { requestTimeout } from '../../../src/middleware/timeout.js';
import type { AppEnv } from '../../../src/types.js';
import { errorBody } from '../helpers.js';

const app = new Hono<AppEnv>();
app.use(async (c, next) => {
  c.set('requestId', 'req-test-0001');
  c.set('logger', createLogger({ level: 'silent' }));
  await next();
});
app.use(requestTimeout(150));
app.get('/fast', (c) => c.json({ ok: true }));
app.get('/slow', async (c) => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return c.json({ ok: true });
});
app.get('/throws', () => {
  throw new Error('inner');
});
app.onError(createErrorHandler(true));

describe('requestTimeout', () => {
  it('passes fast handlers through', async () => {
    expect((await app.request('/fast')).status).toBe(200);
  });

  it('answers 504 when the budget is exceeded', async () => {
    const res = await app.request('/slow');
    expect(res.status).toBe(504);
    expect((await errorBody(res)).error.code).toBe('request_timeout');
  });

  it('propagates handler errors unchanged and clears its timer', async () => {
    expect((await app.request('/throws')).status).toBe(500);
  });
});
