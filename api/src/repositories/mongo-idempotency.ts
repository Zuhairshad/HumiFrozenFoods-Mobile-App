import type { Db } from 'mongodb';
import type { CollectionIndexes } from '../db/indexes.js';
import type { IdempotencyRecord, IdempotencyStore } from '../domain/ports.js';

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

export function createMongoIdempotencyStore(db: Db): IdempotencyStore {
  const records = db.collection(COLLECTION);

  return {
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
      };
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
}
