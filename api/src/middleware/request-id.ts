import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { Logger } from 'pino';
import type { AppEnv } from '../types.js';

// Inbound ids are only trusted when they look like ids, which blocks log injection.
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(baseLogger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const inbound = c.req.header('x-request-id');
    const id = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();
    c.set('requestId', id);
    c.set('logger', baseLogger.child({ requestId: id }));
    c.header('X-Request-Id', id);
    await next();
  };
}
