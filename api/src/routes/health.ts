import { Hono } from 'hono';
import { ServiceUnavailableError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

export interface Pingable {
  ping(): Promise<void>;
}

const READINESS_TIMEOUT_MS = 2_000;

export function healthRoutes(database: Pingable, readinessTimeoutMs = READINESS_TIMEOUT_MS): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  // Liveness: the process is up. Must not touch dependencies, or a DB blip restarts healthy instances.
  routes.get('/healthz', (c) => c.json({ status: 'ok' }));

  // Readiness: dependencies answer. Details stay in logs, not the response.
  routes.get('/readyz', async (c) => {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error('readiness ping timed out'));
      }, readinessTimeoutMs);
    });
    try {
      await Promise.race([database.ping(), deadline]);
    } catch (error) {
      c.get('logger').warn({ err: error }, 'readiness check failed');
      throw new ServiceUnavailableError('Dependency unavailable', 'not_ready');
    } finally {
      clearTimeout(timer);
    }
    return c.json({ status: 'ready' });
  });

  return routes;
}
