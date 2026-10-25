import { describe, expect, it } from 'vitest';
import { TtlValue } from '../../../src/catalog/ttl-cache.js';

function clockAt(start = 1_000_000) {
  let now = start;
  return { clock: { now: () => new Date(now) }, advance: (ms: number) => (now += ms) };
}

describe('TtlValue', () => {
  it('loads once within the TTL and again after it expires', async () => {
    const { clock, advance } = clockAt();
    const cache = new TtlValue<number>(clock, 60_000);
    let loads = 0;
    const load = () => Promise.resolve(++loads);
    expect(await cache.get(load)).toBe(1);
    advance(59_999);
    expect(await cache.get(load)).toBe(1);
    advance(1);
    expect(await cache.get(load)).toBe(2);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const { clock } = clockAt();
    const cache = new TtlValue<string>(clock, 1000);
    let loads = 0;
    let release: (value: string) => void = () => undefined;
    const load = () => {
      loads += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    };
    const a = cache.get(load);
    const b = cache.get(load);
    release('x');
    expect(await Promise.all([a, b])).toEqual(['x', 'x']);
    expect(loads).toBe(1);
  });

  it('does not cache failures', async () => {
    const { clock } = clockAt();
    const cache = new TtlValue<number>(clock, 1000);
    await expect(cache.get(() => Promise.reject(new Error('db down')))).rejects.toThrow('db down');
    expect(await cache.get(() => Promise.resolve(7))).toBe(7);
  });

  it('invalidate forces a reload', async () => {
    const { clock } = clockAt();
    const cache = new TtlValue<number>(clock, 1000);
    let n = 0;
    await cache.get(() => Promise.resolve(++n));
    cache.invalidate();
    expect(await cache.get(() => Promise.resolve(++n))).toBe(2);
  });
});
