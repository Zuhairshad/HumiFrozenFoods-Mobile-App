import { HTTPException } from 'hono/http-exception';
import { describe, expect, it } from 'vitest';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalError,
  MethodNotAllowedError,
  normalizeError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitedError,
  RequestTimeoutError,
  ServiceUnavailableError,
  toEnvelope,
  UnauthorizedError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../../../src/lib/errors.js';

describe('error classes', () => {
  it.each([
    [new BadRequestError(), 400, 'bad_request'],
    [new ValidationError([{ path: 'a', message: 'x' }]), 400, 'validation_failed'],
    [new UnauthorizedError(), 401, 'unauthorized'],
    [new ForbiddenError(), 403, 'forbidden'],
    [new NotFoundError(), 404, 'not_found'],
    [new MethodNotAllowedError(['GET', 'HEAD']), 405, 'method_not_allowed'],
    [new ConflictError(), 409, 'conflict'],
    [new PayloadTooLargeError(10), 413, 'payload_too_large'],
    [new UnsupportedMediaTypeError(), 415, 'unsupported_media_type'],
    [new RateLimitedError(7), 429, 'rate_limited'],
    [new InternalError(), 500, 'internal_error'],
    [new ServiceUnavailableError(), 503, 'service_unavailable'],
    [new RequestTimeoutError(), 504, 'request_timeout'],
  ] as const)('%o has status %i and code %s', (error, status, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.name).toBe(error.constructor.name);
  });

  it('carries protocol headers', () => {
    expect(new RateLimitedError(7).headers).toEqual({ 'Retry-After': '7' });
    expect(new MethodNotAllowedError(['GET', 'POST']).headers).toEqual({ Allow: 'GET, POST' });
    expect(new UnauthorizedError().headers['WWW-Authenticate']).toBe('Bearer');
  });

  it('PayloadTooLargeError omits details when no limit is given', () => {
    expect(new PayloadTooLargeError().details).toBeUndefined();
  });
});

describe('normalizeError', () => {
  it('passes AppError through', () => {
    const err = new NotFoundError();
    expect(normalizeError(err)).toBe(err);
  });

  it.each([
    [400, 'bad_request'],
    [404, 'not_found'],
    [413, 'payload_too_large'],
    [418, 'bad_request'], // outside our vocabulary: becomes a plain 400
  ])('maps HTTPException %i to %s', (status, code) => {
    const normalized = normalizeError(new HTTPException(status as 400, { message: 'nope' }));
    expect(normalized.status).toBe(status === 418 ? 400 : status);
    expect(normalized.code).toBe(code);
    expect(normalized.message).toBe('nope');
  });

  it('uses a default message for an empty HTTPException message', () => {
    expect(normalizeError(new HTTPException(400)).message).toBe('Bad request');
  });

  it('treats 5xx HTTPException and unknown values as opaque internal errors', () => {
    for (const thrown of [new HTTPException(502, { message: 'upstream said secret' }), new Error('boom'), 'string', null]) {
      const normalized = normalizeError(thrown);
      expect(normalized).toBeInstanceOf(InternalError);
      expect(normalized.message).toBe('Internal server error');
    }
  });
});

describe('toEnvelope', () => {
  it('builds the standard shape', () => {
    expect(toEnvelope(new NotFoundError(), 'req-1', true)).toEqual({
      error: { code: 'not_found', message: 'Resource not found', requestId: 'req-1' },
    });
  });

  it('includes details when present', () => {
    const body = toEnvelope(new ValidationError([{ path: 'a', message: 'bad' }]), 'req-1', true);
    expect(body.error.details).toEqual([{ path: 'a', message: 'bad' }]);
  });

  it('never leaks internals in production', () => {
    const body = toEnvelope(new InternalError(new Error('E11000 duplicate key mongodb://user:pw@host')), 'r', true);
    expect(JSON.stringify(body)).not.toContain('E11000');
    expect(body.error.details).toBeUndefined();
  });

  it('shows only the cause message, never the stack, outside production', () => {
    const body = toEnvelope(new InternalError(new Error('driver exploded')), 'r', false);
    expect(body.error.details).toEqual({ cause: 'driver exploded' });
    expect(JSON.stringify(body)).not.toContain('at ');
  });

  it('has no cause details for non-Error causes', () => {
    expect(toEnvelope(new InternalError('str'), 'r', false).error.details).toBeUndefined();
  });
});
