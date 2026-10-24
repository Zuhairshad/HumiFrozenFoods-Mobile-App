import { validator } from 'hono/validator';
import type { ZodType, z } from 'zod';
import { ValidationError } from './errors.js';
import { assertSafeKeys } from './safe-object.js';

export interface FieldIssue {
  path: string;
  message: string;
}

/** Issues carry paths and messages only, never the offending input, so secrets and PII are not echoed back. */
export function parseWith<S extends ZodType>(schema: S, input: unknown): z.output<S> {
  assertSafeKeys(input);
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues: FieldIssue[] = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  throw new ValidationError(issues);
}

/**
 * Hono validators. Pair them with `z.strictObject(...)` so unknown fields are
 * rejected. Body size is bounded earlier by the bodyLimit middleware, and
 * hono's json validator itself answers non-JSON content types and malformed
 * JSON with 400.
 */
export function jsonBody<S extends ZodType>(schema: S) {
  return validator('json', (value) => parseWith(schema, value));
}

export function queryParams<S extends ZodType>(schema: S) {
  return validator('query', (value) => parseWith(schema, value));
}

export function pathParams<S extends ZodType>(schema: S) {
  return validator('param', (value) => parseWith(schema, value));
}
