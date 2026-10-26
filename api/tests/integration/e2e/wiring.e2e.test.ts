import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRuntime } from '../../../src/bootstrap.js';
import { createProductionApp } from '../../../src/composition.js';
import { loadConfig } from '../../../src/config/env.js';
import { closeDatabase, ensureIndexes } from '../../../src/db/client.js';
import { randomUUID } from 'node:crypto';
import { seedDatabase } from '../../support/seed.js';
import type { ErrorBody, ProductListBody } from '../../support/types.js';

/**
 * Runs the REAL production composition (bootstrap.buildRuntime + composition.createProductionApp) against seeded data.
 * Without Stripe secrets it must serve the catalogue and fail checkout closed; this guards the harness wiring
 * (which mirrors composition.ts) against drifting from the production wiring.
 */
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
}, 120_000);

afterAll(async () => {
  await closeDatabase();
  await server.stop();
});

describe('production composition', () => {
  it('serves the catalogue and fails checkout closed (503, no order) when Stripe is not configured', async () => {
    const config = loadConfig({ NODE_ENV: 'test', MONGODB_URI: server.getUri(), MONGODB_DB: 'humis_wiring', LOG_LEVEL: 'silent', TRUSTED_IP_HEADER: 'x-real-ip' });
    const runtime = buildRuntime(config);
    const db = runtime.database.db();
    await seedDatabase(db);
    await ensureIndexes(db);
    const app = createProductionApp(runtime, 'abc123');

    const products = await app.request('/v1/products?limit=100', { headers: { 'x-real-ip': '10.9.0.1' } });
    expect(products.status).toBe(200);
    expect((await products.json() as ProductListBody).items).toHaveLength(17);
    expect(((await (await app.request('/v1/version')).json()) as { commit?: string }).commit).toBe('abc123');
    expect((await (await app.request('/v1/config')).json() as { payments: { enabled: boolean } }).payments.enabled).toBe(false);
    expect((await app.request('/readyz')).status).toBe(200);

    const before = await db.collection('orders').countDocuments({});
    const res = await app.request('/v1/checkout/payment-intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-real-ip': '10.9.0.2' },
      body: JSON.stringify({
        lines: [{ productId: 'aloo-tikki', quantity: 1 }],
        contact: { name: 'Asha Patel', email: 'a@example.com', phone: '07700 900123' },
        address: { line1: '1 St', city: 'London', postcode: 'SW1A 1AA' },
        slot: { date: '2030-03-05', window: 'morning' },
      }),
    });
    expect(res.status).toBe(503);
    expect((await res.json() as ErrorBody).error.code).toBe('payment_provider_error');
    expect(await db.collection('orders').countDocuments({})).toBe(before);
  });

  it('rejects unsigned webhooks (400) when payments are disabled', async () => {
    const config = loadConfig({ NODE_ENV: 'test', MONGODB_URI: server.getUri(), MONGODB_DB: 'humis_wiring', LOG_LEVEL: 'silent' });
    const app = createProductionApp(buildRuntime(config));
    const res = await app.request('/v1/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(400);
  });
});
