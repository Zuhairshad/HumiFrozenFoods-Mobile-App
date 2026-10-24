import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, createDatabase, ensureIndexes, getDatabase } from '../../../src/db/client.js';
import { defaultIndexes } from '../../../src/db/indexes.js';
import { Secret } from '../../../src/lib/secret.js';

const uri = new Secret('mongodb://127.0.0.1:1/unused');

afterEach(async () => {
  await closeDatabase();
});

describe('database client', () => {
  it('creates a lazy client and hands it to onClient without connecting', async () => {
    const onClient = vi.fn();
    const database = createDatabase({ uri, dbName: 'x', onClient });
    expect(onClient).toHaveBeenCalledOnce();
    expect(database.db().databaseName).toBe('x');
    await database.close();
  });

  it('caches one instance per process (serverless reuse)', () => {
    const a = getDatabase({ uri, dbName: 'x' });
    expect(getDatabase({ uri, dbName: 'x' })).toBe(a);
  });

  it('refuses to silently switch to different settings', () => {
    getDatabase({ uri, dbName: 'x' });
    expect(() => getDatabase({ uri, dbName: 'other' })).toThrow(/different settings/);
  });

  it('closeDatabase resets the cache and is safe to call twice', async () => {
    const a = getDatabase({ uri, dbName: 'x' });
    await closeDatabase();
    await closeDatabase();
    expect(getDatabase({ uri, dbName: 'x' })).not.toBe(a);
  });

  it('ping rejects when MongoDB is unreachable', async () => {
    const database = createDatabase({ uri: new Secret('mongodb://127.0.0.1:1/'), dbName: 'x', clientOptions: { serverSelectionTimeoutMS: 200 } });
    await expect(database.ping()).rejects.toThrow();
    await database.close();
  });
});

describe('ensureIndexes', () => {
  it('creates every spec on its collection', async () => {
    const createIndexes = vi.fn().mockResolvedValue([]);
    const collection = vi.fn().mockReturnValue({ createIndexes });
    await ensureIndexes({ collection } as never);
    expect(collection).toHaveBeenCalledWith('webhook_events');
    expect(createIndexes).toHaveBeenCalledTimes(defaultIndexes.length);
  });
});

describe('defaultIndexes', () => {
  it('guarantees webhook event-id uniqueness and expires old events', () => {
    const spec = defaultIndexes.find((s) => s.collection === 'webhook_events');
    expect(spec?.indexes.some((i) => i.unique === true && 'eventId' in i.key)).toBe(true);
    expect(spec?.indexes.some((i) => typeof i.expireAfterSeconds === 'number')).toBe(true);
  });
});
