export type ErrorStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 429 | 500 | 503 | 504;

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface AppErrorOptions {
  details?: unknown;
  headers?: Record<string, string>;
  cause?: unknown;
}

/** Errors whose message and details are safe to show to API clients. */
export class AppError extends Error {
  readonly status: ErrorStatus;
  readonly code: string;
  readonly details: unknown;
  readonly headers: Readonly<Record<string, string>>;

  constructor(status: ErrorStatus, code: string, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.headers = options.headers ?? {};
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'bad_request', details?: unknown) {
    super(400, code, message, { details });
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Request validation failed') {
    super(400, 'validation_failed', message, { details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'unauthorized') {
    super(401, code, message, { headers: { 'WWW-Authenticate': 'Bearer' } });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'forbidden') {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'not_found') {
    super(404, code, message);
  }
}

export class MethodNotAllowedError extends AppError {
  constructor(allowed: readonly string[]) {
    super(405, 'method_not_allowed', 'Method not allowed', { headers: { Allow: allowed.join(', ') } });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'conflict') {
    super(409, code, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(maxBytes?: number) {
    super(413, 'payload_too_large', 'Request body too large', {
      details: maxBytes === undefined ? undefined : { maxBytes },
    });
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super(415, 'unsupported_media_type', 'Content-Type must be application/json');
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(429, 'rate_limited', 'Too many requests', {
      headers: { 'Retry-After': String(retryAfterSeconds) },
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', code = 'service_unavailable') {
    super(503, code, message);
  }
}

export class RequestTimeoutError extends AppError {
  constructor() {
    super(504, 'request_timeout', 'Request timed out');
  }
}

export class InternalError extends AppError {
  constructor(cause?: unknown) {
    super(500, 'internal_error', 'Internal server error', { cause });
  }
}

const STATUS_CODES: Readonly<Record<number, string>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

/** Shape of hono's HTTPException, matched structurally to avoid coupling to its class identity. */
function readHttpStatus(err: unknown): { status: number; message: string } | undefined {
  if (
    err instanceof Error &&
    err.name === 'HTTPException' &&
    'status' in err &&
    typeof err.status === 'number'
  ) {
    return { status: err.status, message: err.message };
  }
  return undefined;
}

/**
 * Collapses anything thrown into an AppError. Unknown errors become a generic
 * InternalError so internals (driver messages, stacks) never reach the client.
 */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const http = readHttpStatus(err);
  if (http && http.status >= 400 && http.status < 500) {
    const status = http.status as ErrorStatus;
    return new AppError(status, STATUS_CODES[http.status] ?? 'bad_request', http.message || 'Bad request');
  }

  return new InternalError(err);
}

export function toEnvelope(err: AppError, requestId: string, isProduction: boolean): ErrorEnvelope {
  const body: ErrorEnvelope = {
    error: { code: err.code, message: err.message, requestId },
  };
  if (err.details !== undefined) {
    body.error.details = err.details;
  }
  // Outside production, surface the underlying message to speed up debugging. Never the stack.
  if (!isProduction && err instanceof InternalError && err.cause instanceof Error) {
    body.error.details = { cause: err.cause.message };
  }
  return body;
}
