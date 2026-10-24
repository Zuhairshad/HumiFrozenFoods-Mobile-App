import { ObjectId } from 'mongodb';
import { BadRequestError } from './errors.js';

// ObjectId.isValid also accepts 12-character strings and numbers; we only accept canonical hex.
const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;

export function isObjectIdString(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID_HEX.test(value);
}

/** Parses an untrusted id, answering malformed input with 400 rather than letting the driver throw a 500. */
export function parseObjectId(value: unknown, field = 'id'): ObjectId {
  if (!isObjectIdString(value)) {
    throw new BadRequestError(`Invalid ${field}`, 'invalid_id', { field });
  }
  return new ObjectId(value);
}
