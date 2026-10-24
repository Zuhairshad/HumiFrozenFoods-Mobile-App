import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { PayloadTooLargeError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

/** Enforces both Content-Length and streamed size, so chunked uploads cannot dodge the cap. */
export function requestBodyLimit(maxBytes: number): MiddlewareHandler<AppEnv> {
  return bodyLimit({
    maxSize: maxBytes,
    onError: () => {
      throw new PayloadTooLargeError(maxBytes);
    },
  });
}
