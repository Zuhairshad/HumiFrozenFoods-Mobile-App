import { readFileSync } from 'node:fs';
import { type Collection, type Document, type CommandStartedEvent, MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { encodeCursor } from '../../src/catalog/cursor.js';
import type { FeatureDeps } from '../../src/domain/ports.js';
import type { BusinessConfig } from '../../src/domain/types.js';
import { createLogger } from '../../src/lib/logger.js';
import { BadRequestError } from '../../src/lib/errors.js';
import { createMongoProductsRepository } from '../../src/repositories/mongo-products.js';
import { catalogRoutes } from '../../src/routes/catalog.js';
import { captureLogs, testApp, testConfig, testDeps } from '../unit/helpers.js';

const FIXTURE = new URL('../fixtures/products.live.json', import.meta.url);

let server: MongoMemoryServer;
let client: MongoClient;
let products: Collection;
let found: CommandStartedEvent[] = [];
const business: BusinessConfig = testConfig().business;

function liveDocs(): Document[] {
  const parsed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { results: Document[] };
  return parsed.results.map((doc) => ({ ...doc, _id: new ObjectId(String(doc['_id'])) }));
}

let counter = 0;
function extra(fields: Document): Document {
  counter += 1;
  return { _id: new ObjectId(), slug: `extra-${String(counter)}`, name: `Extra ${String(counter)}`, price: 5, quantity: 10, in_stock: true, status: 'publish', visibility: 'public', b2b_pricing: { price: 1 }, sku: 'X', __v: 0, ...fields };
}

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = new MongoClient(server.getUri(), { monitorCommands: true });
  client.on('commandStarted', (event: CommandStartedEvent) => {
    if (event.commandName === 'find') found.push(event);
  });
  await client.connect();
  products = client.db('humis_test').collection('products');
}, 120_000);

afterAll(async () => {
  await client.close();
  await server.stop();
});

beforeEach(async () => {
  await products.deleteMany({});
  await products.insertMany(liveDocs());
  found = [];
});

function repo(overrides: { clock?: { now: () => Date }; logger?: ReturnType<typeof createLogger> } = {}) {
  return createMongoProductsRepository(client.db('humis_test'), business, overrides);
}

describe('createMongoProductsRepository.list', () => {
  it('lists the 17 live products sorted by _id with no cursor at the end', async () => {
    const page = await repo().list({ limit: 50 });
    expect(page.items).toHaveLength(17);
    expect(page.nextCursor).toBeNull();
    const ids = page.items.map((p) => p.sourceId);
    expect(ids).toEqual([...ids].sort());
  });

  it('pages without gaps or duplicates and ends cleanly on an exact multiple', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await repo().list({ limit: 5, ...(cursor === undefined ? {} : { cursor }) });
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor !== undefined && pages < 10);
    expect(pages).toBe(4);
    expect(new Set(seen).size).toBe(17);

    const exact = await repo().list({ limit: 17 });
    expect(exact.nextCursor).toBeNull();
    const firstOfSixteen = await repo().list({ limit: 16 });
    expect(firstOfSixteen.nextCursor).not.toBeNull();
    const last = await repo().list({ limit: 16, cursor: firstOfSixteen.nextCursor ?? '' });
    expect(last.items).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
  });

  it('only returns published, public products', async () => {
    await products.insertMany([
      extra({ slug: 'draft-one', status: 'draft' }),
      extra({ slug: 'private-one', visibility: 'private' }),
      extra({ slug: 'hidden-one', visibility: 'visibility_private' }),
      extra({ slug: 'no-visibility', visibility: undefined }),
      extra({ slug: 'null-visibility', visibility: null }),
      extra({ slug: 'no-status', status: undefined }),
    ]);
    const slugs = (await repo().list({ limit: 100 })).items.map((p) => p.id);
    expect(slugs).toContain('no-visibility');
    expect(slugs).toContain('null-visibility');
    for (const hidden of ['draft-one', 'private-one', 'hidden-one', 'no-status']) expect(slugs).not.toContain(hidden);
    expect(slugs).toHaveLength(19);
  });

  it('filters by derived collection across batches and paginates the filtered set', async () => {
    const all = (await repo().list({ limit: 100 })).items;
    const kebabs = all.filter((p) => p.collection === 'kebabs').map((p) => p.id);
    expect(kebabs.length).toBeGreaterThan(3);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      const page = await repo().list({ collection: 'kebabs', limit: 2, ...(cursor === undefined ? {} : { cursor }) });
      seen.push(...page.items.map((p) => p.id));
      expect(page.items.every((p) => p.collection === 'kebabs')).toBe(true);
      cursor = page.nextCursor ?? undefined;
      if (cursor === undefined) break;
    }
    expect(seen).toEqual(kebabs);
    expect((await repo().list({ collection: 'other', limit: 10 })).items).toEqual([]);
  });

  it('keeps scanning past a long run of non-matching documents', async () => {
    await products.insertMany(Array.from({ length: 250 }, (_, i) => extra({ slug: `zz-${String(i)}`, name: `Zed Samosa ${String(i)}` })));
    const page = await repo().list({ collection: 'samosas', limit: 100 });
    expect(page.items).toHaveLength(100);
    expect(page.nextCursor).not.toBeNull();
  });

  it('hands back a resumable cursor when the scan budget runs out before the page fills', async () => {
    await products.deleteMany({});
    // 2100 documents, none in "kebabs": 20 batches of 100 cannot reach the end.
    await products.insertMany(Array.from({ length: 2100 }, (_, i) => extra({ slug: `bulk-${String(i)}`, name: `Plain item ${String(i)}` })));
    const first = await repo().list({ collection: 'kebabs', limit: 10 });
    expect(first.items).toEqual([]);
    expect(first.nextCursor).not.toBeNull();
    const second = await repo().list({ collection: 'kebabs', limit: 10, cursor: first.nextCursor ?? '' });
    expect(second.nextCursor).toBeNull();
  });

  it('matches q case-insensitively on name only', async () => {
    const page = await repo().list({ q: 'sEeKh', limit: 50 });
    expect(page.items.map((p) => p.id)).toEqual(['chicken-seekh-kebab']);
  });

  it.each([
    ['dot-star', '.*'],
    ['open paren', '('],
    ['bracket', '[a-z]'],
    ['catastrophic', '(a+)+$'],
    ['where', '$where'],
    ['operator json', '{"$ne":null}'],
    ['regex flags trick', 'x/i;while(1){}'],
    ['backslash', '\\'],
    ['pipe', 'samosa|kebab'],
    ['caret anchor', '^'],
  ])('treats %s as literal text and matches nothing', async (_label, q) => {
    const started = performance.now();
    const page = await repo().list({ q, limit: 50 });
    expect(page.items).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('finds a name that literally contains regex metacharacters', async () => {
    await products.insertOne(extra({ slug: 'meta', name: 'Spicy (hot) [x] a+b.c' }));
    expect((await repo().list({ q: '(hot) [x] a+b.c', limit: 5 })).items.map((p) => p.id)).toEqual(['meta']);
    expect((await repo().list({ q: 'a+b.c', limit: 5 })).items).toHaveLength(1);
    expect((await repo().list({ q: 'aab', limit: 5 })).items).toHaveLength(0);
  });

  it('caps an oversize q before it reaches the database', async () => {
    await repo().list({ q: 'a'.repeat(5000), limit: 5 });
    const filter = JSON.stringify((found[0]?.command as { filter: unknown }).filter);
    expect(filter).toContain(`"$regex":"${'a'.repeat(60)}"`);
    expect(filter).not.toContain('a'.repeat(61));
  });

  it('treats a non-string q as absent', async () => {
    const page = await repo().list({ q: { $ne: null } as unknown as string, limit: 50 });
    expect(page.items).toHaveLength(17);
  });

  it('rejects malformed cursors with a 400 before touching the database', async () => {
    for (const cursor of ['', 'abc', '{"$ne":null}', Buffer.from('zzzzzzzzzzzzzzzzzzzzzzzz').toString('base64url')]) {
      await expect(repo().list({ limit: 5, cursor })).rejects.toBeInstanceOf(BadRequestError);
    }
    expect(found).toHaveLength(0);
  });

  it('clamps the limit defensively', async () => {
    expect((await repo().list({ limit: 0 })).items).toHaveLength(1);
    expect((await repo().list({ limit: 10_000 })).items).toHaveLength(17);
  });

  it('skips malformed documents with a warning and still returns the rest', async () => {
    const logs = captureLogs();
    const logger = createLogger({ level: 'warn', destination: logs.stream });
    const bad = new ObjectId();
    await products.insertMany([
      extra({ _id: bad, slug: 'bad slug with spaces' }),
      extra({ price: 'free' }),
      extra({ name: undefined }),
    ]);
    const page = await repo({ logger }).list({ limit: 100 });
    expect(page.items).toHaveLength(17);
    const warnings = logs.lines().filter((l) => l['msg'] === 'skipping malformed product document');
    expect(warnings).toHaveLength(3);
    expect(warnings.find((w) => w['productId'] === bad.toHexString())).toMatchObject({ reason: 'missing or non-URL-safe slug' });
    expect(logs.text()).not.toContain('b2b');
  });

  it('stops paging cleanly at a document whose _id is not an ObjectId', async () => {
    await products.insertOne({ _id: 'handmade' as unknown as ObjectId, slug: 'handmade', name: 'Handmade', price: 1, status: 'publish', visibility: 'public' });
    const page = await repo().list({ limit: 100 });
    expect(page.items).toHaveLength(17);
    expect(page.nextCursor).toBeNull();
  });
});

describe('query shape (what actually reaches MongoDB)', () => {
  it('always filters on status publish and fetches only whitelisted fields', async () => {
    await repo().list({ limit: 5, q: 'x', collection: 'kebabs' });
    await repo().findByIdOrSlug('aloo-tikki');
    await repo().findByIdOrSlug('698601c30c0410b7e96591dc');
    await repo().findManyBySlugs(['aloo-tikki']);
    await repo().countByCollection();
    expect(found).toHaveLength(5);
    for (const event of found) {
      const command = event.command as { filter: unknown; projection: Record<string, number>; sort?: unknown; maxTimeMS?: number };
      const filter = JSON.stringify(command.filter);
      expect(filter).toContain('"status":"publish"');
      expect(filter).toContain('"visibility"');
      expect(Object.keys(command.projection).sort()).toEqual(
        ['_id', 'categories._id', 'categories.name', 'categories.slug', 'description', 'discount', 'gallery', 'image', 'in_stock', 'name', 'price', 'quantity', 'ratings', 'sale_price', 'slug', 'total_reviews', 'unit'].sort(),
      );
      for (const secret of ['b2b_pricing', 'sold_quantity', 'sku', '__v', 'type', 'product_details']) expect(command.projection).not.toHaveProperty(secret);
      expect(command.maxTimeMS).toBeGreaterThan(0);
    }
  });

  it('puts q only inside an escaped $regex on name, never as an operator', async () => {
    await repo().list({ limit: 5, q: '$where' });
    const filter = JSON.stringify((found[0]?.command as { filter: unknown }).filter);
    expect(filter).toContain('"$regex":"\\\\$where"');
    expect(filter).not.toContain('"$where"');
  });
});

describe('findByIdOrSlug', () => {
  it('finds by slug and by hex id (any case)', async () => {
    const bySlug = await repo().findByIdOrSlug('chicken-seekh-kebab');
    expect(bySlug?.collection).toBe('kebabs');
    expect(bySlug?.stock).toBe(1466);
    const byId = await repo().findByIdOrSlug(bySlug?.sourceId.toUpperCase() ?? '');
    expect(byId?.id).toBe('chicken-seekh-kebab');
  });

  it('returns null for unpublished, hidden and unknown products', async () => {
    const draft = extra({ slug: 'draft-two', status: 'draft' });
    await products.insertMany([draft, extra({ slug: 'private-two', visibility: 'private' })]);
    expect(await repo().findByIdOrSlug('draft-two')).toBeNull();
    expect(await repo().findByIdOrSlug((draft['_id'] as ObjectId).toHexString())).toBeNull();
    expect(await repo().findByIdOrSlug('private-two')).toBeNull();
    expect(await repo().findByIdOrSlug('ghost')).toBeNull();
    expect(await repo().findByIdOrSlug('ffffffffffffffffffffffff')).toBeNull();
  });

  it('returns null for malformed or hostile identifiers without querying', async () => {
    for (const value of ['', '$where', '{"$ne":null}', 'a b', '../x', 'a'.repeat(101), { $ne: null } as unknown as string, 42 as unknown as string]) {
      expect(await repo().findByIdOrSlug(value)).toBeNull();
    }
    expect(found).toHaveLength(0);
  });

  it('returns null when the matching document is malformed', async () => {
    await products.insertOne(extra({ slug: 'no-price', price: undefined }));
    expect(await repo().findByIdOrSlug('no-price')).toBeNull();
  });
});

describe('findManyBySlugs', () => {
  it('returns published matches, ignores missing, duplicate and invalid slugs', async () => {
    await products.insertOne(extra({ slug: 'draft-three', status: 'draft' }));
    const result = await repo().findManyBySlugs(['aloo-tikki', 'aloo-tikki', 'ghost', 'draft-three', '$where', '', 'x y']);
    expect(result.map((p) => p.id)).toEqual(['aloo-tikki']);
  });

  it('returns [] without querying when nothing is valid', async () => {
    expect(await repo().findManyBySlugs([])).toEqual([]);
    expect(await repo().findManyBySlugs(['$ne', {} as unknown as string])).toEqual([]);
    expect(found).toHaveLength(0);
  });

  it('caps the number of slugs per query', async () => {
    const slugs = Array.from({ length: 500 }, (_, i) => `s-${String(i)}`);
    await repo().findManyBySlugs(slugs);
    const filter = JSON.stringify((found[0]?.command as { filter: unknown }).filter);
    expect(filter.match(/"s-\d+"/g)).toHaveLength(200);
  });
});

describe('countByCollection', () => {
  it('counts from the mapped list and caches for 60 s on the injected clock', async () => {
    let now = new Date('2026-10-25T10:00:00Z').getTime();
    const clock = { now: () => new Date(now) };
    const r = repo({ clock });
    const first = await r.countByCollection();
    expect(first).toEqual({ 'savory-snacks': 5, kebabs: 5, 'vegetable-samosas': 2, samosas: 5, other: 0 });

    await products.insertOne(extra({ slug: 'new-kebab', name: 'New Kebab' }));
    await products.insertOne(extra({ slug: 'bad', price: -1 }));
    now += 59_000;
    expect(await r.countByCollection()).toEqual(first);
    expect(found).toHaveLength(1);

    now += 1_000;
    const refreshed = await r.countByCollection();
    expect(refreshed.kebabs).toBe(6);
    expect(Object.values(refreshed).reduce((a, b) => a + b, 0)).toBe(18);
  });
});

describe('catalogRoutes over the real repository', () => {
  function app() {
    const base = testDeps();
    const deps = { ...base, products: repo(), payments: { enabled: false } } as unknown as FeatureDeps;
    return testApp((a) => a.route('/v1', catalogRoutes(deps)));
  }

  it('serves a paged product list and single products end to end', async () => {
    const a = app();
    const page = (await (await a.request('/v1/products?limit=3&collection=kebabs')).json()) as { items: { id: string }[]; nextCursor: string };
    expect(page.items).toHaveLength(3);
    const next = (await (await a.request(`/v1/products?limit=3&collection=kebabs&cursor=${page.nextCursor}`)).json()) as { items: unknown[]; nextCursor: string | null };
    expect(next.items).toHaveLength(2);
    expect(next.nextCursor).toBeNull();
    expect((await a.request(`/v1/products/${page.items[0]?.id ?? ''}`)).status).toBe(200);
    expect((await a.request('/v1/products/nope')).status).toBe(404);
    expect((await a.request(`/v1/products?cursor=${encodeCursor('zzzzzzzzzzzzzzzzzzzzzzzz')}`)).status).toBe(400);
    const collections = (await (await a.request('/v1/collections')).json()) as { items: { productCount: number }[] };
    expect(collections.items.map((i) => i.productCount)).toEqual([5, 5, 2, 5]);
  });

  it('exposes nothing from the sensitive fixture fields', async () => {
    const text = await (await app().request('/v1/products?limit=100')).text();
    expect(text).not.toMatch(/b2b|tier_prices|sold_quantity|"sku"|__v|"quantity"|"stock"|"status"|"visibility"|promotional_sliders/);
  });
});
