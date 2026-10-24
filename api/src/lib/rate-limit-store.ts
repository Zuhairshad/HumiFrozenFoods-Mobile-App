export interface RateLimitHit {
  /** Hits recorded in the current window, including this one. */
  count: number;
  /** Epoch ms at which the window resets. */
  resetAtMs: number;
}

/**
 * Counter store behind the rate limiter. The in-memory implementation below is
 * per-process, so with N serverless instances the effective limit is N times
 * higher. Production needs a shared store (e.g. Upstash Redis with INCR+PEXPIRE,
 * or a Lua script) implementing this same interface.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

export interface MemoryStoreOptions {
  maxKeys?: number;
  now?: () => number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  readonly #entries = new Map<string, RateLimitHit>();
  readonly #maxKeys: number;
  readonly #now: () => number;

  constructor(options: MemoryStoreOptions = {}) {
    this.#maxKeys = options.maxKeys ?? 10_000;
    this.#now = options.now ?? Date.now;
  }

  hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = this.#now();
    const existing = this.#entries.get(key);
    if (existing && existing.resetAtMs > now) {
      existing.count += 1;
      return Promise.resolve({ ...existing });
    }
    if (this.#entries.size >= this.#maxKeys) this.#makeRoom(now);
    const fresh: RateLimitHit = { count: 1, resetAtMs: now + windowMs };
    this.#entries.set(key, fresh);
    return Promise.resolve({ ...fresh });
  }

  /** Bounded memory: drop expired windows first, then the oldest key. */
  #makeRoom(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.resetAtMs <= now) this.#entries.delete(key);
    }
    if (this.#entries.size < this.#maxKeys) return;
    const oldest = this.#entries.keys().next();
    if (!oldest.done) this.#entries.delete(oldest.value);
  }
}
