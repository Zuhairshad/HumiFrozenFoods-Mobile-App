import { describe, expect, it } from 'vitest';
import { buildRedactPaths, createLogger } from '../../../src/lib/logger.js';
import { Secret } from '../../../src/lib/secret.js';
import { captureLogs } from '../helpers.js';

describe('logger redaction', () => {
  function log(payload: Record<string, unknown>): { raw: string; entry: Record<string, unknown> } {
    const capture = captureLogs();
    createLogger({ level: 'info', destination: capture.stream }).info(payload, 'test');
    return { raw: capture.text(), entry: capture.lines()[0] ?? {} };
  }

  it('redacts credentials in request headers', () => {
    const { raw } = log({
      req: { headers: { authorization: 'Bearer abc.def', cookie: 'sid=123', 'stripe-signature': 't=1,v1=zzz', 'x-api-key': 'k' } },
    });
    for (const secret of ['abc.def', 'sid=123', 'v1=zzz']) expect(raw).not.toContain(secret);
    expect(raw).toContain('[REDACTED]');
  });

  it.each([
    ['top-level email', { email: 'jane@example.com' }, 'jane@example.com'],
    ['nested phone', { customer: { phone: '+447700900123' } }, '+447700900123'],
    ['deeply nested card number', { order: { payment: { cardNumber: '4242424242424242' } } }, '4242424242424242'],
    ['cvc', { payment: { cvc: '737' } }, '737'],
    ['password', { body: { password: 'hunter2' } }, 'hunter2'],
    ['guest token', { guestToken: 'hgt1.k1.aaa.bbb' }, 'hgt1.k1.aaa.bbb'],
    ['client secret', { pi: { clientSecret: 'pi_123_secret_456' } }, 'pi_123_secret_456'],
    ['address', { shipping: { address: '1 Privet Drive' } }, '1 Privet Drive'],
  ])('redacts %s', (_label, payload, secret) => {
    expect(log(payload).raw).not.toContain(secret);
  });

  it('keeps non-sensitive fields and standard metadata', () => {
    const { entry } = log({ orderId: 'abc', requestId: 'req-1' });
    expect(entry).toMatchObject({ orderId: 'abc', requestId: 'req-1', service: 'humis-api', msg: 'test' });
    expect(typeof entry.time).toBe('string');
  });

  it('does not log Secret values', () => {
    expect(log({ uri: new Secret('mongodb://u:p@h') }).raw).not.toContain('u:p@h');
  });

  it('serialises errors with stacks (internal logs only)', () => {
    const capture = captureLogs();
    createLogger({ level: 'info', destination: capture.stream }).error({ err: new Error('boom') }, 'x');
    expect(capture.lines()[0]).toMatchObject({ err: { message: 'boom' } });
  });

  it('quotes non-identifier keys in redact paths', () => {
    const paths = buildRedactPaths();
    expect(paths).toContain('["set-cookie"]');
    expect(paths).toContain('*.*["stripe-signature"]');
    expect(paths).toContain('*.email');
  });

  it('builds a pretty-transport logger in development', () => {
    const logger = createLogger({ level: 'silent', pretty: true });
    expect(logger.level).toBe('silent');
  });
});
