import { type Db, MongoServerError } from 'mongodb';
import type { WebhookEventStore } from '../domain/ports.js';

const DUPLICATE_KEY = 11000;

interface WebhookEventDoc {
  eventId: string;
  type: string;
  receivedAt: Date;
}

/**
 * Atomic dedupe on the unique `eventId` index (see db/indexes.ts; TTL on `receivedAt`).
 * Insert-or-conflict needs no read-then-write window, so concurrent deliveries race safely.
 */
export function createMongoWebhookEventStore(db: Db, now: () => Date = () => new Date()): WebhookEventStore {
  const events = db.collection<WebhookEventDoc>('webhook_events');
  return {
    async recordIfNew(eventId, type) {
      try {
        await events.insertOne({ eventId, type, receivedAt: now() });
        return true;
      } catch (error) {
        if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return false;
        throw error;
      }
    },
  };
}
