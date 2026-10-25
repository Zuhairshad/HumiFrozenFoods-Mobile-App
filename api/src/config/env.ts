import { z } from 'zod';
import { type Keyring, parseKeyring } from '../auth/keyring.js';
import type { BusinessConfig } from '../domain/types.js';
import { Secret } from '../lib/secret.js';

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const emptyToUndefined = (v: unknown): unknown => (v === '' ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const intFrom = (min: number, max: number, fallback: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().min(min).max(max).default(fallback));

const secret = (prefixes: readonly string[]) =>
  z
    .string()
    .refine((v) => prefixes.some((p) => v.startsWith(p)), `must start with ${prefixes.join(' or ')}`)
    .transform((v) => new Secret(v));

const origin = z.string().refine((value) => {
  try {
    return new URL(value).origin === value && value !== 'null';
  } catch {
    return false;
  }
}, 'must be an exact origin such as https://example.com (scheme + host, no path or trailing slash; wildcards are not supported)');

const collectionName = (fallback: string) =>
  z.preprocess(emptyToUndefined, z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, 'must be a plain collection name').default(fallback));

const promoCodeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).transform((c) => c.toUpperCase()),
  kind: z.enum(['percentage', 'fixed', 'free_shipping']),
  value: z.number().int().min(0).max(1_000_000).default(0),
  minSubtotalPence: z.number().int().min(0).optional(),
  expiresAt: z.iso.datetime().optional(),
}).refine((p) => p.kind !== 'percentage' || (p.value >= 1 && p.value <= 100), { message: 'percentage promo needs value 1-100' })
  .refine((p) => p.kind !== 'fixed' || p.value >= 1, { message: 'fixed promo needs value >= 1 (pence)' });

const promoCodes = z.preprocess(
  (v) => (v === undefined || v === '' ? '[]' : v),
  z.string().transform((value, ctx) => {
    let json: unknown;
    try {
      json = JSON.parse(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be a JSON array' });
      return z.NEVER;
    }
    const parsed = z.array(promoCodeSchema).max(50).safeParse(json);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: parsed.error.issues.map((i) => i.message).join('; ') });
      return z.NEVER;
    }
    const seen = new Set<string>();
    for (const p of parsed.data) {
      if (seen.has(p.code)) {
        ctx.addIssue({ code: 'custom', message: `duplicate promo code ${p.code}` });
        return z.NEVER;
      }
      seen.add(p.code);
    }
    return parsed.data;
  }),
);

const siteOrderStatus = z.enum([
  'order-pending',
  'order-processing',
  'order-completed',
  'order-cancelled',
  'order-refunded',
  'order-failed',
  'order-at-local-facility',
  'order-out-for-delivery',
]);

const rawSchema = z.object({
  NODE_ENV: z.preprocess(emptyToUndefined, z.enum(['development', 'test', 'production']).default('development')),
  PORT: intFrom(1, 65535, 3000),
  LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')),
  MONGODB_URI: secret(['mongodb://', 'mongodb+srv://']),
  MONGODB_DB: z.preprocess(emptyToUndefined, z.string().regex(/^[A-Za-z0-9_-]{1,38}$/).default('humis')),
  ALLOWED_ORIGINS: z.preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(origin).default([]),
  ),
  PUBLIC_API_BASE: optional(z.url().refine((v) => !v.endsWith('/'), 'must not end with a slash')),
  STRIPE_SECRET_KEY: optional(secret(['sk_', 'rk_'])),
  STRIPE_WEBHOOK_SECRET: optional(secret(['whsec_'])),
  GUEST_TOKEN_KEYS: optional(
    z.string().transform((value, ctx) => {
      try {
        return parseKeyring(value);
      } catch (error) {
        ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'invalid keyring' });
        return z.NEVER;
      }
    }),
  ),
  GUEST_TOKEN_TTL_SECONDS: intFrom(60, 90 * 24 * 3600, 14 * 24 * 3600),
  TRUSTED_IP_HEADER: optional(z.string().regex(/^[a-z0-9-]+$/, 'must be a lower-case header name')),
  BODY_LIMIT_BYTES: intFrom(1024, 10 * 1024 * 1024, 100 * 1024),
  REQUEST_TIMEOUT_MS: intFrom(100, 60_000, 10_000),
  RATE_LIMIT_MAX: intFrom(1, 100_000, 120),
  RATE_LIMIT_WINDOW_MS: intFrom(1000, 3_600_000, 60_000),
  ORDERS_COLLECTION: collectionName('orders'),
  PRODUCTS_COLLECTION: collectionName('products'),
  DELIVERY_FEE_PENCE: intFrom(0, 100_000, 799),
  // Unset = default 5000 (GBP 50). Set but empty = delivery is never free.
  FREE_DELIVERY_THRESHOLD_PENCE: z.preprocess(
    (v) => (v === undefined ? 5000 : v === '' ? null : v),
    z.coerce.number().int().min(0).max(10_000_000).nullable(),
  ),
  MIN_ORDER_PENCE: intFrom(0, 10_000_000, 0),
  PROMO_CODES: promoCodes,
  PAID_ORDER_STATUS: z.preprocess(emptyToUndefined, siteOrderStatus.default('order-pending')),
  ORDER_NUMBER_DIGITS: intFrom(8, 16, 12),
  PENDING_ORDER_TTL_MINUTES: intFrom(10, 10_080, 120),
  LOW_STOCK_THRESHOLD: intFrom(0, 1000, 5),
});

const PRODUCTION_REQUIRED = [
  'PUBLIC_API_BASE',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GUEST_TOKEN_KEYS',
] as const;

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  logLevel: string;
  mongo: { uri: Secret; db: string };
  allowedOrigins: readonly string[];
  publicApiBase: string | undefined;
  stripe: { secretKey: Secret | undefined; webhookSecret: Secret | undefined };
  guestToken: { keyring: Keyring | undefined; ttlSeconds: number };
  trustedIpHeader: string | undefined;
  bodyLimitBytes: number;
  requestTimeoutMs: number;
  rateLimit: { max: number; windowMs: number };
  business: BusinessConfig;
}

/**
 * Validates the environment once, at startup. Problems list variable names and
 * reasons only; values are never echoed so a mistyped secret cannot leak into logs.
 */
export function loadConfig(source: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`));
  }
  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    const missing = PRODUCTION_REQUIRED.filter((name) => env[name] === undefined);
    if (missing.length > 0) {
      throw new ConfigError(missing.map((name) => `${name}: required when NODE_ENV=production`));
    }
    const insecure = env.ALLOWED_ORIGINS.filter((o) => !o.startsWith('https://'));
    if (insecure.length > 0) {
      throw new ConfigError(['ALLOWED_ORIGINS: only https origins are allowed in production']);
    }
  }

  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    mongo: { uri: env.MONGODB_URI, db: env.MONGODB_DB },
    allowedOrigins: env.ALLOWED_ORIGINS,
    publicApiBase: env.PUBLIC_API_BASE,
    stripe: { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET },
    guestToken: { keyring: env.GUEST_TOKEN_KEYS, ttlSeconds: env.GUEST_TOKEN_TTL_SECONDS },
    trustedIpHeader: env.TRUSTED_IP_HEADER,
    bodyLimitBytes: env.BODY_LIMIT_BYTES,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    rateLimit: { max: env.RATE_LIMIT_MAX, windowMs: env.RATE_LIMIT_WINDOW_MS },
    business: {
      delivery: {
        feePence: env.DELIVERY_FEE_PENCE,
        freeThresholdPence: env.FREE_DELIVERY_THRESHOLD_PENCE,
        minOrderPence: env.MIN_ORDER_PENCE,
      },
      promoCodes: env.PROMO_CODES,
      paidOrderStatus: env.PAID_ORDER_STATUS,
      orderNumberDigits: env.ORDER_NUMBER_DIGITS,
      pendingOrderTtlMinutes: env.PENDING_ORDER_TTL_MINUTES,
      lowStockThreshold: env.LOW_STOCK_THRESHOLD,
      collections: { orders: env.ORDERS_COLLECTION, products: env.PRODUCTS_COLLECTION },
    },
  };
}
