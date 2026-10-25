import { BadRequestError } from '../lib/errors.js';
import { isObjectIdString } from '../lib/ids.js';

export const MAX_CURSOR_LENGTH = 64;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Opaque to clients: base64url of the last returned `_id` hex. Pagination is `_id > cursor`, sorted by `_id`. */
export function encodeCursor(objectIdHex: string): string {
  return Buffer.from(objectIdHex, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string {
  if (cursor.length > MAX_CURSOR_LENGTH || !BASE64URL.test(cursor)) throw invalidCursor();
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!isObjectIdString(decoded) || encodeCursor(decoded) !== cursor) throw invalidCursor();
  return decoded.toLowerCase();
}

function invalidCursor(): BadRequestError {
  return new BadRequestError('Invalid cursor', 'invalid_cursor');
}
