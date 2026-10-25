import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { BSON, type Db, type Document, MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Hono } from 'hono';
import { type AppDeps, createApp } from '../../src/app.js';
import { createGuestTokenService } from '../../src/auth/guest-token.js';
import { parseKeyring } from '../../src/auth/keyring.js';
import { type AppConfig, loadConfig } from '../../src/config/env.js';
import { createDatabase, type Database, ensureIndexes } from '../../src/db/client.js';
import type { FeatureDeps, PaymentGateway } from '../../src/domain/ports.js';
import { createLogger } from '../../src/lib/logger.js';
import { MemoryRateLimitStore } from '../../src/lib/rate-limit-store.js';
import { createFakeGateway, type FakeGateway } from '../../src/payments/fake-gateway.js';
import { createDisabledGateway } from '../../src/payments/stripe-gateway.js';
import { PAYMENT_SOURCE } from '../../src/payments/stripe-event.js';
import { createMongoEnquiryRepository } from '../../src/repositories/mongo-enquiries.js';
import { createMongoIdempotencyStore } from '../../src/repositories/mongo-idempotency.js';
import { createMongoOrdersRepository } from '../../src/repositories/mongo-orders.js';
import { createMongoProductsRepository } from '../../src/repositories/mongo-products.js';
import { createMongoWebhookEventStore } from '../../src/repositories/mongo-webhook-events.js';
import { mountV1 } from '../../src/routes/v1.js';
import { addDays, londonTime } from '../../src/services/checkout-slots.js';
import { createPricingService } from '../../src/services/pricing.js';
import type { AppEnv } from '../../src/types.js';
import { DEFAULT_START, FakeClock } from './clock.js';
import { extraProduct, loadProductFixture, seedDatabase } from './seed.js';
import type { CheckoutBody, WebhookAck } from './types.js';

export const WEBHOOK_SECRET = 'whsec_e2e_test_secret';
export const GUEST_TOKEN_TTL_SECONDS = 3600;
export const PROMO_CODES = [
  { code: 'HUMI15', kind: 'percentage', value: 15 },
  { code: 'FREESHIP', kind: 'free_shipping' },
  { code: 'FIVEOFF', kind: 'fixed', value: 500 },
  { code: 'BIGSPEND', kind: 'fixed', value: 1000, minSubtotalPence: 10_000 },
  { code: 'EXPIRED5', kind: 'percentage', value: 5, expiresAt: '2030-03-04T08:00:00.000Z' },
  { code: 'SOON10', kind: 'percentage', value: 10, expiresAt: '2030-03-04T10:00:00.000Z' },
];

export interface HarnessOptions {
  /** Extra/overriding environment for loadConfig. */
  env?: Record<string, string>;
  /** `disabled` uses the production disabled gateway (Stripe not configured). Default `fake`. */
  payments?: 'fake' | 'disabled';
}

/** Failure injection for the gateway wrapper. */
export interface GatewayControl {
  failCreate: Error | null;
  failCancel: Error | null;
}

export interface RequestOptions {
  json?: unknown;
  /** Raw string body (used by webhooks, where the exact bytes are signed). */
  body?: string;
  headers?: Record<string, string>;
  /** Client IP seen by the app. Default: a fresh address per call so per-IP limits never interfere. */
  ip?: string;
  /** Sent as `Authorization: Bearer`. */
  token?: string;
  idempotencyKey?: string;
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  text: string;
  json<T = unknown>(): T;
}

export interface ProductPatch {
  [field: string]: unknown;
}

const FIXTURE_IDS = (): ObjectId[] => loadProductFixture().map((p) => p['_id'] as ObjectId);

const sha256 = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');

export interface IndexSummary {
  [collection: string]: { name: string; key: Record<string, unknown>; unique: boolean; ttl: number | null }[];
}

export class Harness {
  #ip = 0;
  #seededOrderHashes = new Map<string, string>();
  #seededProductHashes = new Map<string, string>();
  #indexBaseline: IndexSummary = {};

  constructor(
    readonly clock: FakeClock,
    readonly control: GatewayControl,
    /** All pino lines written during the run (level, msg, ...). */
    readonly logLines: Record<string, unknown>[],
    readonly server: MongoMemoryServer,
    readonly database: Database,
    readonly rawClient: MongoClient,
    readonly app: Hono<AppEnv>,
    readonly deps: FeatureDeps,
    readonly appDeps: AppDeps,
    readonly config: AppConfig,
    readonly gateway: FakeGateway,
  ) {}

  get db(): Db {
    return this.database.db();
  }

  /* ----------------------------- HTTP ----------------------------- */

  nextIp(): string {
    this.#ip += 1;
    return `10.${String(Math.floor(this.#ip / 65_536) % 256)}.${String(Math.floor(this.#ip / 256) % 256)}.${String(this.#ip % 256)}`;
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = { 'x-real-ip': options.ip ?? this.nextIp(), ...options.headers };
    let body: string | undefined;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers['content-type'] ??= 'application/json';
    } else if (options.body !== undefined) {
      body = options.body;
      headers['content-type'] ??= 'application/json';
    }
    if (options.token !== undefined) headers['authorization'] = `Bearer ${options.token}`;
    if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
    const response = await this.app.request(path, { method, headers, ...(body === undefined ? {} : { body }) });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      text,
      json: <T>() => JSON.parse(text) as T,
    };
  }

  get(path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    return this.request('GET', path, options);
  }

  post(path: string, json: unknown, options: RequestOptions = {}): Promise<ApiResponse> {
    return this.request('POST', path, { ...options, json });
  }

  /* --------------------------- checkout --------------------------- */

  /** YYYY-MM-DD in Europe/London, `daysAhead` after the fake clock's today. */
  slotDate(daysAhead = 1): string {
    return addDays(londonTime(this.clock.now()).dateKey, daysAhead);
  }

  checkoutBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      lines: [
        { productId: 'aloo-tikki', quantity: 2 },
        { productId: 'chicken-seekh-kebab', quantity: 1 },
      ],
      contact: { name: 'Asha Patel', email: 'Asha.Patel@Example.com', phone: '07700 900123' },
      address: { line1: '12 Baker Street', line2: 'Flat 3', city: 'London', postcode: 'sw1a 1aa' },
      slot: { date: this.slotDate(1), window: 'afternoon' },
      notes: 'Leave with the neighbour',
      ...overrides,
    };
  }

  async checkout(
    overrides: Record<string, unknown> = {},
    options: RequestOptions = {},
  ): Promise<{ res: ApiResponse; key: string; body: Record<string, unknown> }> {
    const key = options.idempotencyKey ?? randomUUID();
    const body = this.checkoutBody(overrides);
    const res = await this.post('/v1/checkout/payment-intent', body, { ...options, idempotencyKey: key });
    return { res, key, body };
  }

  /** Creates an order and asserts it succeeded; returns the parsed 201 body. */
  async createOrder(overrides: Record<string, unknown> = {}, options: RequestOptions = {}): Promise<CheckoutBody & { key: string }> {
    const { res, key } = await this.checkout(overrides, options);
    if (res.status !== 201) throw new Error(`createOrder expected 201 but got ${String(res.status)}: ${res.text}`);
    return { ...res.json<CheckoutBody>(), key };
  }

  /* ----------------------------- orders DB ----------------------------- */

  orderDoc(orderId: string): Promise<Document | null> {
    return this.db.collection('orders').findOne({ _id: new ObjectId(orderId) });
  }

  async requireOrderDoc(orderId: string): Promise<Document> {
    const doc = await this.orderDoc(orderId);
    if (!doc) throw new Error(`order ${orderId} not found in database`);
    return doc;
  }

  countAppOrders(filter: Document = {}): Promise<number> {
    return this.db.collection('orders').countDocuments({ 'app_meta.source': 'mobile-app', ...filter });
  }

  countOrders(): Promise<number> {
    return this.db.collection('orders').countDocuments({});
  }

  /** Simulates staff changing an order in the website admin portal. */
  async staffSetOrderStatus(orderId: string, orderStatus: string): Promise<void> {
    await this.db.collection('orders').updateOne({ _id: new ObjectId(orderId) }, { $set: { order_status: orderStatus } });
  }

  /* ----------------------------- webhooks ----------------------------- */

  /** A Stripe-shaped event for one of our orders. `object` overrides are merged over sensible defaults. */
  paymentEvent(
    type: 'payment_intent.succeeded' | 'payment_intent.payment_failed' | 'payment_intent.canceled',
    order: { orderId: string; orderNumber: string; pricing: { totalPence: number } },
    options: { id?: string; intentId?: string; amount?: number; currency?: string; metadata?: Record<string, string> | null; object?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    const intentId = options.intentId ?? this.intentIdFor(order.orderId);
    const metadata =
      options.metadata === undefined
        ? { orderId: order.orderId, orderNumber: order.orderNumber, source: PAYMENT_SOURCE }
        : options.metadata;
    return {
      id: options.id ?? `evt_${randomBytes(8).toString('hex')}`,
      object: 'event',
      type,
      data: {
        object: {
          id: intentId,
          object: 'payment_intent',
          amount: order.pricing.totalPence,
          amount_received: type === 'payment_intent.succeeded' ? (options.amount ?? order.pricing.totalPence) : 0,
          currency: options.currency ?? 'gbp',
          metadata,
          ...options.object,
        },
      },
    };
  }

  refundEvent(
    order: { orderId: string; orderNumber: string; pricing: { totalPence: number } },
    options: { id?: string; refunded?: number; metadata?: Record<string, string> } = {},
  ): Record<string, unknown> {
    return {
      id: options.id ?? `evt_${randomBytes(8).toString('hex')}`,
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_fake_1',
          amount: order.pricing.totalPence,
          amount_refunded: options.refunded ?? order.pricing.totalPence,
          payment_intent: this.intentIdFor(order.orderId),
          metadata: options.metadata ?? { orderId: order.orderId, orderNumber: order.orderNumber, source: PAYMENT_SOURCE },
        },
      },
    };
  }

  /** The fake gateway's intent id for an order (intents are created in order, pi_fake_000001...). */
  intentIdFor(orderId: string): string {
    for (const intent of this.gateway.intents.values()) {
      if (intent.orderId === orderId) return intent.id;
    }
    return 'pi_unknown';
  }

  signWebhook(rawBody: string, timestamp?: number): string {
    return this.gateway.sign(rawBody, timestamp);
  }

  /** Sends a webhook event, signed by default. Returns the raw response. */
  postWebhook(
    event: unknown,
    options: { signature?: string | null; timestamp?: number; raw?: string; ip?: string } = {},
  ): Promise<ApiResponse> {
    const raw = options.raw ?? JSON.stringify(event);
    const headers: Record<string, string> = {};
    if (options.signature !== null) headers['stripe-signature'] = options.signature ?? this.signWebhook(raw, options.timestamp);
    return this.request('POST', '/v1/webhooks/stripe', { body: raw, headers, ...(options.ip === undefined ? {} : { ip: options.ip }) });
  }

  async deliver(event: unknown): Promise<WebhookAck> {
    const res = await this.postWebhook(event);
    if (res.status !== 200) throw new Error(`webhook expected 200 but got ${String(res.status)}: ${res.text}`);
    return res.json<WebhookAck>();
  }

  /** Marks an order paid through the real webhook route. */
  async pay(order: { orderId: string; orderNumber: string; pricing: { totalPence: number } }): Promise<WebhookAck> {
    return this.deliver(this.paymentEvent('payment_intent.succeeded', order));
  }

  /* ----------------------------- logs ----------------------------- */

  logsAt(level: 'error' | 'warn' | 'info', msg?: string): Record<string, unknown>[] {
    const levels = { error: 50, warn: 40, info: 30 } as const;
    return this.logLines.filter((l) => l['level'] === levels[level] && (msg === undefined || l['msg'] === msg));
  }

  /* ---------------------------- products ---------------------------- */

  async addProduct(overrides: Document & { slug: string; name: string }): Promise<Document> {
    const doc = extraProduct(overrides);
    await this.db.collection('products').insertOne(doc);
    return doc;
  }

  async removeProduct(slug: string): Promise<void> {
    await this.db.collection('products').deleteOne({ slug });
  }

  /** Patches a seeded product for the duration of `fn`, then restores the original document exactly. */
  async withProductPatch<T>(slug: string, patch: ProductPatch, fn: () => Promise<T>): Promise<T> {
    const products = this.db.collection('products');
    const original = await products.findOne({ slug });
    if (!original) throw new Error(`no product ${slug}`);
    await products.updateOne({ slug }, { $set: patch });
    try {
      return await fn();
    } finally {
      await products.replaceOne({ _id: original._id }, original);
    }
  }

  /* --------------------------- data safety --------------------------- */

  async #snapshot(collection: string, ids?: ObjectId[]): Promise<Map<string, string>> {
    const filter: Document = ids ? { _id: { $in: ids } } : {};
    const docs = await this.db.collection(collection).find(filter).sort({ _id: 1 }).toArray();
    return new Map(docs.map((d) => [String(d['_id']), sha256(BSON.serialize(d))]));
  }

  async takeBaselines(siteOrderIds: ObjectId[]): Promise<void> {
    this.#seededOrderHashes = await this.#snapshot('orders', siteOrderIds);
    this.#seededProductHashes = await this.#snapshot('products', FIXTURE_IDS());
    this.#indexBaseline = await this.indexSummary();
  }

  /** Raw BSON hashes of the website orders as seeded; compare with {@link siteOrdersNow}. */
  seededOrderHashes(): ReadonlyMap<string, string> {
    return this.#seededOrderHashes;
  }

  async siteOrdersNow(): Promise<Map<string, string>> {
    return this.#snapshot('orders', [...this.#seededOrderHashes.keys()].map((id) => new ObjectId(id)));
  }

  seededProductHashes(): ReadonlyMap<string, string> {
    return this.#seededProductHashes;
  }

  async fixtureProductsNow(): Promise<Map<string, string>> {
    return this.#snapshot('products', FIXTURE_IDS());
  }

  async indexSummary(): Promise<IndexSummary> {
    const out: IndexSummary = {};
    for (const name of ['products', 'orders']) {
      const indexes = await this.db.collection(name).indexes();
      out[name] = indexes.map((i) => ({
        name: String(i['name']),
        key: i['key'] as Record<string, unknown>,
        unique: i['unique'] === true,
        ttl: typeof i['expireAfterSeconds'] === 'number' ? i['expireAfterSeconds'] : null,
      }));
    }
    return out;
  }

  indexBaseline(): IndexSummary {
    return this.#indexBaseline;
  }

  /* ----------------------------- teardown ----------------------------- */

  async close(): Promise<void> {
    await this.database.close();
    await this.rawClient.close();
    await this.server.stop();
  }
}

/**
 * Boots MongoMemoryServer, seeds the website-shaped data and builds the app from the SAME modules the
 * production composition (src/composition.ts) uses: mongo repositories, pricing service, memory rate-limit store,
 * guest tokens. Only the payment gateway (fake instead of Stripe) and the clock (controllable) differ.
 * composition.ts takes no overrides, so its wiring is mirrored here line for line; wiring.e2e.test.ts runs the real
 * `createProductionApp` against the same data to catch drift between the two.
 */
export async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const server = await MongoMemoryServer.create();
  const dbName = `humis_e2e_${randomBytes(4).toString('hex')}`;
  const keyMaterial = randomBytes(32).toString('base64url');
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: server.getUri(),
    MONGODB_DB: dbName,
    LOG_LEVEL: 'info',
    TRUSTED_IP_HEADER: 'x-real-ip',
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    GUEST_TOKEN_KEYS: `e2e:${keyMaterial}`,
    GUEST_TOKEN_TTL_SECONDS: String(GUEST_TOKEN_TTL_SECONDS),
    DELIVERY_FEE_PENCE: '799',
    FREE_DELIVERY_THRESHOLD_PENCE: '5000',
    MIN_ORDER_PENCE: '0',
    PROMO_CODES: JSON.stringify(PROMO_CODES),
    ...options.env,
  });

  const clock = new FakeClock(DEFAULT_START);
  const logLines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim() !== '') logLines.push(JSON.parse(line) as Record<string, unknown>);
      }
      callback();
    },
  });
  const logger = createLogger({ level: config.logLevel, destination: stream });

  const database = createDatabase({ uri: config.mongo.uri, dbName: config.mongo.db });
  // The same standalone client the tests use to look at the database independently of the app's own driver.
  const rawClient = new MongoClient(server.getUri());
  await rawClient.connect();

  const db = database.db();
  const { siteOrders } = await seedDatabase(db);
  // What `npm run db:indexes` / src/index.ts does: foundation collections only, never products/orders.
  await ensureIndexes(db);

  const keyring = config.guestToken.keyring ?? parseKeyring(`e2e:${keyMaterial}`);
  const guestTokens = createGuestTokenService({
    keyring,
    ttlSeconds: config.guestToken.ttlSeconds,
    now: clock.epochMs,
  });
  const rateLimitStore = new MemoryRateLimitStore({ now: clock.epochMs });

  const fake = createFakeGateway({ webhookSecret: WEBHOOK_SECRET, now: clock.epochMs });
  const control: GatewayControl = { failCreate: null, failCancel: null };
  const wrapped: PaymentGateway = options.payments === 'disabled'
    ? createDisabledGateway()
    : {
        enabled: true,
        createPaymentIntent: (input) => (control.failCreate ? Promise.reject(control.failCreate) : fake.createPaymentIntent(input)),
        cancelPaymentIntent: (id) => (control.failCancel ? Promise.reject(control.failCancel) : fake.cancelPaymentIntent(id)),
        parseWebhook: (raw, signature) => fake.parseWebhook(raw, signature),
      };

  const business = config.business;
  const products = createMongoProductsRepository(db, business, { logger, clock });
  const deps: FeatureDeps = {
    config,
    logger,
    clock,
    products,
    orders: createMongoOrdersRepository(db, business, clock, logger),
    idempotency: createMongoIdempotencyStore(db),
    enquiries: createMongoEnquiryRepository(db, clock),
    webhookEvents: createMongoWebhookEventStore(db),
    payments: wrapped,
    pricing: createPricingService({ products, business, clock }),
    guestTokens,
    rateLimitStore,
  };
  const appDeps: AppDeps = { config, logger, database, rateLimitStore, guestTokens };
  const ipSalt = keyring.hmac(keyring.activeKid, 'humi:enquiry-ip-salt')?.toString('hex') ?? 'salt';
  const app = createApp(appDeps, mountV1(deps, { ipSalt }));

  const harness = new Harness(clock, control, logLines, server, database, rawClient, app, deps, appDeps, config, fake);
  await harness.takeBaselines(siteOrders.map((o) => o['_id'] as ObjectId));
  return harness;
}
