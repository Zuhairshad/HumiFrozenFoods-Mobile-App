import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../../../src/lib/errors.js';
import { createErrorHandler } from '../../../src/lib/http.js';
import { jsonBody, parseWith, pathParams, queryParams } from '../../../src/lib/validation.js';
import type { AppEnv } from '../../../src/types.js';
import { createLogger } from '../../../src/lib/logger.js';
import { errorBody } from '../helpers.js';

const schema = z.strictObject({ name: z.string().min(2), qty: z.number().int().positive() });

describe('parseWith', () => {
  it('returns typed data', () => {
    expect(parseWith(schema, { name: 'ab', qty: 2 })).toEqual({ name: 'ab', qty: 2 });
  });

  it('reports paths and messages but never the submitted values', () => {
    try {
      parseWith(schema, { name: 'x', qty: 'secret-card-4242', extra: 1 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const serialised = JSON.stringify((error as ValidationError).details);
      expect(serialised).toContain('name');
      expect(serialised).not.toContain('secret-card-4242');
    }
  });

  it('rejects unknown keys via strict objects', () => {
    expect(() => parseWith(schema, { name: 'ab', qty: 1, admin: true })).toThrow(ValidationError);
  });

  it('rejects Mongo-operator keys before schema parsing', () => {
    expect(() => parseWith(z.looseObject({}), { $gt: '' })).toThrow(/disallowed key/);
  });
});

describe('hono validators', () => {
  function build(): Hono<AppEnv> {
    const app = new Hono<AppEnv>();
    app.use(async (c, next) => {
      c.set('requestId', 'req-test-0001');
      c.set('logger', createLogger({ level: 'silent' }));
      await next();
    });
    app.post('/items/:id', pathParams(z.strictObject({ id: z.string().regex(/^\d+$/) })), queryParams(z.strictObject({ dry: z.enum(['1', '0']).optional() })), jsonBody(schema), (c) =>
      c.json({ id: c.req.valid('param').id, dry: c.req.valid('query').dry ?? null, body: c.req.valid('json') }),
    );
    app.onError(createErrorHandler(true));
    return app;
  }

  const post = (app: Hono<AppEnv>, path: string, body: string, type = 'application/json') =>
    app.request(path, { method: 'POST', headers: { 'content-type': type }, body });

  it('passes valid input through typed', async () => {
    const res = await post(build(), '/items/7?dry=1', JSON.stringify({ name: 'ab', qty: 3 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '7', dry: '1', body: { name: 'ab', qty: 3 } });
  });

  it.each([
    ['bad body', '/items/7', JSON.stringify({ name: 'a' })],
    ['bad param', '/items/abc', JSON.stringify({ name: 'ab', qty: 1 })],
    ['bad query', '/items/7?dry=maybe', JSON.stringify({ name: 'ab', qty: 1 })],
    ['unknown query key', '/items/7?foo=1', JSON.stringify({ name: 'ab', qty: 1 })],
    ['operator key', '/items/7', '{"name":"ab","qty":1,"$where":"x"}'],
  ])('answers %s with 400 validation_failed or unsafe_input', async (_label, path, body) => {
    const res = await post(build(), path, body);
    expect(res.status).toBe(400);
    expect(['validation_failed', 'unsafe_input']).toContain((await errorBody(res)).error.code);
  });

  it('answers malformed JSON and wrong content type with 400', async () => {
    expect((await post(build(), '/items/7', '{not json')).status).toBe(400);
    expect((await post(build(), '/items/7', 'name=ab', 'text/plain')).status).toBe(400);
  });
});
