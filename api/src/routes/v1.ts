import { Hono } from 'hono';
import type { MountRoutes } from '../app.js';
import type { FeatureDeps } from '../domain/ports.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { AppEnv } from '../types.js';
import { catalogRoutes } from './catalog.js';
import { enquiryRoutes } from './enquiries.js';
import { ordersRoutes } from './orders.js';
import { paymentIntentRoutes } from './payment-intent.js';
import { quoteRoutes } from './quote.js';
import { versionRoutes } from './version.js';
import { webhookRoutes } from './webhooks.js';

export interface V1Options {
  /** Salt for hashing client IPs stored with enquiries. */
  ipSalt: string;
  commit?: string | undefined;
}

/** Mounts every feature route under /v1. All routes are defined in their own module and receive the same FeatureDeps. */
export function mountV1(features: FeatureDeps, options: V1Options): MountRoutes {
  return (app) => {
    const v1 = new Hono<AppEnv>();

    // Generous but finite: signature checks are cheap, yet an open endpoint should still have a ceiling.
    v1.use(
      '/webhooks/*',
      rateLimit({ store: features.rateLimitStore, name: 'webhook', limit: 600, windowMs: 60_000 }),
    );

    v1.route('/', catalogRoutes(features));
    v1.route('/', quoteRoutes(features));
    v1.route('/', paymentIntentRoutes(features));
    v1.route('/', ordersRoutes(features));
    v1.route('/', enquiryRoutes(features, { ipSalt: options.ipSalt }));
    v1.route('/', versionRoutes(options.commit === undefined ? {} : { commit: options.commit }));
    v1.route('/', webhookRoutes(features));

    app.route('/v1', v1);
  };
}
