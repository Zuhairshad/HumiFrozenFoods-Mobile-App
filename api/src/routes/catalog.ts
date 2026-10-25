import { createHash } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { COLLECTION_IDS, COLLECTION_TITLES } from '../catalog/collections.js';
import { MAX_CURSOR_LENGTH } from '../catalog/cursor.js';
import { toPublicProduct } from '../catalog/product-mapper.js';
import type { FeatureDeps } from '../domain/ports.js';
import { NotFoundError } from '../lib/errors.js';
import { pathParams, queryParams } from '../lib/validation.js';
import type { AppEnv } from '../types.js';

const CACHE_CONFIG = 'public, max-age=60';
const CACHE_CATALOG = 'public, max-age=60, stale-while-revalidate=300';

/** Mirrors DELIVERY_WINDOWS in the app (src/features/checkout/slots.ts); ids must match the Slot.window enum. */
const SLOT_WINDOWS = [
  { id: 'morning', label: 'Morning', range: '8am-12pm' },
  { id: 'afternoon', label: 'Afternoon', range: '12pm-5pm' },
  { id: 'evening', label: 'Evening', range: '5pm-9pm' },
] as const;

const DEFAULT_LIMIT = 50;
const MAX_Q = 60;

const productsQuery = z.strictObject({
  collection: z.enum(COLLECTION_IDS).optional(),
  q: z
    .string()
    .max(500)
    .transform((value) => value.trim())
    .pipe(z.string().max(MAX_Q, `Search text must be at most ${String(MAX_Q)} characters`).regex(/^[^\p{Cc}]*$/u, 'Search text contains control characters'))
    .optional(),
  limit: z
    .string()
    .regex(/^\d{1,3}$/, 'limit must be a whole number from 1 to 100')
    .transform(Number)
    .pipe(z.number().int().min(1, 'limit must be at least 1').max(100, 'limit must be at most 100'))
    .default(DEFAULT_LIMIT),
  cursor: z
    .string()
    .max(MAX_CURSOR_LENGTH)
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid cursor')
    .optional(),
});

const productParams = z.strictObject({ idOrSlug: z.string().min(1).max(100) });

function etagFor(body: string): string {
  return `W/"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
}

function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  if (header.trim() === '*') return true;
  const strip = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((candidate) => strip(candidate) === strip(etag));
}

/** JSON with a validator: identical bodies get the same ETag, so clients revalidate with a cheap 304. */
function cachedJson(c: Context<AppEnv>, payload: unknown, cacheControl: string): Response {
  const body = JSON.stringify(payload);
  const etag = etagFor(body);
  const headers = { 'Cache-Control': cacheControl, ETag: etag };
  if (matchesIfNoneMatch(c.req.header('if-none-match'), etag)) return c.body(null, 304, headers);
  return c.body(body, 200, { ...headers, 'Content-Type': 'application/json; charset=UTF-8' });
}

export function catalogRoutes(deps: FeatureDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();
  const { business } = deps.config;

  routes.get('/config', (c) =>
    cachedJson(
      c,
      {
        currency: 'gbp',
        delivery: {
          feePence: business.delivery.feePence,
          freeThresholdPence: business.delivery.freeThresholdPence,
          minOrderPence: business.delivery.minOrderPence,
        },
        promo: { enabled: business.promoCodes.length > 0 },
        payments: { provider: 'stripe', enabled: deps.payments.enabled },
        lowStockThreshold: business.lowStockThreshold,
        slotWindows: SLOT_WINDOWS,
      },
      CACHE_CONFIG,
    ),
  );

  routes.get('/products', queryParams(productsQuery), async (c) => {
    const { collection, q, limit, cursor } = c.req.valid('query');
    const page = await deps.products.list({
      limit,
      ...(collection === undefined ? {} : { collection }),
      ...(q === undefined || q === '' ? {} : { q }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    return cachedJson(c, { items: page.items.map(toPublicProduct), nextCursor: page.nextCursor }, CACHE_CATALOG);
  });

  routes.get('/products/:idOrSlug', pathParams(productParams), async (c) => {
    const { idOrSlug } = c.req.valid('param');
    const product = await deps.products.findByIdOrSlug(idOrSlug);
    if (!product) throw new NotFoundError('Product not found');
    return cachedJson(c, toPublicProduct(product), CACHE_CATALOG);
  });

  routes.get('/collections', async (c) => {
    const counts = await deps.products.countByCollection();
    const items = COLLECTION_IDS.filter((id) => id !== 'other' || counts[id] > 0).map((id) => ({
      id,
      title: COLLECTION_TITLES[id],
      productCount: counts[id],
    }));
    return cachedJson(c, { items }, CACHE_CATALOG);
  });

  return routes;
}
