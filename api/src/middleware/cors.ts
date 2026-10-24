import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { ForbiddenError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Deny-by-default CORS. Native mobile clients send no Origin header and pass
 * straight through; a browser Origin must be on the allow-list. Because CORS
 * alone does not stop a disallowed site from *sending* a write, state-changing
 * requests from unlisted origins are rejected outright.
 */
export function corsPolicy(allowedOrigins: readonly string[]): MiddlewareHandler<AppEnv> {
  const allowed = new Set(allowedOrigins);
  const handler = cors({
    origin: (origin) => (allowed.has(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    maxAge: 600,
    credentials: false,
  });

  return async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined && !allowed.has(origin) && !SAFE_METHODS.has(c.req.method)) {
      throw new ForbiddenError('Origin not allowed', 'origin_not_allowed');
    }
    c.header('Vary', 'Origin', { append: true });
    return handler(c, next);
  };
}
