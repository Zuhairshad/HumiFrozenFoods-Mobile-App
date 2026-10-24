import { describe, expect, it } from 'vitest';
import { BadRequestError } from '../../../src/lib/errors.js';
import { assertSafeKeys } from '../../../src/lib/safe-object.js';

describe('assertSafeKeys', () => {
  it('accepts ordinary data', () => {
    expect(() => { assertSafeKeys({ a: 1, b: { c: [1, 'x', { d: null }] }, e: undefined }); }).not.toThrow();
    expect(() => { assertSafeKeys('string'); }).not.toThrow();
    expect(() => { assertSafeKeys(null); }).not.toThrow();
  });

  it.each([
    ['$-operator at top level', { $where: '1' }],
    ['nested operator', { filter: { email: { $ne: null } } }],
    ['operator in array element', { list: [{ $gt: 1 }] }],
    ['dotted path', { 'a.b': 1 }],
    ['nested dotted path', { a: { 'b.c': 1 } }],
    ['__proto__ own key', JSON.parse('{"__proto__": {"admin": true}}') as unknown],
    ['constructor', { constructor: { prototype: {} } }],
    ['prototype', { prototype: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(() => { assertSafeKeys(value); }).toThrow(BadRequestError);
  });

  it('rejects excessive nesting instead of overflowing the stack', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 40; i += 1) deep = { a: deep };
    expect(() => { assertSafeKeys(deep); }).toThrow(/nested too deeply/);
  });
});
