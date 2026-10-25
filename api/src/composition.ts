import type { Hono } from 'hono';
import { createApp } from './app.js';
import type { Runtime } from './bootstrap.js';
import type { FeatureDeps } from './domain/ports.js';
import { createDisabledGateway, createStripeGateway } from './payments/stripe-gateway.js';
import { createMongoEnquiryRepository } from './repositories/mongo-enquiries.js';
import { createMongoIdempotencyStore } from './repositories/mongo-idempotency.js';
import { createMongoOrdersRepository } from './repositories/mongo-orders.js';
import { createMongoProductsRepository } from './repositories/mongo-products.js';
import { createMongoWebhookEventStore } from './repositories/mongo-webhook-events.js';
import { mountV1 } from './routes/v1.js';
import { createPricingService } from './services/pricing.js';
import type { AppEnv } from './types.js';

const systemClock = { now: (): Date => new Date() };

/**
 * Production dependency graph. Nothing connects to Mongo here: `database.db()` is lazy, so this is safe at
 * module scope on serverless cold starts. Payments are real only when BOTH Stripe secrets are configured;
 * otherwise the disabled gateway makes checkout fail closed (503) before any order is created.
 */
export function buildFeatureDeps(runtime: Runtime): FeatureDeps {
  const { deps, database } = runtime;
  const { config, logger } = deps;
  const db = database.db();
  const business = config.business;

  const products = createMongoProductsRepository(db, business, { logger, clock: systemClock });
  const { secretKey, webhookSecret } = config.stripe;
  const payments =
    secretKey && webhookSecret ? createStripeGateway({ secretKey, webhookSecret, logger }) : createDisabledGateway();
  if (!payments.enabled) logger.warn('Stripe is not fully configured; checkout will return 503 until it is');

  return {
    config,
    logger,
    clock: systemClock,
    products,
    orders: createMongoOrdersRepository(db, business, systemClock, logger),
    idempotency: createMongoIdempotencyStore(db),
    enquiries: createMongoEnquiryRepository(db, systemClock),
    webhookEvents: createMongoWebhookEventStore(db),
    payments,
    pricing: createPricingService({ products, business, clock: systemClock }),
    guestTokens: deps.guestTokens,
    rateLimitStore: deps.rateLimitStore,
  };
}

export function createProductionApp(runtime: Runtime, commit?: string): Hono<AppEnv> {
  return createApp(runtime.deps, mountV1(buildFeatureDeps(runtime), { ipSalt: runtime.ipSalt, commit }));
}
