import { readFileSync } from 'node:fs';
import { ObjectId, type Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentTransition } from '../../../src/domain/types.js';
import { ConflictError, NotFoundError } from '../../../src/lib/errors.js';
import { toSiteDocument } from '../../../src/orders/site-order-mapper.js';
import { createMongoOrdersRepository } from '../../../src/repositories/mongo-orders.js';
import { newOrder, NOW, websiteDoc } from '../orders/fixtures.js';
import { testConfig } from '../helpers.js';

const OID = '6985bc5e00000000000000bb';

function setup(env: Record<string, string> = {}) {
  const collection = {
    findOne: vi.fn(),
    countDocuments: vi.fn(() => Promise.resolve(0)),
    insertOne: vi.fn((doc: Record<string, unknown>) => Promise.resolve({ insertedId: (doc._id as ObjectId | undefined) ?? new ObjectId(OID) })),
    updateOne: vi.fn(() => Promise.resolve({ matchedCount: 1 })),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  };
  const collectionName = vi.fn((_name: string) => collection);
  const db = { collection: collectionName } as unknown as Db;
  const business = testConfig(env).business;
  const repo = createMongoOrdersRepository(db, business, { now: () => NOW });
  return { repo, collection, collectionName, business };
}

const appDoc = (extra: Record<string, unknown> = {}) => ({ ...toSiteDocument(newOrder(), { now: NOW }), _id: new ObjectId(OID), ...extra });

describe('collection selection', () => {
  it('uses the configured orders collection name', () => {
    const { collectionName } = setup({ ORDERS_COLLECTION: 'orders_staging' });
    expect(collectionName).toHaveBeenCalledWith('orders_staging');
  });
});

describe('insertPending', () => {
  it('inserts one new document carrying the app marker and returns it as a StoredOrder', async () => {
    const { repo, collection } = setup();
    const stored = await repo.insertPending(newOrder());
    expect(collection.insertOne).toHaveBeenCalledTimes(1);
    const inserted = collection.insertOne.mock.calls[0]?.[0] as { app_meta: { source: string }; order_status: string; payment_status: string };
    expect(inserted.app_meta.source).toBe('mobile-app');
    expect([inserted.order_status, inserted.payment_status]).toEqual(['order-pending', 'payment-pending']);
    expect(stored).toMatchObject({ orderId: OID, orderNumber: '123456789012', status: 'pending_payment', createdByApp: true });
    expect(collection.updateOne).not.toHaveBeenCalled();
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('draws a fresh number when the supplied one exists, up to five attempts, then conflicts', async () => {
    const { repo, collection } = setup();
    collection.countDocuments.mockResolvedValue(1);
    const error = await repo.insertPending(newOrder()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(collection.countDocuments).toHaveBeenCalledTimes(5);
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  it('inserts under a new number after one collision', async () => {
    const { repo, collection } = setup({ ORDER_NUMBER_DIGITS: '10' });
    collection.countDocuments.mockResolvedValueOnce(1).mockResolvedValue(0);
    const stored = await repo.insertPending(newOrder());
    expect(stored.orderNumber).toMatch(/^\d{10}$/);
    expect(stored.orderNumber).not.toBe('123456789012');
  });

  it('retries when a unique index on tracking_number rejects the insert', async () => {
    const { repo, collection } = setup();
    collection.insertOne.mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    const stored = await repo.insertPending(newOrder());
    expect(collection.insertOne).toHaveBeenCalledTimes(2);
    expect(stored.orderNumber).not.toBe('123456789012');
  });

  it('does not swallow other insert errors', async () => {
    const { repo, collection } = setup();
    collection.insertOne.mockRejectedValueOnce(new Error('network down'));
    await expect(repo.insertPending(newOrder())).rejects.toThrow('network down');
    expect(collection.insertOne).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the inserted order cannot be read back', async () => {
    const { repo, collection } = setup();
    collection.insertOne.mockResolvedValueOnce({ insertedId: 'not-an-id' as unknown as ObjectId });
    await expect(repo.insertPending(newOrder())).rejects.toThrow('could not be read back');
  });

  it('refuses inconsistent orders before touching the database', async () => {
    const { repo, collection } = setup();
    await expect(repo.insertPending(newOrder({ pricing: { ...newOrder().pricing, totalPence: 1 } }))).rejects.toThrow(RangeError);
    expect(collection.insertOne).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('findById queries by ObjectId only and maps the document', async () => {
    const { repo, collection } = setup();
    collection.findOne.mockResolvedValue(appDoc());
    expect(await repo.findById(OID)).toMatchObject({ orderId: OID });
    expect(collection.findOne).toHaveBeenCalledWith({ _id: new ObjectId(OID) });
  });

  it('findById returns null for malformed ids without querying', async () => {
    const { repo, collection } = setup();
    for (const bad of ['', 'abc', 'g'.repeat(24), OID + '0', '$ne', '{"$ne":""}']) expect(await repo.findById(bad)).toBeNull();
    expect(await repo.findById({ $ne: '' } as unknown as string)).toBeNull();
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  it('findById returns null when nothing matches or the document is unreadable', async () => {
    const { repo, collection } = setup();
    collection.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ no: 'id' });
    expect(await repo.findById(OID)).toBeNull();
    expect(await repo.findById(OID)).toBeNull();
  });

  it('findByOrderNumber passes only a validated string as an equality value', async () => {
    const { repo, collection } = setup();
    collection.findOne.mockResolvedValue(websiteDoc());
    expect(await repo.findByOrderNumber('555000111222')).toMatchObject({ createdByApp: false });
    expect(collection.findOne).toHaveBeenCalledWith({ tracking_number: '555000111222' });
  });

  it.each([{ $ne: '' }, { $gt: '' }, ['1'], 5, null, undefined, '', 'abc', '1 or 1', '$where', '1'.repeat(25), '12\u0000'])(
    'findByOrderNumber and orderNumberExists never query with %j',
    async (payload) => {
      const { repo, collection } = setup();
      expect(await repo.findByOrderNumber(payload as unknown as string)).toBeNull();
      expect(await repo.orderNumberExists(payload as unknown as string)).toBe(false);
      expect(collection.findOne).not.toHaveBeenCalled();
      expect(collection.countDocuments).not.toHaveBeenCalled();
    },
  );

  it('orderNumberExists counts with limit 1', async () => {
    const { repo, collection } = setup();
    collection.countDocuments.mockResolvedValue(1);
    expect(await repo.orderNumberExists('123')).toBe(true);
    expect(collection.countDocuments).toHaveBeenCalledWith({ tracking_number: '123' }, { limit: 1 });
  });
});

describe('attachPaymentIntent', () => {
  it('updates only the app-created order with that id', async () => {
    const { repo, collection } = setup();
    await repo.attachPaymentIntent(OID, 'pi_123');
    expect(collection.updateOne).toHaveBeenCalledWith(
      { _id: new ObjectId(OID), 'app_meta.source': 'mobile-app' },
      { $set: { payment_intent: { id: 'pi_123', client_secret_redacted: true }, updated_at: NOW } },
    );
  });

  it('throws NotFound when nothing matched (unknown or not app-created)', async () => {
    const { repo, collection } = setup();
    collection.updateOne.mockResolvedValue({ matchedCount: 0 });
    await expect(repo.attachPaymentIntent(OID, 'pi_123')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects malformed ids and intent ids without writing', async () => {
    const { repo, collection } = setup();
    await expect(repo.attachPaymentIntent('zzz', 'pi_1')).rejects.toBeInstanceOf(NotFoundError);
    for (const bad of ['', 'pi 1', 'pi_1;drop', '$set', 'x'.repeat(256)]) await expect(repo.attachPaymentIntent(OID, bad)).rejects.toThrow(RangeError);
    expect(collection.updateOne).not.toHaveBeenCalled();
  });
});

describe('applyPaymentTransition', () => {
  const paid: PaymentTransition = { kind: 'paid', paymentIntentId: 'pi_1' };

  it.each([
    ['paid', ['payment-pending', 'payment-processing', 'payment-failed']],
    ['failed', ['payment-pending', 'payment-processing', 'payment-failed']],
    ['cancelled', ['payment-pending', 'payment-failed']],
    ['refunded', ['payment-success']],
  ] as const)('%s: one findOneAndUpdate, source filter, monotonic payment filter', async (kind, allowed) => {
    const { repo, collection } = setup();
    collection.findOneAndUpdate.mockResolvedValue(appDoc({ payment_status: 'payment-success' }));
    await repo.applyPaymentTransition(OID, { kind, paymentIntentId: 'pi_1' });
    expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, , options] = collection.findOneAndUpdate.mock.calls[0] as unknown as [Record<string, unknown>, unknown, unknown];
    expect(filter).toEqual({
      _id: new ObjectId(OID),
      'app_meta.source': 'mobile-app',
      payment_status: { $in: allowed },
      'payment_intent.id': { $in: ['pi_1', null] },
    });
    expect(options).toEqual({ returnDocument: 'after' });
    expect(collection.updateOne).not.toHaveBeenCalled();
    expect(collection.insertOne).not.toHaveBeenCalled();
  });

  it('paid uses a pipeline that only replaces order-pending', async () => {
    const { repo, collection } = setup({ PAID_ORDER_STATUS: 'order-processing' });
    collection.findOneAndUpdate.mockResolvedValue(appDoc());
    await repo.applyPaymentTransition(OID, paid);
    expect(collection.findOneAndUpdate.mock.calls[0]?.[1]).toEqual([
      {
        $set: {
          payment_status: 'payment-success',
          order_status: { $cond: [{ $eq: ['$order_status', 'order-pending'] }, 'order-processing', '$order_status'] },
          updated_at: NOW,
        },
      },
    ]);
  });

  it.each([
    ['failed', { $set: { payment_status: 'payment-failed', updated_at: NOW } }],
    ['cancelled', { $set: { payment_status: 'payment-failed', order_status: 'order-cancelled', updated_at: NOW } }],
    ['refunded', { $set: { payment_status: 'payment-refunded', order_status: 'order-refunded', updated_at: NOW } }],
  ] as const)('%s sets exactly the contract fields', async (kind, update) => {
    const { repo, collection } = setup();
    collection.findOneAndUpdate.mockResolvedValue(appDoc());
    await repo.applyPaymentTransition(OID, { kind, paymentIntentId: 'pi_1' });
    expect(collection.findOneAndUpdate.mock.calls[0]?.[1]).toEqual(update);
  });

  it('returns the updated order', async () => {
    const { repo, collection } = setup();
    collection.findOneAndUpdate.mockResolvedValue(appDoc({ payment_status: 'payment-success' }));
    expect(await repo.applyPaymentTransition(OID, paid)).toMatchObject({ paymentStatus: 'paid', status: 'placed' });
  });

  it('on no match returns the unchanged app order, looked up with the source filter', async () => {
    const { repo, collection } = setup();
    collection.findOneAndUpdate.mockResolvedValue(null);
    collection.findOne.mockResolvedValue(appDoc({ payment_status: 'payment-success' }));
    expect(await repo.applyPaymentTransition(OID, { kind: 'failed', paymentIntentId: 'pi_1' })).toMatchObject({ paymentStatus: 'paid' });
    expect(collection.findOne).toHaveBeenCalledWith({ _id: new ObjectId(OID), 'app_meta.source': 'mobile-app' });
  });

  it('on no match for an unknown or non-app order returns null', async () => {
    const { repo, collection } = setup();
    collection.findOneAndUpdate.mockResolvedValue(null);
    collection.findOne.mockResolvedValue(null);
    expect(await repo.applyPaymentTransition(OID, paid)).toBeNull();
  });

  it('returns null for malformed order ids without touching the database', async () => {
    const { repo, collection } = setup();
    expect(await repo.applyPaymentTransition('nope', paid)).toBeNull();
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  it('rejects malformed intent ids', async () => {
    const { repo, collection } = setup();
    await expect(repo.applyPaymentTransition(OID, { kind: 'paid', paymentIntentId: '$literal' })).rejects.toThrow(RangeError);
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('findStalePending', () => {
  function cursor(docs: unknown[]) {
    const chain = { sort: vi.fn(() => chain), limit: vi.fn(() => chain), toArray: vi.fn(() => Promise.resolve(docs)) };
    return chain;
  }

  it('filters on the app source, pending payment and age; sorts oldest first', async () => {
    const { repo, collection } = setup();
    const chain = cursor([appDoc(), { broken: true }]);
    collection.find.mockReturnValue(chain);
    const cutoff = new Date('2026-03-01T08:00:00Z');
    const result = await repo.findStalePending(cutoff, 25);
    expect(collection.find).toHaveBeenCalledWith({ 'app_meta.source': 'mobile-app', payment_status: 'payment-pending', created_at: { $lt: cutoff } });
    expect(chain.sort).toHaveBeenCalledWith({ created_at: 1 });
    expect(chain.limit).toHaveBeenCalledWith(25);
    expect(result).toHaveLength(1);
  });

  it.each([
    [0, 1],
    [-5, 1],
    [2.9, 2],
    [10_000, 500],
  ])('clamps limit %d to %d', async (given, used) => {
    const { repo, collection } = setup();
    const chain = cursor([]);
    collection.find.mockReturnValue(chain);
    await repo.findStalePending(NOW, given);
    expect(chain.limit).toHaveBeenCalledWith(used);
  });

  it('rejects an invalid cutoff', async () => {
    const { repo, collection } = setup();
    await expect(repo.findStalePending(new Date('nope'), 5)).rejects.toThrow(RangeError);
    expect(collection.find).not.toHaveBeenCalled();
  });
});

describe('safety by construction', () => {
  const source = readFileSync(new URL('../../../src/repositories/mongo-orders.ts', import.meta.url), 'utf8');

  it.each(['deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'updateMany', 'bulkWrite', 'createIndex', 'createIndexes', 'dropIndex', 'drop(', 'insertMany', 'rename', '$where', '$function', '$accumulator'])(
    'never mentions %s',
    (token) => {
      expect(source).not.toContain(token);
    },
  );

  it('every write call site carries the source filter', () => {
    const writes = [...source.matchAll(/orders\.(updateOne|findOneAndUpdate)\(/g)];
    expect(writes).toHaveLength(2);
    expect(source.match(/'app_meta\.source': APP_SOURCE/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
