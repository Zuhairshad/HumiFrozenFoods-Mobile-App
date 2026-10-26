import { Hono } from 'hono';
import type { FeatureDeps } from '../domain/ports.js';
import { ValidationError } from '../lib/errors.js';
import { jsonBody } from '../lib/validation.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { IDEMPOTENCY_KEY_PATTERN, paymentIntentBodySchema } from '../services/checkout-schema.js';
import { type CheckoutOptions, createCheckoutService } from '../services/checkout.js';
import type { AppEnv } from '../types.js';

export function paymentIntentRoutes(deps: FeatureDeps, options?: CheckoutOptions): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const checkout = createCheckoutService(deps, options);

  routes.post(
    '/checkout/payment-intent',
    // Each call can create a Stripe object, so fail closed if the limiter store is down.
    rateLimit({ store: deps.rateLimitStore, name: 'payment-intent', limit: 10, windowMs: 60_000, failOpen: false }),
    jsonBody(paymentIntentBodySchema),
    async (c) => {
      const key = c.req.header('idempotency-key')?.trim();
      if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
        throw new ValidationError([{ path: 'Idempotency-Key', message: 'Header must be a UUID v4' }]);
      }
      const result = await checkout.createPaymentIntent(c.req.valid('json'), key);
      if (result.replay) c.header('Idempotent-Replay', 'true');
      return c.json(result.body, result.status);
    },
  );

  return routes;
}
