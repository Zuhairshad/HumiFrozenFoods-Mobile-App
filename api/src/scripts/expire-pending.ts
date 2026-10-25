import { loadConfig } from '../config/env.js';
import { closeDatabase, getDatabase } from '../db/client.js';
import { expirePendingOrders } from '../jobs/expire-pending.js';
import { createLogger } from '../lib/logger.js';
import { Secret } from '../lib/secret.js';
import { createDisabledGateway, createStripeGateway } from '../payments/stripe-gateway.js';
import { createMongoOrdersRepository } from '../repositories/mongo-orders.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const clock = { now: () => new Date() };
const database = getDatabase({ uri: config.mongo.uri, dbName: config.mongo.db });

// The job only cancels intents, so the webhook secret is never read; a stand-in avoids requiring it here.
const payments = config.stripe.secretKey
  ? createStripeGateway({
      secretKey: config.stripe.secretKey,
      webhookSecret: config.stripe.webhookSecret ?? new Secret('whsec_unused_by_cli'),
      logger,
    })
  : createDisabledGateway();

try {
  const orders = createMongoOrdersRepository(database.db(), config.business, clock, logger);
  const result = await expirePendingOrders({ orders, payments, logger, clock, config });
  console.log(JSON.stringify(result));
  process.exitCode = result.errors > 0 ? 1 : 0;
} finally {
  await closeDatabase();
}
