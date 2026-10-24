import { GatewayError } from './errors';
import type { ApiErrorBody } from './types';

/** Base URL of OUR api. Unset means "demo mode": the mock gateway is used. */
export const API_BASE_URL: string | undefined = (() => {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : undefined;
})();

export const isDemoMode = API_BASE_URL === undefined;

const DEFAULT_TIMEOUT_MS = 15000;

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const err = (v as { error: unknown }).error;
  return typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string';
}

export async function apiRequest<T>(base: string, opts: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${base}${opts.path}`, {
      method: opts.method,
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : null),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new GatewayError('network', "We couldn't reach Humi's. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const message = isErrorBody(json) ? json.error.message : 'Something went wrong on our side. Please try again.';
    const fields = isErrorBody(json) ? json.error.fields : undefined;
    if (res.status === 401 || res.status === 403) throw new GatewayError('unauthorized', message, { status: res.status });
    if (res.status === 404) throw new GatewayError('not_found', message, { status: res.status });
    if (res.status >= 400 && res.status < 500) throw new GatewayError('validation', message, { status: res.status, fields });
    throw new GatewayError('server', message, { status: res.status });
  }
  if (json === undefined) throw new GatewayError('server', 'Unexpected response from the server.', { status: res.status });
  return json as T;
}
