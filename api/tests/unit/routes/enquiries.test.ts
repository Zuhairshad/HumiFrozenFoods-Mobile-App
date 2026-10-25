import { describe, expect, it } from 'vitest';
import type { EnquiryNotifier } from '../../../src/enquiries/notifier.js';
import { hashIp } from '../../../src/enquiries/ip-hash.js';
import { MemoryRateLimitStore, type RateLimitStore } from '../../../src/lib/rate-limit-store.js';
import { enquiryRoutes } from '../../../src/routes/enquiries.js';
import { errorBody } from '../helpers.js';
import { harness, post, SALT, validB2b, validContact, validSalesRep } from '../enquiries/support.js';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('POST /v1/enquiries', () => {
  it('stores a valid contact enquiry and answers 202 {id}', async () => {
    const { app, repo, notified } = harness();
    const res = await post(app, validContact);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string };
    expect(body).toEqual({ id: repo.rows[0]?.id });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({ type: 'contact', name: 'Ada Lovelace', email: 'ada@example.com' });
    await flush();
    expect(notified).toEqual([
      { id: body.id, type: 'contact', name: 'Ada Lovelace', email: 'ada@example.com', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
    expect(JSON.stringify(notified)).not.toContain('samosas');
  });

  it('stores b2b and sales-rep enquiries and passes the business name to the notifier', async () => {
    const { app, repo, notified } = harness();
    expect((await post(app, validB2b, '198.51.100.1')).status).toBe(202);
    expect((await post(app, validSalesRep, '198.51.100.2')).status).toBe(202);
    expect(repo.rows.map((r) => r.type)).toEqual(['b2b', 'sales-rep']);
    expect(repo.rows[0]?.business).toEqual({ name: 'Bob Convenience', type: 'Retailer' });
    await flush();
    expect(notified[0]).toMatchObject({ businessName: 'Bob Convenience' });
    expect(notified[1]).not.toHaveProperty('businessName');
  });

  it('stores only the salted IP hash, never the raw address', async () => {
    const { app, repo } = harness();
    await post(app, validContact, '203.0.113.99');
    const row = repo.rows[0];
    expect(row?.ipHash).toBe(hashIp('203.0.113.99', SALT));
    expect(JSON.stringify(row)).not.toContain('203.0.113.99');
  });

  it('keeps stored-XSS and operator strings as plain text', async () => {
    const { app, repo } = harness();
    const message = '<script>alert(document.cookie)</script> {"$where":"sleep(1000)"}';
    const res = await post(app, { ...validContact, name: '<img src=x onerror=alert(1)>', message });
    expect(res.status).toBe(202);
    expect(repo.rows[0]?.name).toBe('<img src=x onerror=alert(1)>');
    expect(repo.rows[0]?.message).toBe(message);
  });

  it('rejects NoSQL operator keys before validation', async () => {
    const { app, repo } = harness();
    const res = await post(app, { ...validContact, email: { $ne: null } });
    expect(res.status).toBe(400);
    expect((await errorBody(res)).error.code).toBe('unsafe_input');
    expect((await post(app, JSON.parse('{"__proto__":{"admin":true},"type":"contact"}') as unknown)).status).toBe(400);
    expect(repo.rows).toHaveLength(0);
  });

  it('answers 400 validation_failed with paths only, never echoing values', async () => {
    const { app, repo } = harness();
    const secret = 'not-an-email-PII-marker';
    const res = await post(app, { ...validContact, email: secret });
    expect(res.status).toBe(400);
    const body = await errorBody(res);
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details).toEqual([{ path: 'email', message: 'Enter a valid email' }]);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(repo.rows).toHaveLength(0);
  });

  it('rejects header injection in name and email', async () => {
    const { app, repo } = harness();
    expect((await post(app, { ...validContact, name: 'Ada\r\nBcc: x@evil.test' })).status).toBe(400);
    expect((await post(app, { ...validContact, email: 'a@example.com\r\nBcc: x@evil.test' })).status).toBe(400);
    expect(repo.rows).toHaveLength(0);
  });

  it('rejects zero-width and RTL override characters', async () => {
    const { app, repo } = harness();
    expect((await post(app, { ...validContact, name: 'Ada​L' })).status).toBe(400);
    expect((await post(app, { ...validContact, message: 'harmless text ‮gnp.exe' })).status).toBe(400);
    expect(repo.rows).toHaveLength(0);
  });

  it('rejects malformed JSON, wrong content type and oversize bodies', async () => {
    const { app, repo } = harness();
    const malformed = await post(app, '{"type":', '203.0.113.7', true);
    expect(malformed.status).toBe(400);
    expect((await errorBody(malformed)).error.code).toBe('invalid_json');

    const wrongType = await app.request('/v1/enquiries', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    expect(wrongType.status).toBe(415);

    const giant = await post(app, { ...validContact, message: 'x'.repeat(300_000) });
    expect(giant.status).toBe(413);
    expect(repo.rows).toHaveLength(0);
  });

  it('rejects a giant message just under the body limit without storing it', async () => {
    const { app, repo } = harness();
    const res = await post(app, { ...validContact, message: 'x'.repeat(90_000) });
    expect(res.status).toBe(400);
    expect(repo.rows).toHaveLength(0);
  });

  it('silently drops honeypot submissions with a 202 of the same shape', async () => {
    const { app, repo, notified } = harness();
    const res = await post(app, { ...validContact, website: 'http://spam.example' });
    expect(res.status).toBe(202);
    expect(((await res.json()) as { id: string }).id).toMatch(/^[0-9a-f]{24}$/);
    // Even a body that would otherwise be invalid is dropped, not told it failed.
    expect((await post(app, { type: 'bogus', website: 'x' })).status).toBe(202);
    await flush();
    expect(repo.rows).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it('accepts an empty honeypot', async () => {
    const { app, repo } = harness();
    expect((await post(app, { ...validContact, website: '' })).status).toBe(202);
    expect(repo.rows).toHaveLength(1);
  });

  it('suppresses duplicates from one IP within the window without a second insert or notification', async () => {
    const { app, repo, notified } = harness();
    const first = await post(app, validContact);
    const second = await post(app, { ...validContact, message: `  ${validContact.message.toUpperCase()}\n` });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(((await second.json()) as { id: string }).id).toMatch(/^[0-9a-f]{24}$/);
    await flush();
    expect(repo.rows).toHaveLength(1);
    expect(notified).toHaveLength(1);
  });

  it('does not treat other IPs or other messages as duplicates', async () => {
    const { app, repo } = harness();
    await post(app, validContact, '198.51.100.1');
    await post(app, validContact, '198.51.100.2');
    await post(app, { ...validContact, message: 'A completely different question here.' }, '198.51.100.1');
    expect(repo.rows).toHaveLength(3);
  });

  it('still stores the enquiry when the dedupe store fails', async () => {
    const real = new MemoryRateLimitStore();
    const store: RateLimitStore = {
      hit: (key, windowMs) => (key.startsWith('enquiry-dup:') ? Promise.reject(new Error('redis down')) : real.hit(key, windowMs)),
    };
    const { app, repo } = harness({ store });
    expect((await post(app, validContact)).status).toBe(202);
    expect(repo.rows).toHaveLength(1);
  });

  it('rate limits to 5 per hour per IP with Retry-After, then recovers per IP', async () => {
    const { app, repo } = harness();
    for (let i = 0; i < 5; i += 1) {
      const res = await post(app, { ...validContact, message: `Question number ${i} about delivery.` });
      expect(res.status).toBe(202);
    }
    const blocked = await post(app, { ...validContact, message: 'Question number 6 about delivery.' });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await errorBody(blocked)).error.code).toBe('rate_limited');
    expect(repo.rows).toHaveLength(5);
    expect((await post(app, validContact, '198.51.100.50')).status).toBe(202);
  });

  it('counts honeypot and invalid attempts against the budget', async () => {
    const { app } = harness();
    for (let i = 0; i < 3; i += 1) await post(app, { ...validContact, website: 'x' });
    for (let i = 0; i < 2; i += 1) await post(app, { type: 'contact' });
    expect((await post(app, validContact)).status).toBe(429);
  });

  it('never fails the request when the notifier rejects or throws synchronously', async () => {
    const rejecting: EnquiryNotifier = { notify: () => Promise.reject(new Error('smtp exploded for ada@example.com')) };
    const throwing: EnquiryNotifier = {
      notify: () => {
        throw new Error('sync boom');
      },
    };
    for (const notifier of [rejecting, throwing]) {
      const { app, repo } = harness({ notifier });
      const res = await post(app, validContact);
      expect(res.status).toBe(202);
      await flush();
      expect(repo.rows).toHaveLength(1);
    }
  });

  it('answers 500 internal_error when the repository fails', async () => {
    const { app, repo } = harness();
    repo.failWith = new Error('mongo: E11000 at 10.0.0.5 ada@example.com');
    const res = await post(app, validContact);
    expect(res.status).toBe(500);
    expect((await errorBody(res)).error.code).toBe('internal_error');
  });

  it('answers 405 for GET', async () => {
    const { app } = harness();
    expect((await app.request('/v1/enquiries')).status).toBe(405);
  });

  it('defaults to the no-op notifier and refuses an empty salt', () => {
    expect(() => enquiryRoutes({ enquiries: harness().repo, clock: { now: () => new Date() }, rateLimitStore: new MemoryRateLimitStore() }, { ipSalt: '' })).toThrow();
    const repo = harness().repo;
    const routes = enquiryRoutes({ enquiries: repo, clock: { now: () => new Date() }, rateLimitStore: new MemoryRateLimitStore() }, { ipSalt: SALT });
    expect(routes).toBeDefined();
  });
});
