import type { MiddlewareHandler } from 'hono';
import { UnsupportedMediaTypeError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const JSON_TYPE = /^application\/json\s*(;.*)?$/i;

/** Write requests that carry a body must declare JSON. Bodiless writes (e.g. DELETE) pass. */
export function requireJson(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (WRITE_METHODS.has(c.req.method) && c.req.raw.body !== null) {
      const type = c.req.header('content-type');
      if (!type || !JSON_TYPE.test(type)) throw new UnsupportedMediaTypeError();
    }
    await next();
  };
}
