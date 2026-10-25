import { z } from 'zod';
import type { EnquiryInput } from '../domain/types.js';

/*
 * Text policy (applied to every string field):
 *   1. Unicode NFC, so visually identical input compares and dedupes equal.
 *   2. Control (Cc), format (Cf: zero-width, bidi overrides/isolates, BOM), line/paragraph
 *      separators (Zl/Zp), surrogates and private-use characters are REJECTED, not stripped.
 *      Silently stripping would let `a<ZWSP>b` and `ab` differ in storage versus display and
 *      would hide header-injection attempts; a 400 is clearer. Consequence: ZWJ emoji sequences are refused.
 *   3. Single-line fields reject newlines too; runs of Unicode spaces collapse to one ASCII space; then trim.
 *   4. The message is the only multi-line field: CRLF/CR become LF and tabs become spaces
 *      before checking, runs of 3+ newlines collapse to a blank line.
 * HTML is never interpreted or stripped: `<script>` is kept as inert plain text, and output
 * encoding is the responsibility of whatever renders it.
 */
const FORBIDDEN = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;
const FORBIDDEN_EXCEPT_NEWLINE = /[^\P{Cc}\n]|[\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;
const UNICODE_SPACE_RUN = /\p{Zs}+/gu;

export function normaliseLine(value: string): string | null {
  const nfc = value.normalize('NFC');
  if (FORBIDDEN.test(nfc)) return null;
  return nfc.replace(UNICODE_SPACE_RUN, ' ').trim();
}

export function normaliseMessage(value: string): string | null {
  const nfc = value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  if (FORBIDDEN_EXCEPT_NEWLINE.test(nfc)) return null;
  return nfc
    .replace(UNICODE_SPACE_RUN, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const BAD_CHARS = 'Contains unsupported characters';

interface TextOptions {
  min: number;
  max: number;
  label: string;
}

function textField(options: TextOptions, normalise: (value: string) => string | null) {
  const { min, max, label } = options;
  return (
    z
      .string({ error: `${label} must be text` })
      // Cheap cap before normalising so a giant string is never processed.
      .max(max * 4, { error: `${label} is too long` })
      .transform((value, ctx) => {
        const result = normalise(value);
        if (result === null) {
          ctx.addIssue({ code: 'custom', message: BAD_CHARS });
          return z.NEVER;
        }
        return result;
      })
      .pipe(
        z
          .string()
          .min(min, { error: `${label} must be at least ${min} characters` })
          .max(max, { error: `${label} must be at most ${max} characters` }),
      )
  );
}

const line = (label: string, min: number, max: number) => textField({ label, min, max }, normaliseLine);

const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{1,59})$/;
const MAX_EMAIL = 254;

/** ASCII-only addresses (RFC 5321 atoms, no quoted strings or comments). IDN domains must be sent as punycode. */
export function normaliseEmail(value: string): string | null {
  const trimmed = value.normalize('NFC').trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL) return null;
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (local.length > 64 || !LOCAL_PART.test(local)) return null;
  const labels = domain.split('.');
  const tld = labels[labels.length - 1] ?? '';
  if (labels.length < 2 || !labels.every((l) => DOMAIN_LABEL.test(l)) || !TLD.test(tld)) return null;
  return `${local}@${domain}`;
}

const email = z
  .string({ error: 'Email must be text' })
  .max(MAX_EMAIL * 2, { error: 'Enter a valid email' })
  .transform((value, ctx) => {
    const result = normaliseEmail(value);
    if (result === null) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email' });
      return z.NEVER;
    }
    return result;
  });

const PHONE_CHARS = /^[0-9+() -]+$/;
const phone = z
  .string({ error: 'Phone must be text' })
  .max(80, { error: 'Enter a valid phone number' })
  .transform((value) => value.normalize('NFC').trim())
  .pipe(
    z
      .string()
      .min(7, { error: 'Enter a valid phone number' })
      .max(20, { error: 'Enter a valid phone number' })
      .regex(PHONE_CHARS, { error: 'Enter a valid phone number' })
      .refine((v) => (v.match(/[0-9]/g)?.length ?? 0) >= 7, { error: 'Enter a valid phone number' }),
  );

const name = line('Name', 2, 80);
const message = textField({ label: 'Message', min: 10, max: 2000 }, normaliseMessage);
const business = z.strictObject({ name: line('Business name', 2, 80), type: line('Business type', 2, 60) });
// Real users never see this field; any non-empty value is handled before this schema runs.
const website = z.string().max(0).optional();

const contact = z.strictObject({
  type: z.literal('contact'),
  name,
  email,
  phone: phone.optional(),
  message,
  website,
});
const b2b = z.strictObject({ type: z.literal('b2b'), name, email, phone, business, message, website });
const salesRep = z.strictObject({
  type: z.literal('sales-rep'),
  name,
  email,
  phone,
  business: business.optional(),
  message,
  website,
});

const schema = z.discriminatedUnion('type', [contact, b2b, salesRep]);

export const enquirySchema = schema.transform((parsed): EnquiryInput => {
  const rest = { ...parsed };
  delete rest.website;
  return rest;
});

/** Folds case and whitespace so trivially re-typed copies of one message share a dedupe key. */
export function dedupeText(messageText: string): string {
  return messageText.toLowerCase().replace(/\s+/g, ' ');
}

/** True when the raw (unvalidated) body filled the hidden honeypot field. */
export function isHoneypotTripped(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const value = (raw as Record<string, unknown>).website;
  return typeof value === 'string' && value.length > 0;
}
