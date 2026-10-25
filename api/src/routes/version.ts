import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

export function versionRoutes(info: { commit?: string }): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const body: { api: '1'; commit?: string } = { api: '1' };
  if (info.commit) body.commit = info.commit;
  app.get('/version', (c) => c.json(body));
  return app;
}
