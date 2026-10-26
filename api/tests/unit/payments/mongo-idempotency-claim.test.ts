import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { createMongoIdempotencyStore } from '../../../src/repositories/mongo-idempotency.js';

const KEY = 'a'.repeat(64);
const REQ = 'b'.repeat(64);
const T0 = new Date('2026-10-26T10:00:00Z');
const dup = () => Object.assign(new Error('E11000'), { code: 11000 });

function setup() {
  const collection = {
    findOne: vi.fn(),
    insertOne: vi.fn(() => Promise.resolve({})),
    updateOne: vi.fn(() => Promise.resolve({ matchedCount: 1 })),
    deleteOne: vi.fn(() => Promise.resolve({})),
  };
  const db = { collection: () => collection } as unknown as Db;
  return { store: createMongoIdempotencyStore(db), collection };
}

const doc = (over: Record<string, unknown> = {}) => ({ keyHash: KEY, requestHash: REQ, response: null, status: 0, createdAt: T0, state: 'in_progress', ...over });

describe('claim/complete/release (mocked driver)', () => {
  it('claims through an insert of an in_progress document', async () => {
    const { store, collection } = setup();
    expect(await store.claim(KEY, REQ, T0)).toEqual({ outcome: 'claimed' });
    expect(collection.insertOne).toHaveBeenCalledWith({ keyHash: KEY, requestHash: REQ, state: 'in_progress', status: 0, response: null, createdAt: T0 });
  });

  it('reports a live record as existing, with its state', async () => {
    const { store, collection } = setup();
    collection.insertOne.mockRejectedValueOnce(dup());
    collection.findOne.mockResolvedValueOnce(doc());
    const result = await store.claim(KEY, REQ, new Date(T0.getTime() + 1000));
    expect(result).toMatchObject({ outcome: 'exists', record: { state: 'in_progress', requestHash: REQ } });
    collection.insertOne.mockRejectedValueOnce(dup());
    collection.findOne.mockResolvedValueOnce(doc({ state: 'completed', status: 201, response: { a: 1 } }));
    const done = await store.claim(KEY, REQ, new Date(T0.getTime() + 1000));
    expect(done).toMatchObject({ outcome: 'exists', record: { status: 201 } });
    if (done.outcome !== 'exists') throw new Error('expected exists');
    expect(done.record).not.toHaveProperty('state');
  });

  it('takes over a stale claim with a guarded update, and gives up if someone else got there first', async () => {
    const { store, collection } = setup();
    const later = new Date(T0.getTime() + 61_000);
    collection.insertOne.mockRejectedValueOnce(dup());
    collection.findOne.mockResolvedValueOnce(doc());
    expect(await store.claim(KEY, REQ, later)).toEqual({ outcome: 'claimed' });
    expect(collection.updateOne).toHaveBeenCalledWith({ keyHash: KEY, state: 'in_progress', createdAt: T0 }, { $set: { requestHash: REQ, createdAt: later } });

    collection.insertOne.mockRejectedValue(dup());
    collection.findOne.mockResolvedValue(doc());
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(store.claim(KEY, REQ, later)).resolves.toMatchObject({ outcome: 'exists' });
  });

  it('retries the insert when the record vanished, and fails loudly if it never settles', async () => {
    const { store, collection } = setup();
    collection.insertOne.mockRejectedValueOnce(dup());
    collection.findOne.mockResolvedValueOnce(null);
    expect(await store.claim(KEY, REQ, T0)).toEqual({ outcome: 'claimed' });
    collection.insertOne.mockRejectedValue(dup());
    collection.findOne.mockResolvedValue(null);
    await expect(store.claim(KEY, REQ, T0)).rejects.toThrow('Could not claim');
  });

  it('rethrows non-duplicate insert errors and rejects malformed input', async () => {
    const { store, collection } = setup();
    collection.insertOne.mockRejectedValueOnce(new Error('network'));
    await expect(store.claim(KEY, REQ, T0)).rejects.toThrow('network');
    await expect(store.claim('short', REQ, T0)).rejects.toThrow(RangeError);
    await expect(store.complete('short', {}, 201)).rejects.toThrow(RangeError);
    await expect(store.release('short')).rejects.toThrow(RangeError);
  });

  it('completes only in_progress claims and releases only unfinished ones', async () => {
    const { store, collection } = setup();
    expect(await store.complete(KEY, { ok: 1 }, 201)).toBe(true);
    expect(collection.updateOne).toHaveBeenCalledWith({ keyHash: KEY, state: 'in_progress' }, { $set: { response: { ok: 1 }, status: 201, state: 'completed' } });
    collection.updateOne.mockResolvedValueOnce({ matchedCount: 0 });
    expect(await store.complete(KEY, {}, 201)).toBe(false);
    await store.release(KEY);
    expect(collection.deleteOne).toHaveBeenCalledWith({ keyHash: KEY, state: 'in_progress' });
  });
});
