import { createHash, randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import type { FeatureDeps } from '../domain/ports.js';
import { dedupeText, enquirySchema, isHoneypotTripped } from '../enquiries/validation.js';
import { hashIp } from '../enquiries/ip-hash.js';
import { NoopNotifier, type EnquiryNotifier } from '../enquiries/notifier.js';
import { BadRequestError } from '../lib/errors.js';
import { parseWith } from '../lib/validation.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { AppEnv } from '../types.js';

const HOUR_MS = 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
export const ENQUIRY_RATE_LIMIT = 5;

export interface EnquiryRouteOptions {
  ipSalt: string;
  /** Defaults to NoopNotifier: no email provider has been chosen. */
  notifier?: EnquiryNotifier;
}

/** A well-formed id that matches nothing, so dropped submissions look like stored ones. */
function decoyId(): string {
  return randomBytes(12).toString('hex');
}

export function enquiryRoutes(
  deps: Pick<FeatureDeps, 'enquiries' | 'clock' | 'rateLimitStore'>,
  opts: EnquiryRouteOptions,
): Hono<AppEnv> {
  if (opts.ipSalt.length === 0) throw new Error('enquiryRoutes requires a non-empty ipSalt');
  const notifier = opts.notifier ?? new NoopNotifier();
  const app = new Hono<AppEnv>();

  app.post(
    '/enquiries',
    // Counts every attempt (invalid, honeypot, duplicate) so probing is throttled too.
    rateLimit({ store: deps.rateLimitStore, name: 'enquiries', limit: ENQUIRY_RATE_LIMIT, windowMs: HOUR_MS }),
    async (c) => {
      const raw: unknown = await c.req.json().catch(() => {
        throw new BadRequestError('Request body must be valid JSON', 'invalid_json');
      });

      if (isHoneypotTripped(raw)) {
        c.get('logger').info('enquiry dropped by honeypot');
        return c.json({ id: decoyId() }, 202);
      }

      const enquiry = parseWith(enquirySchema, raw);
      const ipHash = hashIp(c.get('clientIp'), opts.ipSalt);

      const messageKey = createHash('sha256').update(dedupeText(enquiry.message)).digest('hex');
      try {
        const seen = await deps.rateLimitStore.hit(`enquiry-dup:${ipHash}:${messageKey}`, DUPLICATE_WINDOW_MS);
        if (seen.count > 1) return c.json({ id: decoyId() }, 202);
      } catch (error) {
        // Dedupe is best effort; losing it must not lose the enquiry.
        c.get('logger').error({ err: error }, 'enquiry dedupe store failed');
      }

      const { id } = await deps.enquiries.insert({ ...enquiry, ipHash });

      // Fire and forget: a broken transport must never fail an already stored enquiry.
      // Only the error name is logged; messages from transports can echo addresses.
      const logger = c.get('logger');
      const summary = {
        id,
        type: enquiry.type,
        name: enquiry.name,
        email: enquiry.email,
        createdAt: deps.clock.now(),
        ...(enquiry.business ? { businessName: enquiry.business.name } : {}),
      };
      void Promise.resolve()
        .then(() => notifier.notify(summary))
        .catch((error: unknown) => {
          logger.warn({ errName: error instanceof Error ? error.name : 'unknown' }, 'enquiry notifier failed');
        });

      return c.json({ id }, 202);
    },
  );

  return app;
}
