import { ObjectId, type Db, type Document, type Filter } from 'mongodb';
import type { Logger } from 'pino';
import { emptyCollectionCounts } from '../catalog/collections.js';
import { decodeCursor, encodeCursor } from '../catalog/cursor.js';
import { mapProductDocument } from '../catalog/product-mapper.js';
import { escapeRegExp } from '../catalog/sanitize.js';
import { TtlValue } from '../catalog/ttl-cache.js';
import type { Clock, ProductQuery, ProductsRepository } from '../domain/ports.js';
import type { BusinessConfig, CollectionId, ProductRecord } from '../domain/types.js';
import { isObjectIdString } from '../lib/ids.js';

export interface MongoProductsOptions {
  logger?: Logger;
  clock?: Clock;
}

const COUNT_TTL_MS = 60_000;
const MAX_Q_LENGTH = 60;
const MAX_SLUGS = 200;
const MAX_ALL_PUBLISHED = 1000;
const MAX_SCAN_BATCHES = 20;
const COLLECTION_SCAN_BATCH = 100;
const QUERY_TIMEOUT_MS = 5000;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

/**
 * Only these fields are ever fetched. b2b_pricing, sold_quantity, sku, __v, type, product_details and the rest of the
 * site document stay in the database. `quantity` is fetched because the server prices against stock; the mapper never
 * puts it on the wire.
 */
const PROJECTION = {
  _id: 1,
  slug: 1,
  name: 1,
  description: 1,
  price: 1,
  sale_price: 1,
  discount: 1,
  quantity: 1,
  in_stock: 1,
  unit: 1,
  image: 1,
  gallery: 1,
  'categories._id': 1,
  'categories.name': 1,
  'categories.slug': 1,
  ratings: 1,
  total_reviews: 1,
} as const;

/**
 * `status: 'publish'` is the marker observed on all live products; the site itself also filters visibility_public, so a
 * product explicitly set to anything other than "public" stays hidden. A missing visibility field counts as public.
 */
const PUBLISHED: Filter<Document> = { status: 'publish', visibility: { $in: ['public', null] } };

function noopLogger(): Pick<Logger, 'warn'> {
  return { warn: () => undefined };
}

export function createMongoProductsRepository(
  db: Db,
  business: BusinessConfig,
  options: MongoProductsOptions = {},
): ProductsRepository {
  const collection = db.collection(business.collections.products);
  const clock = options.clock ?? { now: () => new Date() };
  const logger = options.logger ?? noopLogger();
  const counts = new TtlValue<Record<CollectionId, number>>(clock, COUNT_TTL_MS);

  function mapAll(docs: readonly Document[]): ProductRecord[] {
    const records: ProductRecord[] = [];
    for (const doc of docs) {
      const result = mapProductDocument(doc, business);
      if (result.ok) {
        records.push(result.record);
      } else {
        // The id is a database key, not personal data; the reason never contains document content.
        logger.warn({ productId: String(doc['_id']), reason: result.reason }, 'skipping malformed product document');
      }
    }
    return records;
  }

  async function findDocs(filter: Filter<Document>, limit: number): Promise<Document[]> {
    return collection
      .find(filter, { projection: PROJECTION, maxTimeMS: QUERY_TIMEOUT_MS })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
  }

  function listFilter(query: ProductQuery, after: ObjectId | undefined): Filter<Document> {
    const clauses: Filter<Document>[] = [PUBLISHED];
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, MAX_Q_LENGTH) : '';
    if (q !== '') clauses.push({ name: { $regex: escapeRegExp(q), $options: 'i' } });
    if (after) clauses.push({ _id: { $gt: after } });
    return { $and: clauses };
  }

  return {
    async list(query) {
      const limit = Math.max(1, Math.min(100, Math.trunc(query.limit)));
      let after = query.cursor === undefined ? undefined : new ObjectId(decodeCursor(query.cursor));
      const wanted = limit + 1;
      const batchSize = query.collection === undefined ? wanted : COLLECTION_SCAN_BATCH;
      const matched: ProductRecord[] = [];
      let exhausted = false;
      let lastScanned: string | undefined;

      for (let batch = 0; batch < MAX_SCAN_BATCHES && matched.length < wanted && !exhausted; batch += 1) {
        const docs = await findDocs(listFilter(query, after), batchSize);
        exhausted = docs.length < batchSize;
        for (const record of mapAll(docs)) {
          if (query.collection === undefined || record.collection === query.collection) matched.push(record);
        }
        const last = docs.at(-1);
        if (last) {
          after = last['_id'] as ObjectId;
          lastScanned = after.toHexString();
        }
      }

      const items = matched.slice(0, limit);
      if (matched.length > limit) return { items, nextCursor: encodeCursor(items[limit - 1]?.sourceId ?? '') };
      if (exhausted || lastScanned === undefined) return { items, nextCursor: null };
      // Scan budget spent without filling the page: resume after the last document looked at.
      return { items, nextCursor: encodeCursor(lastScanned) };
    },

    async findByIdOrSlug(idOrSlug) {
      if (typeof idOrSlug !== 'string') return null;
      const byId = isObjectIdString(idOrSlug) ? [{ _id: new ObjectId(idOrSlug) }] : [];
      const bySlug = SLUG.test(idOrSlug) ? [{ slug: idOrSlug }] : [];
      const alternatives = [...byId, ...bySlug];
      if (alternatives.length === 0) return null;
      const docs = await findDocs({ $and: [PUBLISHED, { $or: alternatives }] }, 2);
      return mapAll(docs)[0] ?? null;
    },

    async findManyBySlugs(slugs) {
      const valid = [...new Set(slugs.filter((s) => typeof s === 'string' && SLUG.test(s)))].slice(0, MAX_SLUGS);
      if (valid.length === 0) return [];
      return mapAll(await findDocs({ $and: [PUBLISHED, { slug: { $in: valid } }] }, MAX_SLUGS));
    },

    countByCollection() {
      return counts.get(async () => {
        const totals = emptyCollectionCounts();
        for (const record of mapAll(await findDocs(PUBLISHED, MAX_ALL_PUBLISHED))) totals[record.collection] += 1;
        return totals;
      });
    },
  };
}
