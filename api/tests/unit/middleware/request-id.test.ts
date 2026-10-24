import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../../src/lib/logger.js';
import { accessLog } from '../../../src/middleware/access-log.js';
import { requestId } from '../../../src/middleware/request-id.js';
import type { AppEnv } from '../../../src/types.js';
import { captureLogs } from '../helpers.js';

function build() {
  const capture = captureLogs();
  const logger = createLogger({ level: 'info', destination: capture.stream });
  const app = new Hono<AppEnv>();
  app.use(requestId(logger));
  app.use(accessLog());
  app.get('/x', (c) => {
    c.get('logger').info('inside handler');
    return c.json({ id: c.get('requestId') });
  });
  return { app, capture };
}

describe('requestId', () => {
  it('generates a UUID and echoes it in header and context', async () => {
    const { app } = build();
    const res = await app.request('/x');
    const id = res.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await res.json()).toEqual({ id });
  });

  it('accepts a well-formed inbound id', async () => {
    const { app } = build();
    const res = await app.request('/x', { headers: { 'x-request-id': 'client-abc_123.456' } });
    expect(res.headers.get('x-request-id')).toBe('client-abc_123.456');
  });

  it.each(['short', 'has space in it', 'x'.repeat(65), 'inject\\n{"level":60}', 'semi;colon-id'])(
    'replaces unsafe inbound id %j',
    async (bad) => {
      const { app } = build();
      const res = await app.request('/x', { headers: { 'x-request-id': bad } });
      expect(res.headers.get('x-request-id')).not.toBe(bad);
    },
  );

  it('correlates every log line with the request id', async () => {
    const { app, capture } = build();
    const res = await app.request('/x?token=secret', { headers: { 'x-request-id': 'corr-12345678' } });
    expect(res.status).toBe(200);
    const lines = capture.lines();
    expect(lines.map((l) => l.requestId)).toEqual(['corr-12345678', 'corr-12345678']);
    expect(lines[1]).toMatchObject({ method: 'GET', path: '/x', status: 200, msg: 'request completed' });
    expect(typeof lines[1]?.durationMs).toBe('number');
    expect(capture.text()).not.toContain('secret'); // query strings are never logged
  });
});
