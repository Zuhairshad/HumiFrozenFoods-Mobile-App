import { describe, expect, it, vi } from 'vitest';
import { createHttpEnquiryTransport, EnquirySendError, toEnquiryRequest } from '../../src/features/account/enquiry-http';
import { createHttpClient } from '../../src/lib/api/http';

const base = { submittedAt: '2026-10-25T00:00:00Z' };

describe('enquiry http transport', () => {
  it('maps variants to the contract and always sends an empty honeypot', () => {
    const b2b = toEnquiryRequest({ ...base, variant: 'b2b', values: { name: 'A', businessName: 'Cafe', email: 'a@b.co', phone: '0700', category: 'Caterer', volume: '50 to 200', message: '' } });
    expect(b2b).toMatchObject({ type: 'b2b', business: { name: 'Cafe', type: 'Caterer' }, website: '' });
    expect(b2b.message).toContain('50 to 200');
    const rep = toEnquiryRequest({ ...base, variant: 'salesRep', values: { name: 'A', email: 'a@b.co', area: 'Leeds', volume: '1 to 3 years' } });
    expect(rep.type).toBe('sales-rep');
    expect(rep.message).toContain('Area: Leeds');
    const contact = toEnquiryRequest({ ...base, variant: 'contact', values: { name: 'A', email: 'a@b.co', category: 'Order', message: 'Where is it?' } });
    expect(contact).toMatchObject({ type: 'contact', website: '' });
    expect(contact).not.toHaveProperty('phone');
  });

  const client = (res: () => Promise<Response>) => createHttpClient({ baseUrl: 'https://a', fetchImpl: vi.fn(res) as unknown as typeof fetch, sleep: async () => {} });

  it('POSTs and resolves on 202', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: '1' }), { status: 202 }));
    const t = createHttpEnquiryTransport(() => createHttpClient({ baseUrl: 'https://a', fetchImpl: fetchImpl as unknown as typeof fetch }));
    await expect(t.send({ ...base, variant: 'contact', values: { name: 'A', email: 'a@b.co', message: 'hello there' } })).resolves.toBeUndefined();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://a/v1/enquiries');
    expect(JSON.parse(init.body as string).website).toBe('');
    expect(t.deliversToStaff).toBe(true);
  });

  it('surfaces 429 with wait and validation field errors', async () => {
    const limited = createHttpEnquiryTransport(() => client(async () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'x' } }), { status: 429, headers: { 'Retry-After': '7200' } })));
    await expect(limited.send({ ...base, variant: 'contact', values: {} })).rejects.toMatchObject({ kind: 'rate_limited', message: expect.stringContaining('2 hours') });
    const bad = createHttpEnquiryTransport(() => client(async () => new Response(JSON.stringify({ error: { code: 'validation_failed', message: 'Bad', details: [{ path: 'business.name', message: 'Too short' }] } }), { status: 400 })));
    const e = (await bad.send({ ...base, variant: 'b2b', values: {} }).catch((x) => x)) as EnquirySendError;
    expect(e).toBeInstanceOf(EnquirySendError);
    expect(e.fieldErrors).toEqual({ businessName: 'Too short' });
  });

  it('network failure is a retryable message', async () => {
    const t = createHttpEnquiryTransport(() => client(async () => { throw new TypeError('offline'); }));
    await expect(t.send({ ...base, variant: 'contact', values: {} })).rejects.toMatchObject({ kind: 'network' });
  });
});
