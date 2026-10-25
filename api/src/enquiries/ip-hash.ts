import { createHmac } from 'node:crypto';

/**
 * Keyed hash so the stored value can group requests from one address without being
 * reversible by brute-forcing the small IPv4 space (which a bare SHA-256 would allow).
 */
export function hashIp(ip: string, salt: string): string {
  if (salt.length === 0) throw new Error('IP hash salt must not be empty');
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}
