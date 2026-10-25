import { AppApiError, OFFLINE_MESSAGE } from './errors';
import type { ApiErrorBody } from './types';

/** Base URL of OUR api (inlined by Expo at build time). Unset means "demo mode". */
export const API_BASE_URL: string | undefined = (() => {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : undefined;
})();

export const isDemoMode = API_BASE_URL === undefined;

export const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRY_AFTER_WAIT_S = 10;

export interface RetryPolicy {
  /** Extra attempts after the first. */
  retries: number;
  baseDelayMs?: number;
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Sent as the `Idempotency-Key` header. Required to retry a POST. */
  idempotencyKey?: string;
  /** Guest token, sent as `Authorization: Bearer`. */
  bearer?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** GET defaults to 2 retries. POST never retries unless this is set AND `idempotencyKey` is present. */
  retry?: RetryPolicy;
}

export interface HttpClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  defaultTimeoutMs?: number;
}

export interface HttpClient {
  readonly baseUrl: string;
  request<T>(opts: RequestOptions): Promise<T>;
}

function abortError(): AppApiError {
  return new AppApiError({ status: 0, code: 'aborted', message: 'The request was cancelled.' });
}

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

function isErrorBody(v: unknown): v is ApiErrorBody {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const err = (v as { error: unknown }).error;
  return typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string';
}

export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000));
}

function genericMessage(status: number): string {
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return 'That request could not be completed.';
}

function isRetryable(e: AppApiError): boolean {
  return e.isNetwork || e.isServer || e.isRateLimited;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const defaultTimeout = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function attempt<T>(opts: RequestOptions): Promise<T> {
    if (opts.signal?.aborted) throw abortError();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs ?? defaultTimeout);
    const onCallerAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onCallerAbort, { once: true });

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : null),
      ...opts.headers,
    };
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`;

    let res: Response;
    let text: string;
    try {
      res = await doFetch(`${baseUrl}${opts.path}`, {
        method: opts.method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      text = await res.text();
    } catch {
      if (opts.signal?.aborted) throw abortError();
      throw new AppApiError({
        status: 0,
        code: timedOut ? 'timeout' : 'network_error',
        message: OFFLINE_MESSAGE,
      });
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onCallerAbort);
    }

    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }

    if (!res.ok) {
      const env = isErrorBody(json) ? json.error : undefined;
      throw new AppApiError({
        status: res.status,
        code: env?.code ?? (res.status >= 500 ? 'internal_error' : 'unprocessable'),
        message: env?.message ?? genericMessage(res.status),
        fields: env?.fields,
        requestId: env?.requestId,
        details: env?.details,
        retryAfter: parseRetryAfter(res.headers.get('retry-after')),
      });
    }
    if (json === undefined) {
      throw new AppApiError({ status: res.status, code: 'invalid_response', message: 'Unexpected response from the server.' });
    }
    return json as T;
  }

  async function request<T>(opts: RequestOptions): Promise<T> {
    const policy: RetryPolicy =
      opts.method === 'GET'
        ? (opts.retry ?? { retries: 2 })
        : opts.retry && opts.idempotencyKey
          ? opts.retry
          : { retries: 0 };
    const base = policy.baseDelayMs ?? 300;
    for (let n = 0; ; n++) {
      try {
        return await attempt<T>(opts);
      } catch (e) {
        if (!(e instanceof AppApiError) || e.isAborted || n >= policy.retries || !isRetryable(e)) throw e;
        let delay = base * 2 ** n * (0.75 + random() * 0.5);
        if (e.isRateLimited && e.retryAfter !== undefined) {
          if (e.retryAfter > MAX_RETRY_AFTER_WAIT_S) throw e; // surface it; the UI shows the wait
          delay = e.retryAfter * 1000;
        }
        await sleep(delay, opts.signal);
      }
    }
  }

  return { baseUrl, request };
}

let shared: HttpClient | undefined;

/** Shared client for the configured base URL. Throws in demo mode: callers must check `isDemoMode` first. */
export function getHttpClient(): HttpClient {
  if (!API_BASE_URL) throw new AppApiError({ status: 0, code: 'network_error', message: 'The API is not configured (demo mode).' });
  shared ??= createHttpClient({ baseUrl: API_BASE_URL });
  return shared;
}
