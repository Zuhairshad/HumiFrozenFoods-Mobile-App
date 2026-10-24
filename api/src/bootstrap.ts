import { randomBytes } from 'node:crypto';
import type { MongoClient } from 'mongodb';
import type { AppDeps } from './app.js';
import { Keyring } from './auth/keyring.js';
import { createGuestTokenService } from './auth/guest-token.js';
import type { AppConfig } from './config/env.js';
import { getDatabase } from './db/client.js';
import { createLogger } from './lib/logger.js';
import { MemoryRateLimitStore } from './lib/rate-limit-store.js';

export interface Runtime {
  deps: AppDeps;
  database: ReturnType<typeof getDatabase>;
}

/** Wires production dependencies. Safe at module scope: nothing connects until first use. */
export function buildRuntime(config: AppConfig, onMongoClient?: (client: MongoClient) => void): Runtime {
  const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === 'development' });
  const database = getDatabase({
    uri: config.mongo.uri,
    dbName: config.mongo.db,
    ...(onMongoClient ? { onClient: onMongoClient } : {}),
  });

  // Config guarantees keys in production. Elsewhere an ephemeral key keeps local dev
  // working; tokens simply stop verifying after a restart.
  const keyring = config.guestToken.keyring ?? new Keyring([['dev', randomBytes(32)]]);
  if (!config.guestToken.keyring) logger.warn('GUEST_TOKEN_KEYS not set; using an ephemeral key');

  return {
    database,
    deps: {
      config,
      logger,
      database,
      // In-memory limits are per instance. Production must supply a shared store (see README).
      rateLimitStore: new MemoryRateLimitStore(),
      guestTokens: createGuestTokenService({ keyring, ttlSeconds: config.guestToken.ttlSeconds }),
    },
  };
}
