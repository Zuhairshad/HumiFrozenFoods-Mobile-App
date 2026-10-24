import { z } from 'zod';
import { type Keyring, parseKeyring } from '../auth/keyring.js';
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
  };
}
