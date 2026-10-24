import { attachDatabasePool } from '@vercel/functions';
import { createApp } from './app.js';
import { buildRuntime } from './bootstrap.js';
import { loadConfig } from './config/env.js';

// Module scope: evaluated once per cold start, then reused by warm invocations.
// attachDatabasePool lets Vercel close idle Mongo connections before suspending the instance.
const { deps } = buildRuntime(loadConfig(), (client) => {
  attachDatabasePool(client);
});

export default createApp(deps);
