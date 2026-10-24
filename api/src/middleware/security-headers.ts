import type { MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from '../types.js';

/**
 * Strict headers for a JSON-only API: nothing it returns should ever be
 * rendered, framed or cached by intermediaries by default.
 */
export function securityHeaders(): MiddlewareHandler<AppEnv> {
  const secure = secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] },
    strictTransportSecurity: 'max-age=63072000; includeSubDomains',
    referrerPolicy: 'no-referrer',
    xFrameOptions: 'DENY',
    crossOriginResourcePolicy: 'same-site',
  });
  return async (c, next) => {
    await secure(c, async () => {
      await next();
    });
    c.header('X-Content-Type-Options', 'nosniff');
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
  };
}
