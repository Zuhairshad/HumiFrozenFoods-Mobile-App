import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Hono } from 'hono';
import type { MongoClient} from 'mongodb';
import { type Collection, type CommandStartedEvent, type Db, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app.js';
import { createGuestTokenService, type GuestTokenService } from '../../src/auth/guest-token.js';
import { Keyring } from '../../src/auth/keyring.js';
import { createDatabase, ensureIndexes } from '../../src/db/client.js';
import { defaultIndexes } from '../../src/db/indexes.js';
import type { FeatureDeps } from '../../src/domain/ports.js';
import { createLogger } from '../../src/lib/logger.js';
import { MemoryRateLimitStore } from '../../src/lib/rate-limit-store.js';
import { createFakeGateway, type FakeGateway } from '../../src/payments/fake-gateway.js';
import { createMongoEnquiryRepository } from '../../src/repositories/mongo-enquiries.js';
import { createMongoIdempotencyStore } from '../../src/repositories/mongo-idempotency.js';
import { createMongoOrdersRepository } from '../../src/repositories/mongo-orders.js';
import { createMongoProductsRepository } from '../../src/repositories/mongo-products.js';
import { createMongoWebhookEventStore } from '../../src/repositories/mongo-webhook-events.js';
import { mountV1 } from '../../src/routes/v1.js';
import { createPricingService } from '../../src/services/pricing.js';
import type { AppEnv } from '../../src/types.js';
import { Secret } from '../../src/lib/secret.js';
import { captureLogs, testConfig } from '../unit/helpers.js';

/** Monday 26 Oct 2026, 09:00 London (GMT after the clock change). */
export const NOW = new Date('2026-10-26T09:00:00Z');
export const SLOT = { date: '2026-10-27', window: 'afternoon' } as const;

interface FixtureProduct {
  _id: string;
  slug: string;
  [key: string]: unknown;
}

const FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/products.live.json', import.meta.url), 'utf8')) as {
  results: FixtureProduct[];
};
export const LIVE_PRODUCTS = FIXTURE.results;

export interface MongoFixture {
  server: MongoMemoryServer;
  client: MongoClient;
  db: Db;
  commands: CommandStartedEvent[];
  stop(): Promise<void>;
}

export async function startMongo(): Promise<MongoFixture> {
  const server = await MongoMemoryServer.create();
  const commands: CommandStartedEvent[] = [];
  let captured: MongoClient | undefined;
  // The production client factory, so the connection options under test are the real ones.
  const database = createDatabase({
    uri: secretOf(server.getUri()),
    dbName: 'security_test',
    clientOptions: { monitorCommands: true },
    onClient: (c) => {
      captured = c;
      c.on('commandStarted', (event) => {
        commands.push(event);
      });
    },
  });
  const client = captured as MongoClient;
  await client.connect();
  const db = database.db();
  await ensureIndexes(db, defaultIndexes);
  return {
    server,
    client,
    db,
    commands,
    async stop() {
      await client.close();
      await server.stop();
    },
  };
}

export async function seedProducts(db: Db, collection = 'products'): Promise<void> {
  const docs = LIVE_PRODUCTS.map((p) => ({ ...p, _id: new ObjectId(p._id) }));
  await db.collection(collection).deleteMany({});
  await db.collection(collection).insertMany(docs);
}

export interface Harness {
  app: Hono<AppEnv>;
  deps: FeatureDeps;
  db: Db;
  gateway: FakeGateway;
  guestTokens: GuestTokenService;
  logs: ReturnType<typeof captureLogs>;
  orders: Collection;
  /** Fires a request through the in-process app. `ip` becomes the socket address (default: a fresh one per call). */
  call(path: string, init?: RequestInit, ip?: string): Promise<Response>;
  /** Valid checkout body. Override pieces with `over`. */
  checkoutBody(over?: Record<string, unknown>): Record<string, unknown>;
  /** Creates a real order through the API and returns the parsed 201 response. */
  placeOrder(over?: Record<string, unknown>, key?: string, ip?: string): Promise<PlacedOrder>;
  sign(body: string, timestamp?: number): string;
  webhook(event: Record<string, unknown>, ip?: string): Promise<Response>;
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  guestToken: string;
  clientSecret: string;
  key: string;
  body: Record<string, unknown>;
  status: number;
}

let ipCounter = 0;
export const freshIp = (): string => {
  ipCounter += 1;
  return `10.${String((ipCounter >> 16) & 255)}.${String((ipCounter >> 8) & 255)}.${String(ipCounter & 255)}`;
};

export interface HarnessOptions {
  env?: Record<string, string>;
  logLevel?: string;
  keyring?: Keyring;
  ttlSeconds?: number;
}

export function buildHarness(mongo: MongoFixture, options: HarnessOptions = {}): Harness {
  const logs = captureLogs();
  const logger = createLogger({ level: options.logLevel ?? 'trace', destination: logs.stream });
  const config = testConfig({
    PROMO_CODES: JSON.stringify([
      { code: 'HUMI15', kind: 'percentage', value: 15 },
      { code: 'FIVER', kind: 'fixed', value: 500 },
      { code: 'SHIPFREE', kind: 'free_shipping' },
      { code: 'BIG', kind: 'percentage', value: 100 },
    ]),
    ...options.env,
  });
  const clock = { now: () => NOW };
  const gateway = createFakeGateway({ now: () => NOW.getTime() });
  const guestTokens = createGuestTokenService({
    keyring: options.keyring ?? new Keyring([['k1', randomBytes(32)]]),
    ttlSeconds: options.ttlSeconds ?? 3600,
    now: () => NOW.getTime(),
  });
  const products = createMongoProductsRepository(mongo.db, config.business, { logger, clock });
  const rateLimitStore = new MemoryRateLimitStore();
  const deps: FeatureDeps = {
    config,
    logger,
    clock,
    products,
    orders: createMongoOrdersRepository(mongo.db, config.business, clock, logger),
    idempotency: createMongoIdempotencyStore(mongo.db),
    enquiries: createMongoEnquiryRepository(mongo.db, clock),
    webhookEvents: createMongoWebhookEventStore(mongo.db),
    payments: gateway,
    pricing: createPricingService({ products, business: config.business, clock }),
    guestTokens,
    rateLimitStore,
  };
  const app = createApp(
    {
      config,
      logger,
      database: { ping: () => mongo.db.command({ ping: 1 }).then(() => undefined) },
      rateLimitStore,
      guestTokens,
    },
    mountV1(deps, { ipSalt: 'test-salt' }),
  );

  const call: Harness['call'] = (path, init, ip) =>
    Promise.resolve(app.request(path, init, { incoming: { socket: { remoteAddress: ip ?? freshIp() } } }));

  const checkoutBody: Harness['checkoutBody'] = (over = {}) => ({
    lines: [{ productId: 'chicken-samosa-large', quantity: 2 }],
    contact: { name: 'Asha Patel', email: 'asha@example.com', phone: '07123 456789' },
    address: { line1: '1 High Street', city: 'London', postcode: 'sw1a 1aa' },
    slot: SLOT,
    ...over,
  });

  const newKey = (): string => crypto.randomUUID();

  const placeOrder: Harness['placeOrder'] = async (over, key = newKey(), ip) => {
    const res = await call(
      '/v1/checkout/payment-intent',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(checkoutBody(over)),
      },
      ip,
    );
    const body = (await res.json()) as Record<string, unknown>;
    return {
      orderId: String(body.orderId),
      orderNumber: String(body.orderNumber),
      guestToken: String(body.guestToken),
      clientSecret: String(body.clientSecret),
      key,
      body,
      status: res.status,
    };
  };

  const webhook: Harness['webhook'] = (event, ip) => {
    const raw = JSON.stringify(event);
    return call(
      '/v1/webhooks/stripe',
      { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': gateway.sign(raw) }, body: raw },
      ip,
    );
  };

  return {
    app,
    deps,
    db: mongo.db,
    gateway,
    guestTokens,
    logs,
    orders: mongo.db.collection(config.business.collections.orders),
    call,
    checkoutBody,
    placeOrder,
    sign: (body, timestamp) => gateway.sign(body, timestamp),
    webhook,
  };
}

export function succeededEvent(
  id: string,
  placed: { orderId: string; orderNumber: string },
  intentId: string,
  overrides: { amount?: number; currency?: string; metadata?: Record<string, string> } = {},
): Record<string, unknown> {
  return {
    id,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: intentId,
        amount_received: overrides.amount ?? 0,
        currency: overrides.currency ?? 'gbp',
        metadata: overrides.metadata ?? { orderId: placed.orderId, orderNumber: placed.orderNumber, source: 'humi-mobile-app' },
      },
    },
  };
}

/** Walks a JSON value and yields every key and every string leaf, for leak scans. */
export function walk(value: unknown, visit: (key: string | null, leaf: unknown, path: string) => void, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, visit, `${path}[${String(index)}]`);
    });
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child, `${path}.${key}`);
      walk(child, visit, `${path}.${key}`);
    }
  } else {
    visit(null, value, path);
  }
}

export const secretOf = (value: string): Secret => new Secret(value);
