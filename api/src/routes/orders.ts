import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { GuestTokenService } from '../auth/guest-token.js';
import type { FeatureDeps } from '../domain/ports.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { isObjectIdString } from '../lib/ids.js';
import { jsonBody } from '../lib/validation.js';
import { requireGuestOrderToken } from '../middleware/guest-auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { contactMatches, DUMMY_CONTACT, phoneDigits } from '../orders/contact-match.js';
import { ORDER_NUMBER_PATTERN } from '../orders/order-number.js';
import { toPublicOrder } from '../orders/public-order.js';
import type { AppEnv } from '../types.js';

const BEARER = /^Bearer ([A-Za-z0-9._-]+)$/;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export const lookupSchema = z
  .strictObject({
    orderNumber: z.string().trim().regex(ORDER_NUMBER_PATTERN, 'Enter a valid order number'),
    email: z.string().trim().max(254).pipe(z.email()).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+() -]{7,20}$/, 'Enter a valid phone number')
      .refine((p) => phoneDigits(p).length >= 7, 'Enter a valid phone number')
      .optional(),
  })
  .refine((body) => body.email !== undefined || body.phone !== undefined, {
    message: 'Provide an email or phone number',
    path: ['email'],
  });

/**
 * The shared guest middleware answers 401 for every failure, including a valid token for a different order.
 * The contract wants 403 there. This runs first and only turns that one case into 403; it needs a validly
 * signed token, so it reveals nothing to anyone who does not already hold one.
 */
function rejectTokenForOtherOrder(service: GuestTokenService): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = BEARER.exec(c.req.header('authorization') ?? '')?.[1];
    if (token) {
      const result = service.verify(token);
      if (result.ok && result.orderId !== c.req.param('orderId')) {
        throw new ForbiddenError('This access token is for a different order', 'wrong_order');
      }
    }
    await next();
  };
}

/**
 * Lookup policy: only orders this API created (`createdByApp`) can be found. A website customer's order
 * is answered exactly like a missing one, so the endpoint cannot harvest the website's customers or confirm
 * that their order numbers exist.
 */
export function ordersRoutes(deps: FeatureDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get(
    '/orders/:orderId',
    rejectTokenForOtherOrder(deps.guestTokens),
    requireGuestOrderToken(deps.guestTokens),
    async (c) => {
      const orderId = c.req.param('orderId');
      // The token already matched this id, so a malformed or unknown id is simply "not found".
      const order = isObjectIdString(orderId) ? await deps.orders.findById(orderId) : null;
      if (!order?.createdByApp) throw new NotFoundError('Order not found');
      return c.json(toPublicOrder(order));
    },
  );

  const perIp = rateLimit({
    store: deps.rateLimitStore,
    name: 'orders:lookup:ip',
    limit: 5,
    windowMs: MINUTE_MS,
    failOpen: false,
  });

  app.post('/orders/lookup', perIp, jsonBody(lookupSchema), async (c) => {
    const body = c.req.valid('json');

    // Budget per order number stops a distributed guesser even when it rotates IPs.
    await rateLimit({
      store: deps.rateLimitStore,
      name: 'orders:lookup:number',
      limit: 10,
      windowMs: HOUR_MS,
      failOpen: false,
      key: () => body.orderNumber,
    })(c, () => Promise.resolve());

    const order = await deps.orders.findByOrderNumber(body.orderNumber);
    // Always compare, against a dummy when nothing was found, so a miss costs what a mismatch costs.
    const matched = contactMatches(body, order ? order.contact : DUMMY_CONTACT);
    if (!order || !order.createdByApp || !matched) throw new NotFoundError('Order not found');

    const { token } = deps.guestTokens.issue(order.orderId);
    return c.json({ orderId: order.orderId, guestToken: token });
  });

  return app;
}
