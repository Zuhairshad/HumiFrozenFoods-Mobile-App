import { Hono } from 'hono';
import type { Logger } from 'pino';
import type { GuestTokenService } from './auth/guest-token.js';
import type { AppConfig } from './config/env.js';
import { createErrorHandler, createNotFoundHandler } from './lib/http.js';
import type { RateLimitStore } from './lib/rate-limit-store.js';
import { accessLog } from './middleware/access-log.js';
import { requestBodyLimit } from './middleware/body-limit.js';
import { clientIp } from './middleware/client-ip.js';
import { corsPolicy } from './middleware/cors.js';
import { rateLimit } from './middleware/rate-limit.js';
import { requestId } from './middleware/request-id.js';
import { requireJson } from './middleware/require-json.js';
import { securityHeaders } from './middleware/security-headers.js';
import { requestTimeout } from './middleware/timeout.js';
import { healthRoutes, type Pingable } from './routes/health.js';
import { WEBHOOK_PATH } from './routes/webhook-path.js';
import type { AppEnv } from './types.js';

/** Everything the app touches outside itself. Tests pass fakes. */
export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  database: Pingable;
  rateLimitStore: RateLimitStore;
  guestTokens: GuestTokenService;
}

/** Feature modules attach their routes here, after global middleware and before 404 handling. */
export type MountRoutes = (app: Hono<AppEnv>, deps: AppDeps) => void;

export function createApp(deps: AppDeps, mount?: MountRoutes): Hono<AppEnv> {
  const { config, logger } = deps;
  const app = new Hono<AppEnv>();

  app.use(requestId(logger));
  app.use(accessLog());
  app.use(securityHeaders());
  app.use(clientIp(config.trustedIpHeader));
  app.use(corsPolicy(config.allowedOrigins));

  // Probes come before throttling and body checks so monitoring is never rate-limited.
  app.route('/', healthRoutes(deps.database));

  const globalLimit = rateLimit({
    store: deps.rateLimitStore,
    name: 'global',
    limit: config.rateLimit.max,
    windowMs: config.rateLimit.windowMs,
  });
  // Stripe webhooks arrive from a small shared IP pool; they get their own, higher limit in routes/v1.ts.
  app.use((c, next) => (c.req.path === WEBHOOK_PATH ? next() : globalLimit(c, next)));
  app.use(requestTimeout(config.requestTimeoutMs));
  app.use(requestBodyLimit(config.bodyLimitBytes));
  app.use(requireJson());

  mount?.(app, deps);

  app.notFound(createNotFoundHandler(app, config.isProduction));
  app.onError(createErrorHandler(config.isProduction));
  return app;
}
