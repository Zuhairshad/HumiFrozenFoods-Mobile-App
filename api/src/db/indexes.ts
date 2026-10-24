import type { IndexDescription } from 'mongodb';

export interface CollectionIndexes {
  collection: string;
  indexes: readonly IndexDescription[];
}

const NINETY_DAYS_SECONDS = 90 * 24 * 3600;

/**
 * Foundation indexes only. Feature modules (orders, products, ...) append
 * their own specs here so index definitions live in one reviewable place.
 */
export const defaultIndexes: readonly CollectionIndexes[] = [
  {
    // Stripe may redeliver an event; the unique key makes dedupe atomic.
    collection: 'webhook_events',
    indexes: [
      { key: { eventId: 1 }, name: 'eventId_unique', unique: true },
      { key: { receivedAt: 1 }, name: 'receivedAt_ttl', expireAfterSeconds: NINETY_DAYS_SECONDS },
    ],
  },
];
