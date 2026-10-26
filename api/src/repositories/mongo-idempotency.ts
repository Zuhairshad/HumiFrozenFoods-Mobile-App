import type { Db } from 'mongodb';
import type { CollectionIndexes } from '../db/indexes.js';
import { IDEMPOTENCY_STALE_CLAIM_MS, type IdempotencyRecord, type IdempotencyStore } from '../domain/ports.js';

const COLLECTION = 'app_idempotency';
const SHA256_HEX = /^[0-9a-f]{64}$/;
const TWENTY_FOUR_HOURS_SECONDS = 24 * 3600;
const DUPLICATE_KEY = 11000;

export const idempotencyIndexes: CollectionIndexes = {
  collection: COLLECTION,
  indexes: [
    { key: { keyHash: 1 }, name: 'keyHash_unique', unique: true },
    { key: { createdAt: 1 }, name: 'createdAt_ttl', expireAfterSeconds: TWENTY_FOUR_HOURS_SECONDS },
  ],
};

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === DUPLICATE_KEY;
}

function assertHashes(keyHash: string, requestHash: string): void {
  if (!SHA256_HEX.test(keyHash) || requestHash.length === 0 || requestHash.length > 128) {
    throw new RangeError('Invalid idempotency record');
  }
}

export function createMongoIdempotencyStore(db: Db): IdempotencyStore {
  const records = db.collection(COLLECTION);

  const store: IdempotencyStore = {
    async find(keyHash) {
      // Keys arrive as hashes; anything else cannot match and must never reach the query as-is.
      if (typeof keyHash !== 'string' || !SHA256_HEX.test(keyHash)) return null;
      const doc = await records.findOne({ keyHash }, { projection: { _id: 0 } });
      if (
        !doc ||
        doc.keyHash !== keyHash ||
        typeof doc.requestHash !== 'string' ||
        typeof doc.status !== 'number' ||
        !(doc.createdAt instanceof Date)
      ) {
        return null;
      }
      return {
        keyHash,
        requestHash: doc.requestHash,
        response: doc.response as unknown,
        status: doc.status,
        createdAt: doc.createdAt,
        ...(doc.state === 'in_progress' ? { state: 'in_progress' as const } : {}),
      };
    },

    async claim(keyHash, requestHash, createdAt, staleAfterMs = IDEMPOTENCY_STALE_CLAIM_MS) {
      assertHashes(keyHash, requestHash);
      // Bounded: each pass either inserts, takes over a stale claim, or observes someone else's live record.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await records.insertOne({ keyHash, requestHash, state: 'in_progress', status: 0, response: null, createdAt });
          return { outcome: 'claimed' };
        } catch (error) {
          if (!isDuplicateKey(error)) throw error;
        }
        const existing = await store.find(keyHash);
        if (!existing) continue; // released or expired between the insert and the read
        const stale = existing.state === 'in_progress' && createdAt.getTime() - existing.createdAt.getTime() > staleAfterMs;
        if (!stale) return { outcome: 'exists', record: existing };
        const taken = await records.updateOne(
          { keyHash, state: 'in_progress', createdAt: existing.createdAt },
          { $set: { requestHash, createdAt } },
        );
        if (taken.matchedCount > 0) return { outcome: 'claimed' };
      }
      const last = await store.find(keyHash);
      if (last) return { outcome: 'exists', record: last };
      throw new Error('Could not claim idempotency key');
    },

    async complete(keyHash, response, status) {
      assertHashes(keyHash, 'x');
      const result = await records.updateOne(
        { keyHash, state: 'in_progress' },
        { $set: { response, status, state: 'completed' } },
      );
      return result.matchedCount > 0;
    },

    async release(keyHash) {
      assertHashes(keyHash, 'x');
      await records.deleteOne({ keyHash, state: 'in_progress' });
    },

    async save(record: IdempotencyRecord) {
      if (!SHA256_HEX.test(record.keyHash) || record.requestHash.length === 0 || record.requestHash.length > 128) {
        throw new RangeError('Invalid idempotency record');
      }
      try {
        await records.insertOne({
          keyHash: record.keyHash,
          requestHash: record.requestHash,
          response: record.response,
          status: record.status,
          createdAt: record.createdAt,
        });
        return true;
      } catch (error) {
        if (isDuplicateKey(error)) return false;
        throw error;
      }
    },
  };
  return store;
}
