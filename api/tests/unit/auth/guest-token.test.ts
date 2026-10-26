import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGuestTokenService } from '../../../src/auth/guest-token.js';
import { Keyring, parseKeyring } from '../../../src/auth/keyring.js';

const ORDER = '507f1f77bcf86cd799439011';
const NOW = 1_800_000_000_000;

function setup(options: { now?: () => number; ttl?: number; keys?: [string, Buffer][] } = {}) {
  const keys = options.keys ?? [['k1', randomBytes(32)]];
  const clock = { now: options.now ?? (() => NOW) };
  const service = createGuestTokenService({ keyring: new Keyring(keys), ttlSeconds: options.ttl ?? 3600, now: () => clock.now() });
  return { service, keys, clock };
}

const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('guest tokens', () => {
  it('round-trips an order id and expiry', () => {
    const { service } = setup();
    const issued = service.issue(ORDER);
    expect(issued.expiresAt).toEqual(new Date(NOW + 3_600_000));
    const result = service.verify(issued.token, ORDER);
    expect(result).toEqual({ ok: true, orderId: ORDER, expiresAt: issued.expiresAt, kid: 'k1' });
  });

  it('verifies without an expected order id', () => {
    const { service } = setup();
    expect(service.verify(service.issue(ORDER).token)).toMatchObject({ ok: true, orderId: ORDER });
  });

  it('refuses a token for a different order', () => {
    const { service } = setup();
    expect(service.verify(service.issue(ORDER).token, 'other')).toEqual({ ok: false, reason: 'wrong_order' });
  });

  it('rejects expired tokens exactly at expiry', () => {
    const { service, clock } = setup({ ttl: 60 });
    const { token } = service.issue(ORDER);
    clock.now = () => NOW + 59_000;
    expect(service.verify(token).ok).toBe(true);
    clock.now = () => NOW + 60_000;
    expect(service.verify(token)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects tokens issued implausibly far in the future', () => {
    const { service, clock } = setup();
    const { token } = service.issue(ORDER);
    clock.now = () => NOW - 120_000;
    expect(service.verify(token)).toEqual({ ok: false, reason: 'not_yet_valid' });
    clock.now = () => NOW - 30_000;
    expect(service.verify(token).ok).toBe(true);
  });

  describe('tampering', () => {
    it('detects payload edits (extending expiry or changing the order)', () => {
      const { service } = setup();
      const [v, kid, payload, mac] = service.issue(ORDER).token.split('.') as [string, string, string, string];
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
      for (const edit of [{ exp: (decoded.exp as number) + 86_400 }, { oid: 'someoneelse' }]) {
        const forged = `${v}.${kid}.${b64({ ...decoded, ...edit })}.${mac}`;
        expect(service.verify(forged)).toEqual({ ok: false, reason: 'bad_signature' });
      }
    });

    it('rejects every non-canonical spelling of a valid signature (padding bits and "=" padding)', () => {
      const { service } = setup();
      let equivalentSpellings = 0;
      for (let i = 0; i < 40; i++) {
        const orderId = `507f1f77bcf86cd7994390${String(10 + i)}`;
        const token = service.issue(orderId).token;
        const macStart = token.lastIndexOf('.') + 1;
        const mac = token.slice(macStart);
        const realBytes = Buffer.from(mac, 'base64url');
        expect(service.verify(token, orderId)).toMatchObject({ ok: true });

        for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_') {
          if (c === mac.at(-1)) continue;
          const spelling = mac.slice(0, -1) + c;
          // Only spellings that decode to the SAME bytes are interesting: they carry a genuine signature.
          if (!Buffer.from(spelling, 'base64url').equals(realBytes)) continue;
          equivalentSpellings++;
          expect(service.verify(token.slice(0, macStart) + spelling, orderId)).toEqual({ ok: false, reason: 'bad_signature' });
        }
        expect(service.verify(`${token}=`, orderId)).toEqual({ ok: false, reason: 'bad_signature' });
        expect(service.verify(`${token}==`, orderId)).toEqual({ ok: false, reason: 'bad_signature' });
      }
      // 43 base64url chars carry 258 bits for a 256-bit MAC, so 3 alternative final characters exist per token.
      expect(equivalentSpellings).toBe(40 * 3);
    });

    it('detects signature edits and truncation', () => {
      const { service } = setup();
      const token = service.issue(ORDER).token;
      // Flip the first MAC char: the last base64url char carries padding bits and may not change the bytes.
      const macStart = token.lastIndexOf('.') + 1;
      const flipped = token.slice(0, macStart) + (token[macStart] === 'A' ? 'B' : 'A') + token.slice(macStart + 1);
      expect(service.verify(flipped)).toEqual({ ok: false, reason: 'bad_signature' });
      expect(service.verify(token.slice(0, -4))).toEqual({ ok: false, reason: 'bad_signature' });
      expect(service.verify(`${token.slice(0, token.lastIndexOf('.'))}.`)).toEqual({ ok: false, reason: 'malformed' });
    });

    it('rejects a token signed by a different key', () => {
      const a = setup();
      const b = setup();
      expect(b.service.verify(a.service.issue(ORDER).token)).toEqual({ ok: false, reason: 'bad_signature' });
    });

    it('cannot be re-labelled with another kid', () => {
      const { service } = setup({ keys: [['k1', randomBytes(32)], ['k2', randomBytes(32)]] });
      const [v, , payload, mac] = service.issue(ORDER).token.split('.') as [string, string, string, string];
      expect(service.verify(`${v}.k2.${payload}.${mac}`)).toEqual({ ok: false, reason: 'bad_signature' });
    });

    it('rejects unknown kid, wrong version and structural garbage', () => {
      const { service } = setup();
      const [v, , payload, mac] = service.issue(ORDER).token.split('.') as [string, string, string, string];
      expect(service.verify(`${v}.zz.${payload}.${mac}`)).toEqual({ ok: false, reason: 'unknown_kid' });
      expect(service.verify(`v9.k1.${payload}.${mac}`)).toEqual({ ok: false, reason: 'malformed' });
      for (const junk of ['', 'a.b.c', 'a.b.c.d.e', '....', 'x'.repeat(600)]) {
        expect(service.verify(junk)).toEqual({ ok: false, reason: 'malformed' });
      }
    });

    it('rejects validly signed payloads with the wrong shape or scope', () => {
      const { service, keys } = setup();
      const keyring = new Keyring(keys);
      const sign = (payload: string) => {
        const input = `hgt1.k1.${payload}`;
        return `${input}.${(keyring.hmac('k1', input) as Buffer).toString('base64url')}`;
      };
      const good = { oid: ORDER, scope: 'guest-order', iat: NOW / 1000, exp: NOW / 1000 + 100 };
      expect(service.verify(sign(b64({ ...good, scope: 'admin' })))).toEqual({ ok: false, reason: 'malformed' });
      expect(service.verify(sign(b64({ ...good, extra: 1 })))).toEqual({ ok: false, reason: 'malformed' });
      expect(service.verify(sign(b64({ ...good, oid: 'bad id!' })))).toEqual({ ok: false, reason: 'malformed' });
      expect(service.verify(sign(Buffer.from('not json').toString('base64url')))).toEqual({ ok: false, reason: 'malformed' });
    });
  });

  describe('key rotation', () => {
    it('keeps old tokens valid while the old key stays in the ring, then drops them', () => {
      const oldKey = randomBytes(32);
      const newKey = randomBytes(32);
      const before = setup({ keys: [['old', oldKey]] });
      const token = before.service.issue(ORDER).token;

      const during = setup({ keys: [['new', newKey], ['old', oldKey]] });
      expect(during.service.verify(token)).toMatchObject({ ok: true, kid: 'old' });
      expect(during.service.verify(during.service.issue(ORDER).token)).toMatchObject({ ok: true, kid: 'new' });

      const after = setup({ keys: [['new', newKey]] });
      expect(after.service.verify(token)).toEqual({ ok: false, reason: 'unknown_kid' });
    });
  });

  it('refuses to issue for ids it could not later verify', () => {
    expect(() => setup().service.issue('bad id')).toThrow(RangeError);
    expect(() => setup().service.issue('')).toThrow(RangeError);
  });

  it('uses the real clock by default', () => {
    const service = createGuestTokenService({ keyring: new Keyring([['k', randomBytes(32)]]), ttlSeconds: 60 });
    expect(service.verify(service.issue(ORDER).token).ok).toBe(true);
  });
});

describe('Keyring / parseKeyring', () => {
  const key = randomBytes(32).toString('base64url');

  it('parses multiple entries; first is active', () => {
    const ring = parseKeyring(`a:${key}, b:${randomBytes(32).toString('base64url')}`);
    expect(ring.activeKid).toBe('a');
    expect(ring.has('b')).toBe(true);
    expect(ring.has('c')).toBe(false);
    expect(ring.hmac('c', 'x')).toBeUndefined();
  });

  it('never serialises key material', () => {
    const ring = parseKeyring(`a:${key}`);
    expect(JSON.stringify(ring)).toBe('"[REDACTED]"');
    expect(JSON.stringify(Object.entries(ring))).not.toContain(key);
  });

  it.each([
    ['empty', ''],
    ['no separator', 'abc'],
    ['empty kid', `:${key}`],
    ['empty key', 'a:'],
    ['non-base64url key', 'a:not base64!'],
    ['short key', `a:${randomBytes(16).toString('base64url')}`],
    ['bad kid', `a.b:${key}`],
    ['duplicate kid', `a:${key},a:${key}`],
  ])('rejects %s without echoing key material', (_label, raw) => {
    expect(() => parseKeyring(raw)).toThrow();
    try {
      parseKeyring(raw);
    } catch (error) {
      expect((error as Error).message).not.toContain(key);
    }
  });

  it('requires at least one key', () => {
    expect(() => new Keyring([])).toThrow(/at least one/);
  });
});
