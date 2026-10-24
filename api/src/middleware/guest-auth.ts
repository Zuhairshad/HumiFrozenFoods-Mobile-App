import type { MiddlewareHandler } from 'hono';
import type { GuestTokenService } from '../auth/guest-token.js';
import { UnauthorizedError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

const BEARER = /^Bearer ([A-Za-z0-9._-]+)$/;

/**
 * Requires a valid guest-order token in `Authorization: Bearer` that was issued
 * for the order id in the `orderParam` route parameter. Every failure is the same 401, so
 * callers cannot learn whether an order exists or why a token was refused.
 */
export function requireGuestOrderToken(
  service: GuestTokenService,
  orderParam = 'orderId',
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization');
    const token = header ? BEARER.exec(header)?.[1] : undefined;
    const orderId = c.req.param(orderParam);
    const result = token && orderId ? service.verify(token, orderId) : undefined;
    if (!result?.ok) {
      if (result) c.get('logger').info({ reason: result.reason }, 'guest token rejected');
      throw new UnauthorizedError('Invalid or expired access token', 'invalid_token');
    }
    await next();
  };
}
