import type { ApiErrorCode, ValidationDetail } from './types';

/** Client-side codes for failures that never produced an API envelope. */
export type ClientErrorCode = 'network_error' | 'timeout' | 'aborted' | 'invalid_response';
export type AppApiErrorCode = ApiErrorCode | ClientErrorCode | (string & {});

export interface AppApiErrorInit {
  status: number;
  code: AppApiErrorCode;
  message: string;
  requestId?: string;
  /** Seconds, from the Retry-After header. */
  retryAfter?: number;
  details?: unknown;
}

/** Typed error for every failed API call. `status` is 0 when no HTTP response was received. */
export class AppApiError extends Error {
  readonly status: number;
  readonly code: AppApiErrorCode;
  readonly requestId?: string;
  readonly retryAfter?: number;
  readonly details?: unknown;

  constructor(init: AppApiErrorInit) {
    super(init.message);
    this.name = 'AppApiError';
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter;
    this.details = init.details;
  }

  /** `validation_failed` details as { 'contact.email': 'Enter a valid email' } (empty when not interpretable). */
  get fieldErrors(): Record<string, string> {
    return toFieldErrors(this.details);
  }

  /** No HTTP response: offline, DNS, connection reset or timeout. */
  get isNetwork(): boolean {
    return this.code === 'network_error' || this.code === 'timeout';
  }
  get isAborted(): boolean {
    return this.code === 'aborted';
  }
  get isRateLimited(): boolean {
    return this.status === 429 || this.code === 'rate_limited';
  }
  get isServer(): boolean {
    return this.status >= 500;
  }
}

/** Builds a path -> message map from `details`. Ignores anything that is not a { path, message } array. */
export function toFieldErrors(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(details)) return out;
  for (const d of details as Partial<ValidationDetail>[]) {
    if (d && typeof d.path === 'string' && typeof d.message === 'string' && !(d.path in out)) out[d.path] = d.message;
  }
  return out;
}

/** Last path segment, so `contact.email` and `address.postcode` map onto flat form fields. */
export function lastSegment(path: string): string {
  const i = path.lastIndexOf('.');
  return i < 0 ? path : path.slice(i + 1);
}

export const isAppApiError = (e: unknown): e is AppApiError => e instanceof AppApiError;

export const OFFLINE_MESSAGE = "We couldn't reach Humi's. Check your connection and try again.";

export function retryAfterText(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'a moment';
  if (seconds < 90) return `${Math.ceil(seconds)} seconds`;
  const mins = Math.ceil(seconds / 60);
  return mins < 90 ? `${mins} minutes` : `${Math.ceil(mins / 60)} hours`;
}
