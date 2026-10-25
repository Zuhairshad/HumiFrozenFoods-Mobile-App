import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { createMongoIdempotencyStore, idempotencyIndexes } from '../../../src/repositories/mongo-idempotency.js';

const KEY = 'a'.repeat(64);
const REQ = 'b'.repeat(64);

function setup() {
  const collection = { findOne: vi.fn(), insertOne: vi.fn(() => Promise.resolve({})) };
  const names: string[] = [];
  const db = { collection: (name: string) => (names.push(name), collection) } as unknown as Db;
  return { store: createMongoIdempotencyStore(db), collection, names };
}

const record = { keyHash: KEY, requestHash: REQ, response: { orderId: 'x' }, status: 201, createdAt: new Date('2026-03-01T10:00:00Z') };

describe('idempotencyIndexes', () => {
  it('declares a unique key hash and a 24h TTL on createdAt for app_idempotency', () => {
    expect(idempotencyIndexes.collection).toBe('app_idempotency');
    expect(idempotencyIndexes.indexes).toEqual([
      { key: { keyHash: 1 }, name: 'keyHash_unique', unique: true },
      { key: { createdAt: 1 }, name: 'createdAt_ttl', expireAfterSeconds: 86_400 },
    ]);
  });
});

describe('createMongoIdempotencyStore', () => {
  it('uses the app_idempotency collection', () => {
    expect(setup().names).toEqual(['app_idempotency']);
  });

  it('saves a record and reports true', async () => {
    const { store, collection } = setup();
    expect(await store.save(record)).toBe(true);
    expect(collection.insertOne).toHaveBeenCalledWith(record);
  });

  it('reports false on a duplicate key and rethrows anything else', async () => {
    const { store, collection } = setup();
    collection.insertOne.mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));
    expect(await store.save(record)).toBe(false);
    collection.insertOne.mockRejectedValueOnce(new Error('network'));
    await expect(store.save(record)).rejects.toThrow('network');
    collection.insertOne.mockRejectedValueOnce('string error');
    await expect(store.save(record)).rejects.toBe('string error');
  });

  it('refuses malformed records without writing', async () => {
    const { store, collection } = setup();
    for (const bad of [{ ...record, keyHash: 'short' }, { ...record, keyHash: { $ne: '' } as unknown as string }, { ...record, requestHash: '' }, { ...record, requestHash: 'x'.repeat(129) }]) {
      await expect(store.save(bad)).rejects.toThrow(RangeError);
    }
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  it('finds a record by hash, projecting away _id', async () => {
    const { store, collection } = setup();
    collection.findOne.mockResolvedValue({ ...record });
    expect(await store.find(KEY)).toEqual(record);
    expect(collection.findOne).toHaveBeenCalledWith({ keyHash: KEY }, { projection: { _id: 0 } });
  });

  it.each([{ $ne: '' }, { $gt: '' }, ['a'], 5, null, undefined, '', 'A'.repeat(64), 'g'.repeat(64), `${KEY}0`])('never queries with %j', async (payload) => {
    const { store, collection } = setup();
    expect(await store.find(payload as unknown as string)).toBeNull();
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['wrong key', { ...record, keyHash: 'c'.repeat(64) }],
    ['no request hash', { ...record, requestHash: 5 }],
    ['no status', { ...record, status: '201' }],
    ['no date', { ...record, createdAt: '2026-03-01' }],
  ])('treats a %s document as absent', async (_label, doc) => {
    const { store, collection } = setup();
    collection.findOne.mockResolvedValue(doc);
    expect(await store.find(KEY)).toBeNull();
  });
});
