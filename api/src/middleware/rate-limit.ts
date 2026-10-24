import type { Context, MiddlewareHandler } from 'hono';
import { RateLimitedError } from '../lib/errors.js';
import type { RateLimitStore } from '../lib/rate-limit-store.js';
import type { AppEnv } from '../types.js';

export interface RateLimitOptions {
  store: RateLimitStore;
  /** Namespaces the counter, so each route gets its own budget. */
  name: string;
  limit: number;
  windowMs: number;
  /** Defaults to the resolved client IP. */
  key?: (c: Context<AppEnv>) => string;
  /** Allow traffic when the store errors (default). Set false on routes where abuse costs money. */
  failOpen?: boolean;
  now?: () => number;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  const { store, name, limit, windowMs } = options;
  const failOpen = options.failOpen ?? true;
  const now = options.now ?? Date.now;

  return async (c, next) => {
    const subject = options.key ? options.key(c) : c.get('clientIp');
    let hit;
    try {
      hit = await store.hit(`${name}:${subject}`, windowMs);
    } catch (error) {
      c.get('logger').error({ err: error, limiter: name }, 'rate limit store failed');
      if (failOpen) return next();
      throw error;
    }

    const resetSeconds = Math.max(1, Math.ceil((hit.resetAtMs - now()) / 1000));
    c.header('RateLimit-Limit', String(limit));
    c.header('RateLimit-Remaining', String(Math.max(0, limit - hit.count)));
    c.header('RateLimit-Reset', String(resetSeconds));
    if (hit.count > limit) throw new RateLimitedError(resetSeconds);
    await next();
  };
}
