import type { Context } from 'hono';
import { ConfigError, type AppConfig } from '../config/env.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function socketAddress(c: Context): string | undefined {
  const env: unknown = c.env;
  if (!isRecord(env) || !isRecord(env.incoming) || !isRecord(env.incoming.socket)) return undefined;
  const address = env.incoming.socket.remoteAddress;
  return typeof address === 'string' ? address : undefined;
}

/**
 * Resolves the client address used for rate limiting. Forwarding headers are
 * client-controlled unless a trusted proxy overwrites them, so a header is
 * honoured only when the deployment names it via TRUSTED_IP_HEADER.
 */
export function resolveClientIp(c: Context, trustedHeader: string | undefined): string {
  if (trustedHeader) {
    const value = c.req.header(trustedHeader)?.split(',')[0]?.trim();
    if (value) return value.slice(0, 64);
  }
  return socketAddress(c) ?? 'unknown';
}

/**
 * Serverless entry points have no socket address, so without a trusted header every caller resolves to
 * "unknown" and shares ONE rate-limit bucket: one client could exhaust the budget for everybody. Production
 * serverless must therefore name a header the platform overwrites (e.g. x-real-ip on Vercel).
 */
export function assertClientIpConfigured(config: Pick<AppConfig, 'isProduction' | 'trustedIpHeader'>): void {
  if (config.isProduction && !config.trustedIpHeader) {
    throw new ConfigError(['TRUSTED_IP_HEADER: required for serverless production (no socket address; clients would share one rate-limit bucket)']);
  }
}
