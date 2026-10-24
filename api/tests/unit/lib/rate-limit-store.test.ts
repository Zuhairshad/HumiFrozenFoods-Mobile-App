import { describe, expect, it } from 'vitest';
import { MemoryRateLimitStore } from '../../../src/lib/rate-limit-store.js';

describe('MemoryRateLimitStore', () => {
  it('counts within a window and resets after it', async () => {
    let now = 1_000;
    const store = new MemoryRateLimitStore({ now: () => now });
    expect(await store.hit('k', 1000)).toEqual({ count: 1, resetAtMs: 2_000 });
    expect((await store.hit('k', 1000)).count).toBe(2);
    now = 1_999;
    expect((await store.hit('k', 1000)).count).toBe(3);
    now = 2_000;
    expect(await store.hit('k', 1000)).toEqual({ count: 1, resetAtMs: 3_000 });
  });

  it('isolates keys', async () => {
    const store = new MemoryRateLimitStore();
    await store.hit('a', 1000);
    expect((await store.hit('b', 1000)).count).toBe(1);
  });

  it('bounds memory by evicting expired keys first', async () => {
    let now = 0;
    const store = new MemoryRateLimitStore({ maxKeys: 2, now: () => now });
    await store.hit('old', 10);
    await store.hit('live', 1000);
    now = 20;
    await store.hit('new', 1000); // sweeps "old", keeps "live"
    expect((await store.hit('live', 1000)).count).toBe(2);
  });

  it('evicts the oldest live key when everything is live', async () => {
    const store = new MemoryRateLimitStore({ maxKeys: 2, now: () => 0 });
    await store.hit('first', 1000);
    await store.hit('second', 1000);
    await store.hit('third', 1000);
    expect((await store.hit('first', 1000)).count).toBe(1);
    expect((await store.hit('third', 1000)).count).toBe(2);
  });

  it('returns copies so callers cannot mutate state', async () => {
    const store = new MemoryRateLimitStore();
    const hit = await store.hit('k', 1000);
    hit.count = 999;
    expect((await store.hit('k', 1000)).count).toBe(2);
  });
});
