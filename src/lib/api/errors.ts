import type { ApiErrorCode } from './types';

/** Client-side codes for failures that never produced an API envelope. */
export type ClientErrorCode = 'network_error' | 'timeout' | 'aborted' | 'invalid_response';
export type AppApiErrorCode = ApiErrorCode | ClientErrorCode | (string & {});

export interface AppApiErrorInit {
  status: number;
  code: AppApiErrorCode;
  message: string;
  fields?: Record<string, string>;
  requestId?: string;
  /** Seconds, from the Retry-After header. */
  retryAfter?: number;
  details?: unknown;
}

/** Typed error for every failed API call. `status` is 0 when no HTTP response was received. */
export class AppApiError extends Error {
  readonly status: number;
  readonly code: AppApiErrorCode;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;
  readonly retryAfter?: number;
  readonly details?: unknown;

  constructor(init: AppApiErrorInit) {
    super(init.message);
    this.name = 'AppApiError';
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields;
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter;
    this.details = init.details;
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

export const isAppApiError = (e: unknown): e is AppApiError => e instanceof AppApiError;

export const OFFLINE_MESSAGE = "We couldn't reach Humi's. Check your connection and try again.";

export function retryAfterText(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'a moment';
  if (seconds < 90) return `${Math.ceil(seconds)} seconds`;
  const mins = Math.ceil(seconds / 60);
  return mins < 90 ? `${mins} minutes` : `${Math.ceil(mins / 60)} hours`;
}
