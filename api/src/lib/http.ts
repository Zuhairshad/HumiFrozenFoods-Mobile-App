import type { Context, ErrorHandler, Hono, NotFoundHandler } from 'hono';
import type { AppEnv } from '../types.js';
import { MethodNotAllowedError, NotFoundError, normalizeError, toEnvelope, type AppError } from './errors.js';

export function errorResponse(c: Context<AppEnv>, err: AppError, isProduction: boolean): Response {
  const body = toEnvelope(err, c.get('requestId'), isProduction);
  return c.json(body, err.status, { ...err.headers });
}

export function createErrorHandler(isProduction: boolean): ErrorHandler<AppEnv> {
  return (err, c) => {
    const normalized = normalizeError(err);
    const logger = c.get('logger');
    if (normalized.status >= 500) {
      logger.error({ err, code: normalized.code }, 'request failed');
    } else {
      logger.debug({ code: normalized.code, status: normalized.status }, 'request rejected');
    }
    return errorResponse(c, normalized, isProduction);
  };
}

const PROBED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Methods with a real (non-middleware) handler for `path`, used to tell 405 from 404. */
function methodsRegisteredFor(app: Hono<AppEnv>, path: string): string[] {
  const allowed: string[] = [];
  for (const method of PROBED_METHODS) {
    const [matches] = app.router.match(method, path);
    if (matches.some(([[, route]]) => route.method === method)) allowed.push(method);
  }
  if (allowed.includes('GET')) allowed.splice(1, 0, 'HEAD');
  return allowed;
}

export function createNotFoundHandler(app: Hono<AppEnv>, isProduction: boolean): NotFoundHandler<AppEnv> {
  return (c) => {
    const allowed = methodsRegisteredFor(app, c.req.path);
    const err = allowed.length > 0 ? new MethodNotAllowedError(allowed) : new NotFoundError();
    return errorResponse(c, err, isProduction);
  };
}
