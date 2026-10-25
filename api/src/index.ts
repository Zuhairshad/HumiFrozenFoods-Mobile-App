import { serve } from '@hono/node-server';
import { buildRuntime } from './bootstrap.js';
import { createProductionApp } from './composition.js';
import { loadConfig } from './config/env.js';
import { closeDatabase, ensureIndexes } from './db/client.js';

const config = loadConfig();
const runtime = buildRuntime(config);
const { deps, database } = runtime;
const { logger } = deps;

// A long-lived server can afford to ensure indexes at boot; serverless deployments run `npm run db:indexes` instead.
await ensureIndexes(database.db());

const server = serve({ fetch: createProductionApp(runtime, process.env['GIT_COMMIT']).fetch, port: config.port }, (info) => {
  logger.info({ port: info.port, env: config.nodeEnv }, 'api listening');
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(() => {
    closeDatabase()
      .catch((err: unknown) => {
        logger.error({ err }, 'error closing database');
      })
      .finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
