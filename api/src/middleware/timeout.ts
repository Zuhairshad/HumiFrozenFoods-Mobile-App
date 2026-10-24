import type { MiddlewareHandler } from 'hono';
import { RequestTimeoutError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

/**
 * Answers 504 when a handler exceeds the budget. This frees the client, but
 * JavaScript cannot cancel the handler: it keeps running until it settles, so
 * handlers doing I/O should also set their own timeouts (the Mongo client does).
 */
export function requestTimeout(ms: number): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new RequestTimeoutError());
      }, ms);
    });
    try {
      await Promise.race([next(), deadline]);
    } finally {
      clearTimeout(timer);
    }
  };
}
