import type { Clock } from '../../src/domain/ports.js';

/** Controllable clock shared by the app, the fake gateway, guest tokens and the rate limiter. */
export class FakeClock implements Clock {
  #ms: number;
  readonly #start: number;

  constructor(start: Date) {
    this.#ms = start.getTime();
    this.#start = this.#ms;
  }

  now(): Date {
    return new Date(this.#ms);
  }

  epochMs = (): number => this.#ms;

  advance(ms: number): void {
    this.#ms += ms;
  }

  advanceMinutes(minutes: number): void {
    this.advance(minutes * 60_000);
  }

  set(date: Date): void {
    this.#ms = date.getTime();
  }

  reset(): void {
    this.#ms = this.#start;
  }
}

/**
 * Monday 2030-03-04 09:00 UTC (= 09:00 Europe/London, GMT). Far in the future so Mongo's TTL monitor
 * (which compares against the real wall clock) can never expire idempotency or webhook documents mid-test.
 * At 09:00 London: today's morning window is closed, afternoon and evening are open.
 */
export const DEFAULT_START = new Date('2030-03-04T09:00:00.000Z');
