import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../../src/catalog/cursor.js';
import { BadRequestError } from '../../../src/lib/errors.js';

const ID = '698601c30c0410b7e96591dc';

describe('cursor', () => {
  it('round-trips an object id', () => {
    expect(decodeCursor(encodeCursor(ID))).toBe(ID);
  });

  it('is URL-safe base64 and does not look like the raw id', () => {
    const cursor = encodeCursor(ID);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain(ID);
  });

  it('lower-cases decoded upper-case ids', () => {
    expect(decodeCursor(encodeCursor(ID.toUpperCase()))).toBe(ID);
  });

  const b64 = (text: string) => Buffer.from(text).toString('base64url');
  it.each([
    ['empty', ''],
    ['plain id (not encoded)', ID],
    ['bad characters', '!!!!'],
    ['padding', `${encodeCursor(ID)}==`],
    ['too long', 'A'.repeat(65)],
    ['non-hex payload', b64('zzzzzzzzzzzzzzzzzzzzzzzz')],
    ['short payload', b64('abc')],
    ['json operator', b64('{"$ne":null}')],
    ['where', b64('$where')],
    ['long hex payload', b64(`${ID}00`)],
  ])('rejects %s with a 400', (_label, cursor) => {
    try {
      decodeCursor(cursor);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).code).toBe('invalid_cursor');
    }
  });
});
