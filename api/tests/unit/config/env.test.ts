import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../../src/config/env.js';
import { BASE_ENV } from '../helpers.js';

const key = randomBytes(32).toString('base64url');
const PROD = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://user:pw@cluster.example.mongodb.net/',
  PUBLIC_API_BASE: 'https://api.example.com',
  STRIPE_SECRET_KEY: 'sk_live_abc',
  STRIPE_WEBHOOK_SECRET: 'whsec_abc',
  GUEST_TOKEN_KEYS: `k1:${key}`,
  ALLOWED_ORIGINS: 'https://shop.example.com',
};

function problems(env: Record<string, string | undefined>): string {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as ConfigError).message;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies safe defaults', () => {
    const config = loadConfig({ MONGODB_URI: BASE_ENV.MONGODB_URI });
    expect(config).toMatchObject({
      nodeEnv: 'development',
      isProduction: false,
      port: 3000,
      logLevel: 'info',
      allowedOrigins: [],
      bodyLimitBytes: 102_400,
      requestTimeoutMs: 10_000,
      rateLimit: { max: 120, windowMs: 60_000 },
    });
    expect(config.mongo.db).toBe('humis');
  });

  it('treats empty strings as unset', () => {
    const config = loadConfig({ ...BASE_ENV, PORT: '', ALLOWED_ORIGINS: '', STRIPE_SECRET_KEY: '', TRUSTED_IP_HEADER: '' });
    expect(config.port).toBe(3000);
    expect(config.stripe.secretKey).toBeUndefined();
  });

  it('parses a complete production config', () => {
    const config = loadConfig({ ...PROD, PORT: '8080', TRUSTED_IP_HEADER: 'x-real-ip' });
    expect(config.isProduction).toBe(true);
    expect(config.port).toBe(8080);
    expect(config.allowedOrigins).toEqual(['https://shop.example.com']);
    expect(config.guestToken.keyring?.activeKid).toBe('k1');
    expect(config.stripe.secretKey?.reveal()).toBe('sk_live_abc');
    expect(config.trustedIpHeader).toBe('x-real-ip');
  });

  it('wraps secrets so they cannot be logged', () => {
    const config = loadConfig(PROD);
    const serialised = JSON.stringify(config);
    for (const secret of ['pw@cluster', 'sk_live_abc', 'whsec_abc', key]) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('fails fast listing every problem, naming variables but not values', () => {
    const message = problems({ MONGODB_URI: 'http://wrong-secret-value', PORT: '99999', STRIPE_SECRET_KEY: 'pk_oops' });
    expect(message).toContain('MONGODB_URI');
    expect(message).toContain('PORT');
    expect(message).toContain('STRIPE_SECRET_KEY');
    expect(message).not.toContain('wrong-secret-value');
    expect(message).not.toContain('pk_oops');
  });

  it('requires MONGODB_URI', () => {
    expect(problems({ NODE_ENV: 'test' })).toContain('MONGODB_URI');
  });

  it.each(['PUBLIC_API_BASE', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'GUEST_TOKEN_KEYS'])(
    'requires %s in production',
    (name) => {
      const message = problems({ ...PROD, [name]: undefined });
      expect(message).toContain(`${name}: required when NODE_ENV=production`);
    },
  );

  it('rejects wildcard, path-bearing and malformed origins', () => {
    for (const origin of ['*', 'https://a.com/', 'https://a.com/path', 'not a url', 'null']) {
      expect(problems({ ...BASE_ENV, ALLOWED_ORIGINS: origin })).toContain('ALLOWED_ORIGINS');
    }
  });

  it('accepts several exact origins, ignoring whitespace', () => {
    const config = loadConfig({ ...BASE_ENV, ALLOWED_ORIGINS: 'http://localhost:8081, https://a.com' });
    expect(config.allowedOrigins).toEqual(['http://localhost:8081', 'https://a.com']);
  });

  it('forbids plain-http origins in production', () => {
    expect(problems({ ...PROD, ALLOWED_ORIGINS: 'http://shop.example.com' })).toContain('only https');
  });

  it('reports bad guest keys without echoing them', () => {
    const message = problems({ ...BASE_ENV, GUEST_TOKEN_KEYS: 'k1:c2hvcnQ' });
    expect(message).toContain('GUEST_TOKEN_KEYS');
    expect(message).not.toContain('c2hvcnQ');
  });

  it('reports non-Error keyring failures generically', () => {
    expect(problems({ ...BASE_ENV, GUEST_TOKEN_KEYS: 'garbage' })).toContain('GUEST_TOKEN_KEYS');
  });

  it('validates PUBLIC_API_BASE, header name and db name', () => {
    expect(problems({ ...BASE_ENV, PUBLIC_API_BASE: 'https://api.example.com/' })).toContain('PUBLIC_API_BASE');
    expect(problems({ ...BASE_ENV, PUBLIC_API_BASE: 'nope' })).toContain('PUBLIC_API_BASE');
    expect(problems({ ...BASE_ENV, TRUSTED_IP_HEADER: 'X-Real-IP' })).toContain('TRUSTED_IP_HEADER');
    expect(problems({ ...BASE_ENV, MONGODB_DB: 'bad/name' })).toContain('MONGODB_DB');
  });

  it('reads process.env by default', () => {
    expect(() => loadConfig()).toThrow(ConfigError); // test runner env has no MONGODB_URI
  });
});
