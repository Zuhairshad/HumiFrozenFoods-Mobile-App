import { createHash, timingSafeEqual } from 'node:crypto';

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Last ten digits, so "+44 7700 900123" and "07700 900123" compare equal. */
export function normalisePhone(phone: string): string {
  return phoneDigits(phone).slice(-10);
}

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Hashing first gives both sides equal length, so the comparison time does not depend on where they differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

export interface ContactClaim {
  email?: string | undefined;
  phone?: string | undefined;
}

export interface StoredContact {
  email: string;
  phone: string;
}

/** Stand-in compared when no order exists, so a miss does the same hashing work as a mismatch. */
export const DUMMY_CONTACT: StoredContact = { email: 'nobody@invalid.example', phone: '0000000000' };

/**
 * Every supplied field must match. Both comparisons always run (no short-circuit) so timing does not
 * reveal which of them failed.
 */
export function contactMatches(claim: ContactClaim, stored: StoredContact): boolean {
  const emailOk = claim.email === undefined ? true : constantTimeEqual(normaliseEmail(claim.email), normaliseEmail(stored.email));
  const phoneOk = claim.phone === undefined ? true : constantTimeEqual(normalisePhone(claim.phone), normalisePhone(stored.phone));
  const supplied = claim.email !== undefined || claim.phone !== undefined;
  return supplied && emailOk && phoneOk;
}
