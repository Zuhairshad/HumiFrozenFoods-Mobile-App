/**
 * LOCAL DEVELOPMENT MOCK SERVER. NEVER DEPLOY THIS.
 *
 * Runs the real API (real routes, real MongoDB driver, real pricing, real order mapper) against an in-memory MongoDB
 * seeded with the live product snapshot, with a fake payment gateway instead of Stripe, so the mobile app or a browser
 * can run a whole checkout without any external service:
 *
 *   npm run dev:mock            # http://localhost:3000 (PORT overrides), bound to 0.0.0.0
 *
 * It adds ONE route that does not exist in the production app: `POST /dev/pay/:orderId`, which simulates Stripe's
 * `payment_intent.succeeded` for that order by signing an event with the fake gateway and sending it through the real
 * `/v1/webhooks/stripe` route. That route is mounted only here, only when NODE_ENV !== 'production', and the
 * script refuses to start at all otherwise.
 *
 * Self-contained on purpose: this file is under src/ (so `tsc -p tsconfig.build.json` includes it) and therefore
 * must not import from tests/. mongodb-memory-server is a devDependency; production installs never reach this file.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import { type Db, type Document, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { type AppDeps, createApp } from '../app.js';
import { createGuestTokenService } from '../auth/guest-token.js';
import { parseKeyring } from '../auth/keyring.js';
import { type AppConfig, loadConfig } from '../config/env.js';
import { createDatabase, ensureIndexes } from '../db/client.js';
import type { FeatureDeps } from '../domain/ports.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { isObjectIdString } from '../lib/ids.js';
import { createLogger } from '../lib/logger.js';
import { MemoryRateLimitStore } from '../lib/rate-limit-store.js';
import { createFakeGateway } from '../payments/fake-gateway.js';
import { PAYMENT_SOURCE } from '../payments/stripe-event.js';
import { createMongoEnquiryRepository } from '../repositories/mongo-enquiries.js';
import { createMongoIdempotencyStore } from '../repositories/mongo-idempotency.js';
import { createMongoOrdersRepository } from '../repositories/mongo-orders.js';
import { createMongoProductsRepository } from '../repositories/mongo-products.js';
import { createMongoWebhookEventStore } from '../repositories/mongo-webhook-events.js';
import { mountV1 } from '../routes/v1.js';
import { addDays, londonTime } from '../services/checkout-slots.js';
import { createPricingService } from '../services/pricing.js';
import type { AppEnv } from '../types.js';

/** Fixed, public, worthless secrets: they only exist so the signed fake webhooks verify. */
export const DEV_WEBHOOK_SECRET = 'whsec_dev_mock_server_never_deploy';
const DEV_GUEST_KEY = Buffer.alloc(32, 'humi-dev-mock-never-deploy').toString('base64url');
const FIXTURE_URL = new URL('../../tests/fixtures/products.live.json', import.meta.url);

export class DevOnlyError extends Error {
  constructor() {
    super('dev-mock-server refuses to run with NODE_ENV=production. It is a local development tool and must never be deployed.');
    this.name = 'DevOnlyError';
  }
}

/** Throws unless this is clearly a non-production process. */
export function assertDevOnly(env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (env['NODE_ENV'] === 'production') throw new DevOnlyError();
}

export interface DevMockOptions {
  /** Default: PORT or 3000. */
  port?: number;
  /** Default true. Tests pass false and call `app.request` directly. */
  listen?: boolean;
  /** Default 'info'. */
  logLevel?: string;
  /** Pretty-print logs (pino-pretty). Default true when listening. */
  pretty?: boolean;
  /** Overrides for loadConfig (e.g. PROMO_CODES). */
  env?: Record<string, string>;
  /** Environment to check for the production refusal. Default process.env. */
  processEnv?: Readonly<Record<string, string | undefined>>;
}

export interface DevMock {
  app: Hono<AppEnv>;
  config: AppConfig;
  deps: FeatureDeps;
  db: Db;
  baseUrl: string | null;
  productCount: number;
  close(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The snapshot is API JSON; the real database holds ObjectIds and Dates. Everything else is kept verbatim. */
function toSiteShape(doc: Record<string, unknown>): Document {
  const out: Document = { ...doc };
  if (typeof doc['_id'] === 'string') out['_id'] = new ObjectId(doc['_id']);
  for (const key of ['createdAt', 'updatedAt']) {
    const value = doc[key];
    if (typeof value === 'string') out[key] = new Date(value);
  }
  if (Array.isArray(doc['categories'])) {
    out['categories'] = (doc['categories'] as unknown[]).map((c) => {
      if (!isRecord(c)) return c;
      const copy: Document = { ...c };
      if (typeof c['_id'] === 'string') copy['_id'] = new ObjectId(c['_id']);
      return copy;
    });
  }
  return out;
}

export function loadFixtureProducts(): Document[] {
  const file = JSON.parse(readFileSync(FIXTURE_URL, 'utf8')) as { results: Record<string, unknown>[] };
  return file.results.map(toSiteShape);
}

export async function startDevMock(options: DevMockOptions = {}): Promise<DevMock> {
  assertDevOnly(options.processEnv ?? process.env);

  const port = options.port ?? Number(process.env['PORT'] ?? 3000);
  const listen = options.listen ?? true;
  const mongod = await MongoMemoryServer.create();

  const config = loadConfig({
    NODE_ENV: 'development',
    MONGODB_URI: mongod.getUri(),
    MONGODB_DB: 'humis_dev',
    LOG_LEVEL: options.logLevel ?? 'info',
    PORT: String(port),
    // Expo web / Metro default origins. Native apps send no Origin and need no entry.
    ALLOWED_ORIGINS: 'http://localhost:8081,http://localhost:19006,http://localhost:3000',
    STRIPE_WEBHOOK_SECRET: DEV_WEBHOOK_SECRET,
    GUEST_TOKEN_KEYS: `dev:${DEV_GUEST_KEY}`,
    DELIVERY_FEE_PENCE: '799',
    FREE_DELIVERY_THRESHOLD_PENCE: '5000',
    MIN_ORDER_PENCE: '0',
    PROMO_CODES: JSON.stringify([
      { code: 'HUMI15', kind: 'percentage', value: 15 },
      { code: 'FREESHIP', kind: 'free_shipping' },
    ]),
    ...options.env,
  });

  const logger = createLogger({ level: config.logLevel, pretty: options.pretty ?? listen });
  const database = createDatabase({ uri: config.mongo.uri, dbName: config.mongo.db });
  const db = database.db();

  const products = loadFixtureProducts();
  await db.collection(config.business.collections.products).insertMany(products);
  // Same as `npm run db:indexes`: only the API's own collections. No orders are seeded.
  await ensureIndexes(db);

  const clock = { now: (): Date => new Date() };
  const keyring = config.guestToken.keyring ?? parseKeyring(`dev:${DEV_GUEST_KEY}`);
  const guestTokens = createGuestTokenService({ keyring, ttlSeconds: config.guestToken.ttlSeconds });
  const rateLimitStore = new MemoryRateLimitStore();
  const gateway = createFakeGateway({ webhookSecret: DEV_WEBHOOK_SECRET });
  const business = config.business;
  const productsRepo = createMongoProductsRepository(db, business, { logger, clock });
  const deps: FeatureDeps = {
    config,
    logger,
    clock,
    products: productsRepo,
    orders: createMongoOrdersRepository(db, business, clock, logger),
    idempotency: createMongoIdempotencyStore(db),
    enquiries: createMongoEnquiryRepository(db, clock),
    webhookEvents: createMongoWebhookEventStore(db),
    payments: gateway,
    pricing: createPricingService({ products: productsRepo, business, clock }),
    guestTokens,
    rateLimitStore,
  };
  const appDeps: AppDeps = { config, logger, database, rateLimitStore, guestTokens };
  const ipSalt = keyring.hmac(keyring.activeKid, 'humi:enquiry-ip-salt')?.toString('hex') ?? 'dev-salt';

  const mountProduction = mountV1(deps, { ipSalt });
  const app: Hono<AppEnv> = createApp(appDeps, (target, appDepsArg) => {
    mountProduction(target, appDepsArg);

    // DEV ONLY. Mounted here and nowhere else; also a no-op (404) if NODE_ENV is ever production.
    target.post('/dev/pay/:orderId', async (c) => {
      if (config.isProduction) throw new NotFoundError();
      const orderId = c.req.param('orderId');
      const order = isObjectIdString(orderId) ? await deps.orders.findById(orderId) : null;
      if (!order?.createdByApp) throw new NotFoundError('Order not found');
      if (order.paymentIntentId === null) throw new ConflictError('Order has no payment intent yet', 'conflict');

      const raw = JSON.stringify({
        id: `evt_dev_${randomUUID()}`,
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: order.paymentIntentId,
            object: 'payment_intent',
            amount: order.pricing.totalPence,
            amount_received: order.pricing.totalPence,
            currency: 'gbp',
            metadata: { orderId: order.orderId, orderNumber: order.orderNumber, source: PAYMENT_SOURCE },
          },
        },
      });
      // Through the real route and middleware, exactly as Stripe would call it.
      const response = await app.request('/v1/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': gateway.sign(raw) },
        body: raw,
      });
      const webhook: unknown = await response.json();
      const after = await deps.orders.findById(order.orderId);
      return c.json(
        {
          dev: true,
          orderId: order.orderId,
          orderNumber: order.orderNumber,
          webhook: { status: response.status, body: webhook },
          status: after?.status ?? null,
          paymentStatus: after?.paymentStatus ?? null,
        },
        response.status === 200 ? 200 : 502,
      );
    });
  });

  let server: ReturnType<typeof serve> | undefined;
  let baseUrl: string | null = null;
  if (listen) {
    await new Promise<void>((resolve) => {
      server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info: AddressInfo) => {
        baseUrl = `http://localhost:${String(info.port)}`;
        resolve();
      });
    });
  }

  return {
    app,
    config,
    deps,
    db,
    baseUrl,
    productCount: products.length,
    async close() {
      if (server) await new Promise<void>((resolve) => server?.close(() => { resolve(); }));
      await database.close();
      await mongod.stop();
    },
  };
}

function banner(baseUrl: string): string {
  const bar = '!'.repeat(78);
  const tomorrow = addDays(londonTime(new Date()).dateKey, 1);
  const body = JSON.stringify({
    lines: [{ productId: 'aloo-tikki', quantity: 2 }],
    promoCode: 'HUMI15',
    contact: { name: 'Dev Tester', email: 'dev@example.com', phone: '07700 900123' },
    address: { line1: '1 Test Street', city: 'London', postcode: 'SW1A 1AA' },
    slot: { date: tomorrow, window: 'afternoon' },
  });
  return [
    bar,
    '!!  HUMI API - LOCAL DEV MOCK SERVER.  DO NOT DEPLOY.  DO NOT EXPOSE TO THE INTERNET.',
    '!!  In-memory database, FAKE payments (no Stripe), and a /dev/pay route that marks',
    '!!  any order as paid with no card. It exists only so the app can be developed offline.',
    bar,
    '',
    `Base URL (use as EXPO_PUBLIC_API_BASE_URL): ${baseUrl}`,
    '  Android emulator: http://10.0.2.2:' + new URL(baseUrl).port + '   |   physical device: http://<this machine LAN IP>:' + new URL(baseUrl).port,
    '',
    'Smoke test:',
    `  curl -s ${baseUrl}/v1/config`,
    `  curl -s '${baseUrl}/v1/products?limit=3'`,
    `  curl -s -X POST ${baseUrl}/v1/checkout/payment-intent \\`,
    `    -H 'content-type: application/json' -H "Idempotency-Key: $(uuidgen)" \\`,
    `    -d '${body}'`,
    `  # then simulate Stripe confirming the payment for the returned orderId:`,
    `  curl -s -X POST ${baseUrl}/dev/pay/<orderId>`,
    `  curl -s ${baseUrl}/v1/orders/<orderId> -H "Authorization: Bearer <guestToken>"`,
    '',
    'Promo codes: HUMI15 (15% off), FREESHIP.  Delivery 7.99, free from 50.00.',
    'Note: payment-intent is limited to 10 requests/minute per IP, like production.',
    'Ctrl+C to stop; all data is discarded on exit.',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  try {
    assertDevOnly();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  console.log('Starting in-memory MongoDB (the first run downloads the binary if it is not cached)...');
  const mock = await startDevMock();
  console.log(banner(mock.baseUrl ?? ''));
  console.log(`Seeded ${String(mock.productCount)} products, 0 orders.\n`);

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    console.log('\nShutting down dev mock server...');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    mock.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// Run only when executed directly (tsx src/scripts/dev-mock-server.ts), not when imported by a test.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
