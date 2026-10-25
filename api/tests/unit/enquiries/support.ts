import type { Hono } from 'hono';
import type { EnquiryRepository } from '../../../src/domain/ports.js';
import type { EnquiryInput } from '../../../src/domain/types.js';
import type { EnquiryNotifier } from '../../../src/enquiries/notifier.js';
import { MemoryRateLimitStore, type RateLimitStore } from '../../../src/lib/rate-limit-store.js';
import { enquiryRoutes } from '../../../src/routes/enquiries.js';
import type { AppEnv } from '../../../src/types.js';
import { testApp } from '../helpers.js';

export const SALT = 'test-salt-0123456789';

export class FakeEnquiryRepository implements EnquiryRepository {
  readonly rows: (EnquiryInput & { ipHash: string; id: string })[] = [];
  failWith: Error | undefined;

  insert(enquiry: EnquiryInput & { ipHash: string }): Promise<{ id: string }> {
    if (this.failWith) return Promise.reject(this.failWith);
    const id = (this.rows.length + 1).toString(16).padStart(24, '0');
    this.rows.push({ ...enquiry, id });
    return Promise.resolve({ id });
  }
}

export interface Harness {
  app: Hono<AppEnv>;
  repo: FakeEnquiryRepository;
  store: RateLimitStore;
  notified: unknown[];
}

export function harness(options: { notifier?: EnquiryNotifier; store?: RateLimitStore } = {}): Harness {
  const repo = new FakeEnquiryRepository();
  const store = options.store ?? new MemoryRateLimitStore();
  const notified: unknown[] = [];
  const notifier: EnquiryNotifier = options.notifier ?? {
    notify: (summary) => {
      notified.push(summary);
      return Promise.resolve();
    },
  };
  const clock = { now: () => new Date('2026-01-01T00:00:00.000Z') };
  const app = testApp(
    (hono) => {
      hono.route('/v1', enquiryRoutes({ enquiries: repo, clock, rateLimitStore: store }, { ipSalt: SALT, notifier }));
    },
    { rateLimitStore: store },
    { TRUSTED_IP_HEADER: 'x-real-ip' },
  );
  return { app, repo, store, notified };
}

export function post(app: Hono<AppEnv>, body: unknown, ip = '203.0.113.7', raw = false) {
  return app.request('/v1/enquiries', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

export const validContact = {
  type: 'contact',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'Do you deliver frozen samosas to Leeds?',
};

export const validB2b = {
  type: 'b2b',
  name: 'Bob Trader',
  email: 'bob@shop.co.uk',
  phone: '+44 (0)20 7946 0958',
  business: { name: 'Bob Convenience', type: 'Retailer' },
  message: 'We would like a wholesale price list please.',
};

export const validSalesRep = {
  type: 'sales-rep',
  name: 'Sam Rep',
  email: 'sam@example.org',
  phone: '07700 900123',
  message: 'Interested in representing Humi in the north.',
};
