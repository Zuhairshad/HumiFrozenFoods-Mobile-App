import { describe, expect, it } from 'vitest';
import { versionRoutes } from '../../../src/routes/version.js';
import { testApp } from '../helpers.js';

describe('GET /v1/version', () => {
  it('returns the api version and commit when known', async () => {
    const app = testApp((a) => a.route('/v1', versionRoutes({ commit: 'abc123' })));
    const res = await app.request('/v1/version');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ api: '1', commit: 'abc123' });
  });

  it('omits commit when unknown or empty', async () => {
    for (const info of [{}, { commit: '' }]) {
      const app = testApp((a) => a.route('/v1', versionRoutes(info)));
      expect(await (await app.request('/v1/version')).json()).toEqual({ api: '1' });
    }
  });
});
