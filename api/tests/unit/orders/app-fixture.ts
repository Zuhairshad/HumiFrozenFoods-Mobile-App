import { randomBytes } from 'node:crypto';
import { createApp } from '../../../src/app.js';
import { createGuestTokenService, type GuestTokenService } from '../../../src/auth/guest-token.js';
import { Keyring } from '../../../src/auth/keyring.js';
import type { FeatureDeps, OrdersRepository } from '../../../src/domain/ports.js';
import { createLogger } from '../../../src/lib/logger.js';
import { MemoryRateLimitStore } from '../../../src/lib/rate-limit-store.js';
import { ordersRoutes } from '../../../src/routes/orders.js';
import { testConfig } from '../helpers.js';
import { NOW } from './fixtures.js';

const unused = () => Promise.reject(new Error('unused in orders tests'));

export interface OrdersAppOptions {
  orders: OrdersRepository;
  guestTokens?: GuestTokenService;
  env?: Record<string, string>;
}

/** The full app pipeline with only the orders routes mounted; every other port rejects if touched. */
export function buildOrdersApp(options: OrdersAppOptions) {
  const guestTokens = options.guestTokens ?? createGuestTokenService({ keyring: new Keyring([['t1', randomBytes(32)]]), ttlSeconds: 600 });
  const config = testConfig({ TRUSTED_IP_HEADER: 'x-real-ip', ...options.env });
  const logger = createLogger({ level: 'silent' });
  const deps: FeatureDeps = {
    config,
    logger,
    clock: { now: () => NOW },
    products: { list: unused, findByIdOrSlug: unused, findManyBySlugs: unused, countByCollection: unused },
    orders: options.orders,
    idempotency: { find: unused, save: unused },
    enquiries: { insert: unused },
    webhookEvents: { recordIfNew: unused },
    payments: {
      enabled: false,
      createPaymentIntent: unused,
      cancelPaymentIntent: unused,
      parseWebhook: () => {
        throw new Error('unused in orders tests');
      },
    },
    pricing: { quote: unused },
    guestTokens,
    rateLimitStore: new MemoryRateLimitStore(),
  };
  const app = createApp(
    { config, logger, database: { ping: () => Promise.resolve() }, rateLimitStore: deps.rateLimitStore, guestTokens },
    (hono) => hono.route('/v1', ordersRoutes(deps)),
  );
  return { app, guestTokens, deps };
}
