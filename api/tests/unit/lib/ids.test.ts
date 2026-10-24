import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../../../src/lib/errors.js';
import { isObjectIdString, parseObjectId } from '../../../src/lib/ids.js';

describe('parseObjectId', () => {
  it('parses canonical 24-char hex', () => {
    const hex = '507f1f77bcf86cd799439011';
    expect(parseObjectId(hex).toHexString()).toBe(hex);
    expect(parseObjectId(hex.toUpperCase()).toHexString()).toBe(hex);
  });

  it.each([
    ['too short', 'abc'],
    ['12-char string the driver would accept', 'abcdefghijkl'],
    ['non-hex', 'zzzzzzzzzzzzzzzzzzzzzzzz'],
    ['empty', ''],
    ['number', 123],
    ['object', { $ne: null }],
    ['null', null],
    ['undefined', undefined],
    ['ObjectId instance', new ObjectId()],
  ])('rejects %s with a 400 BadRequestError', (_label, value) => {
    expect(ObjectId.isValid(value as string)).toBeDefined();
    try {
      parseObjectId(value, 'orderId');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).status).toBe(400);
      expect((error as BadRequestError).code).toBe('invalid_id');
      expect((error as BadRequestError).message).toBe('Invalid orderId');
    }
  });

  it('isObjectIdString is a strict type guard', () => {
    expect(isObjectIdString('507f1f77bcf86cd799439011')).toBe(true);
    expect(isObjectIdString('507f1f77bcf86cd79943901')).toBe(false);
    expect(isObjectIdString(5)).toBe(false);
  });
});
