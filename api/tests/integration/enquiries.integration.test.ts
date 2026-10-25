import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, ensureIndexes, type Database } from '../../src/db/client.js';
import { defaultIndexes } from '../../src/db/indexes.js';
import { hashIp } from '../../src/enquiries/ip-hash.js';
import { Secret } from '../../src/lib/secret.js';
import { MemoryRateLimitStore } from '../../src/lib/rate-limit-store.js';
import { createMongoEnquiryRepository, enquiryIndexes, ENQUIRIES_COLLECTION } from '../../src/repositories/mongo-enquiries.js';
import { enquiryRoutes } from '../../src/routes/enquiries.js';
import { post, SALT, validB2b, validContact } from '../unit/enquiries/support.js';
import { testApp } from '../unit/helpers.js';

let server: MongoMemoryServer;
let database: Database;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  database = createDatabase({ uri: new Secret(server.getUri()), dbName: 'humis_enquiries_test' });
  await ensureIndexes(database.db(), [...defaultIndexes, enquiryIndexes]);
}, 120_000);

afterAll(async () => {
  await database.close();
  await server.stop();
});

function appFor(now: Date) {
  const store = new MemoryRateLimitStore();
  const enquiries = createMongoEnquiryRepository(database.db(), { now: () => now });
  return testApp(
    (a) => a.route('/v1', enquiryRoutes({ enquiries, clock: { now: () => now }, rateLimitStore: store }, { ipSalt: SALT })),
    { rateLimitStore: store },
    { TRUSTED_IP_HEADER: 'x-real-ip' },
  );
}

describe('enquiries against a real MongoDB', () => {
  it('creates the declared indexes', async () => {
    const names = (await database.db().collection(ENQUIRIES_COLLECTION).indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['createdAt_desc', 'status_createdAt_desc']));
  });

  it('persists a b2b enquiry with a hashed IP, status new and the injected clock time', async () => {
    const now = new Date('2026-03-04T05:06:07.000Z');
    const res = await post(appFor(now), validB2b, '203.0.113.77');
    expect(res.status).toBe(202);
    const { id } = (await res.json()) as { id: string };

    const docs = await database.db().collection(ENQUIRIES_COLLECTION).find({}).toArray();
    const doc = docs.find((d) => d._id.toHexString() === id);
    expect(doc).toMatchObject({
      type: 'b2b',
      name: validB2b.name,
      email: validB2b.email,
      phone: validB2b.phone,
      business: validB2b.business,
      message: validB2b.message,
      ipHash: hashIp('203.0.113.77', SALT),
      status: 'new',
      createdAt: now,
    });
    expect(JSON.stringify(doc)).not.toContain('203.0.113.77');
  });

  it('stores adversarial text verbatim and inert, and drops honeypot hits', async () => {
    const app = appFor(new Date());
    const before = await database.db().collection(ENQUIRIES_COLLECTION).countDocuments();
    const message = '<script>alert(1)</script> {"$gt":""} ${jndi:ldap://x}';
    expect((await post(app, { ...validContact, message }, '198.51.100.1')).status).toBe(202);
    expect((await post(app, { ...validContact, website: 'spam' }, '198.51.100.2')).status).toBe(202);
    const stored = await database.db().collection(ENQUIRIES_COLLECTION).find({ message }).toArray();
    expect(stored).toHaveLength(1);
    expect(await database.db().collection(ENQUIRIES_COLLECTION).countDocuments()).toBe(before + 1);
  });
});
