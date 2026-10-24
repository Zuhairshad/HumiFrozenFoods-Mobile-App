import { createHmac } from 'node:crypto';

const KID = /^[A-Za-z0-9_-]{1,16}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MIN_KEY_BYTES = 32;

/**
 * HMAC keys addressed by `kid`. The first key signs; every key verifies, which
 * lets operators rotate by prepending a new key and removing the old one after
 * the longest token lifetime has passed. Key bytes are private and never
 * serialised.
 */
export class Keyring {
  readonly #keys: ReadonlyMap<string, Buffer>;
  readonly activeKid: string;

  constructor(entries: readonly (readonly [kid: string, key: Buffer])[]) {
    const first = entries[0];
    if (!first) throw new Error('Keyring needs at least one key');
    const map = new Map<string, Buffer>();
    for (const [kid, key] of entries) {
      if (!KID.test(kid)) throw new Error(`Invalid key id "${kid}"`);
      if (map.has(kid)) throw new Error(`Duplicate key id "${kid}"`);
      if (key.length < MIN_KEY_BYTES) throw new Error(`Key "${kid}" must be at least ${String(MIN_KEY_BYTES)} bytes`);
      map.set(kid, key);
    }
    this.#keys = map;
    this.activeKid = first[0];
  }

  has(kid: string): boolean {
    return this.#keys.has(kid);
  }

  hmac(kid: string, data: string): Buffer | undefined {
    const key = this.#keys.get(kid);
    return key && createHmac('sha256', key).update(data).digest();
  }

  toJSON(): string {
    return '[REDACTED]';
  }
}

/** Parses "kid:base64url[,kid:base64url...]". Error messages name key ids, never key material. */
export function parseKeyring(raw: string): Keyring {
  const entries = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): [string, Buffer] => {
      const separator = part.indexOf(':');
      const kid = separator === -1 ? '' : part.slice(0, separator);
      const encoded = separator === -1 ? '' : part.slice(separator + 1);
      if (!kid || !BASE64URL.test(encoded)) {
        throw new Error('entries must look like "kid:base64url-key"');
      }
      return [kid, Buffer.from(encoded, 'base64url')];
    });
  return new Keyring(entries);
}
