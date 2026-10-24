import { Writable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import type { Hono } from 'hono';
import { type AppDeps, createApp, type MountRoutes } from '../../src/app.js';
import { createGuestTokenService } from '../../src/auth/guest-token.js';
import { Keyring } from '../../src/auth/keyring.js';
import { type AppConfig, loadConfig } from '../../src/config/env.js';
import { createLogger } from '../../src/lib/logger.js';
import { MemoryRateLimitStore } from '../../src/lib/rate-limit-store.js';
import type { AppEnv } from '../../src/types.js';

export const BASE_ENV = {
  NODE_ENV: 'test',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
  LOG_LEVEL: 'silent',
};

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({ ...BASE_ENV, ...overrides });
}

export function captureLogs(): { stream: Writable; lines: () => Record<string, unknown>[]; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const text = () => chunks.join('');
  const lines = () =>
    text()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { stream, lines, text };
}

export function testDeps(overrides: Partial<AppDeps> = {}, env: Record<string, string> = {}): AppDeps {
  const config = testConfig(env);
  return {
    config,
    logger: createLogger({ level: 'silent' }),
    database: { ping: () => Promise.resolve() },
    rateLimitStore: new MemoryRateLimitStore(),
    guestTokens: createGuestTokenService({ keyring: new Keyring([['t1', randomBytes(32)]]), ttlSeconds: 600 }),
    ...overrides,
  };
}

export function testApp(
  mount?: MountRoutes,
  overrides: Partial<AppDeps> = {},
  env: Record<string, string> = {},
): Hono<AppEnv> {
  return createApp(testDeps(overrides, env), mount);
}

export interface ErrorBody {
  error: { code: string; message: string; requestId: string; details?: unknown };
}

export async function errorBody(res: Response): Promise<ErrorBody> {
  return (await res.json()) as ErrorBody;
}
