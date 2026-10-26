import { attachDatabasePool } from '@vercel/functions';
import { buildRuntime } from './bootstrap.js';
import { createProductionApp } from './composition.js';
import { loadConfig } from './config/env.js';
import { assertClientIpConfigured } from './lib/client-ip.js';

// Module scope: evaluated once per cold start, then reused by warm invocations.
// attachDatabasePool lets Vercel close idle Mongo connections before suspending the instance.
const config = loadConfig();
assertClientIpConfigured(config);
const runtime = buildRuntime(config, (client) => {
  attachDatabasePool(client);
});

export default createProductionApp(runtime, process.env['VERCEL_GIT_COMMIT_SHA']);
