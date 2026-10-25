import { Hono } from 'hono';
import { z } from 'zod';
import type { FeatureDeps } from '../domain/ports.js';
import { jsonBody } from '../lib/validation.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { AppEnv } from '../types.js';

const MAX_LINES = 30;
const MAX_PER_PRODUCT = 20;

const lineSchema = z.strictObject({
  productId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Invalid product id'),
  quantity: z.number().int().min(1).max(MAX_PER_PRODUCT),
});

export const quoteBodySchema = z
  .strictObject({
    lines: z.array(lineSchema).max(MAX_LINES),
    promoCode: z
      .string()
      .trim()
      .max(32)
      .regex(/^[A-Za-z0-9_-]*$/, 'Invalid promo code')
      .optional(),
  })
  .superRefine((body, ctx) => {
    const totals = new Map<string, number>();
    body.lines.forEach((line, index) => {
      const total = (totals.get(line.productId) ?? 0) + line.quantity;
      totals.set(line.productId, total);
      if (total > MAX_PER_PRODUCT && total - line.quantity <= MAX_PER_PRODUCT) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', index, 'quantity'],
          message: `At most ${String(MAX_PER_PRODUCT)} of each product`,
        });
      }
    });
  });

export function quoteRoutes(deps: FeatureDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post(
    '/checkout/quote',
    rateLimit({ store: deps.rateLimitStore, name: 'quote', limit: 60, windowMs: 60_000 }),
    jsonBody(quoteBodySchema),
    async (c) => {
      const body = c.req.valid('json');
      const result = await deps.pricing.quote({ lines: body.lines, promoCode: body.promoCode });
      const { promo, ...rest } = result;
      return c.json(promo ? { ...rest, promo } : rest);
    },
  );

  return routes;
}
