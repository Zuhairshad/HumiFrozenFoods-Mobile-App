import type { MiddlewareHandler } from 'hono';
import { resolveClientIp } from '../lib/client-ip.js';
import type { AppEnv } from '../types.js';

export function clientIp(trustedHeader: string | undefined): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('clientIp', resolveClientIp(c, trustedHeader));
    await next();
  };
}
