import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { closeDatabase, createDatabase, ensureIndexes, type Database } from '../../src/db/client.js';
import { defaultIndexes } from '../../src/db/indexes.js';
import { Secret } from '../../src/lib/secret.js';
import { testDeps } from '../unit/helpers.js';

let server: MongoMemoryServer;
let database: Database;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  database = createDatabase({ uri: new Secret(server.getUri()), dbName: 'humis_test' });
}, 120_000);

afterAll(async () => {
  await database.close();
  await closeDatabase();
  await server.stop();
});

describe('readiness against a real MongoDB', () => {
  it('GET /readyz is 200 while the database is up', async () => {
    const app = createApp(testDeps({ database }));
    const res = await app.request('/readyz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready' });
  });

  it('GET /readyz turns 503 when the database goes away', async () => {
    const unreachable = createDatabase({
      uri: new Secret('mongodb://127.0.0.1:1/'),
      dbName: 'x',
      clientOptions: { serverSelectionTimeoutMS: 300 },
    });
    const res = await createApp(testDeps({ database: unreachable })).request('/readyz');
    expect(res.status).toBe(503);
    await unreachable.close();
  });
});

describe('ensureIndexes', () => {
  it('creates the declared indexes and is idempotent', async () => {
    await ensureIndexes(database.db());
    await ensureIndexes(database.db());

    const indexes = await database.db().collection('webhook_events').indexes();
    const byName = new Map(indexes.map((i) => [i.name, i]));
    expect(byName.get('eventId_unique')).toMatchObject({ unique: true, key: { eventId: 1 } });
    expect(byName.get('receivedAt_ttl')).toMatchObject({ key: { receivedAt: 1 }, expireAfterSeconds: 90 * 24 * 3600 });
  });

  it('makes duplicate webhook event ids impossible', async () => {
    await ensureIndexes(database.db());
    const events = database.db().collection('webhook_events');
    await events.insertOne({ eventId: 'evt_1', receivedAt: new Date() });
    await expect(events.insertOne({ eventId: 'evt_1', receivedAt: new Date() })).rejects.toMatchObject({ code: 11000 });
  });

  it('applies additional specs passed by feature modules', async () => {
    await ensureIndexes(database.db(), [
      ...defaultIndexes,
      { collection: 'demo', indexes: [{ key: { sku: 1 }, name: 'sku_unique', unique: true }] },
    ]);
    const names = (await database.db().collection('demo').indexes()).map((i) => i.name);
    expect(names).toContain('sku_unique');
  });
});
