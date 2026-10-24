import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';

/** Logs method, path (never the query string, which may carry tokens), status and latency. */
export function accessLog(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = performance.now();
    await next();
    c.get('logger').info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - started),
      },
      'request completed',
    );
  };
}
