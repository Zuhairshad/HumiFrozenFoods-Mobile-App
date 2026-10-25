import type { Clock } from '../domain/ports.js';

/** One cached value with a TTL and single-flight loading. Failures are never cached. */
export class TtlValue<T> {
  private value: { data: T; expiresAt: number } | undefined;
  private inflight: Promise<T> | undefined;

  constructor(
    private readonly clock: Clock,
    private readonly ttlMs: number,
  ) {}

  async get(load: () => Promise<T>): Promise<T> {
    const now = this.clock.now().getTime();
    if (this.value && now < this.value.expiresAt) return this.value.data;
    this.inflight ??= this.refresh(load, now);
    return this.inflight;
  }

  invalidate(): void {
    this.value = undefined;
  }

  private async refresh(load: () => Promise<T>, startedAt: number): Promise<T> {
    try {
      const data = await load();
      this.value = { data, expiresAt: startedAt + this.ttlMs };
      return data;
    } finally {
      this.inflight = undefined;
    }
  }
}
