import { type Db, MongoClient, type MongoClientOptions, ServerApiVersion } from 'mongodb';
import type { Secret } from '../lib/secret.js';
import { type CollectionIndexes, defaultIndexes } from './indexes.js';

/** What the HTTP layer needs from persistence; tests substitute a fake. */
export interface Database {
  ping(): Promise<void>;
  db(): Db;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  uri: Secret;
  dbName: string;
  /** Called once with the new client, e.g. to register it with the serverless platform. */
  onClient?: (client: MongoClient) => void;
  /** Overrides for the defaults below (e.g. shorter timeouts in tests). */
  clientOptions?: MongoClientOptions;
}

// Small pools: each serverless instance holds its own, and Atlas caps total connections.
const CLIENT_OPTIONS: MongoClientOptions = {
  maxPoolSize: 5,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 5_000,
  socketTimeoutMS: 30_000,
  // Client-side operation deadline: the driver also sends it as maxTimeMS, so a runaway scan on the owner's
  // (possibly unindexed) collections is aborted server-side instead of piling up behind request timeouts.
  timeoutMS: 8_000,
  appName: 'humis-api',
  serverApi: { version: ServerApiVersion.v1 },
};

export function createDatabase(options: DatabaseOptions): Database {
  // The driver connects lazily on first operation, so construction is cheap and safe at module scope.
  const client = new MongoClient(options.uri.reveal(), { ...CLIENT_OPTIONS, ...options.clientOptions });
  options.onClient?.(client);
  const db = client.db(options.dbName);

  return {
    async ping() {
      await db.command({ ping: 1 });
    },
    db: () => db,
    close: () => client.close(),
  };
}

let cached: { key: string; database: Database } | undefined;

/**
 * Returns the process-wide Database, creating it on first use. Reusing one
 * client across warm serverless invocations avoids reconnecting every request.
 */
export function getDatabase(options: DatabaseOptions): Database {
  const key = `${options.uri.reveal()}\u0000${options.dbName}`;
  if (cached?.key === key) return cached.database;
  if (cached) throw new Error('getDatabase called with different settings than the cached client');
  cached = { key, database: createDatabase(options) };
  return cached.database;
}

export async function closeDatabase(): Promise<void> {
  const current = cached;
  cached = undefined;
  await current?.database.close();
}

export async function ensureIndexes(db: Db, specs: readonly CollectionIndexes[] = defaultIndexes): Promise<void> {
  for (const spec of specs) {
    await db.collection(spec.collection).createIndexes([...spec.indexes]);
  }
}
