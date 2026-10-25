import { isAppApiError, lastSegment, retryAfterText } from '../../lib/api/errors';
import { getHttpClient, type HttpClient } from '../../lib/api/http';
import type { EnquiryRequest, EnquiryResponse, EnquiryType } from '../../lib/api/types';

/** Mirrors the form value shape in enquiry.ts (kept structural so this module stays dependency-free). */
export interface EnquiryPayloadLike {
  variant: 'b2b' | 'salesRep' | 'contact';
  submittedAt: string;
  values: Partial<{
    name: string;
    businessName: string;
    email: string;
    phone: string;
    category: string;
    volume: string;
    area: string;
    message: string;
  }>;
}

/** The enquiry transport failed in a way the form can explain. */
export class EnquirySendError extends Error {
  readonly kind: 'network' | 'rate_limited' | 'validation' | 'server';
  readonly fieldErrors: Record<string, string>;
  constructor(kind: EnquirySendError['kind'], message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'EnquirySendError';
    this.kind = kind;
    this.fieldErrors = fieldErrors;
  }
}

const TYPE: Record<EnquiryPayloadLike['variant'], EnquiryType> = { b2b: 'b2b', salesRep: 'sales-rep', contact: 'contact' };

/**
 * The contract has one free-text `message`; fields without a home (weekly volume, area, experience,
 * topic) are written into it as labelled lines so staff see everything the shopper entered.
 */
export function toEnquiryRequest(p: EnquiryPayloadLike): EnquiryRequest {
  const v = p.values;
  const lines: string[] = [];
  if (p.variant === 'contact' && v.category) lines.push(`Topic: ${v.category}`);
  if (p.variant === 'b2b' && v.volume) lines.push(`Expected weekly volume: ${v.volume}`);
  if (p.variant === 'salesRep') {
    if (v.area) lines.push(`Area: ${v.area}`);
    if (v.volume) lines.push(`Sales experience: ${v.volume}`);
  }
  const body = (v.message ?? '').trim();
  const message = [lines.join('\n'), body].filter(Boolean).join('\n\n') || '(no message)';
  return {
    type: TYPE[p.variant],
    name: (v.name ?? '').trim(),
    email: (v.email ?? '').trim(),
    ...(v.phone?.trim() ? { phone: v.phone.trim() } : null),
    ...(p.variant === 'b2b' && v.businessName?.trim()
      ? { business: { name: v.businessName.trim(), type: (v.category ?? '').trim() || 'Other' } }
      : null),
    message,
    website: '', // honeypot: always empty
  };
}

const FIELD_MAP: Record<string, string> = { 'business.name': 'businessName', 'business.type': 'category' };

export function createHttpEnquiryTransport(getClient: () => HttpClient = getHttpClient) {
  return {
    id: 'http',
    deliversToStaff: true,
    async send(payload: EnquiryPayloadLike): Promise<void> {
      try {
        await getClient().request<EnquiryResponse>({ method: 'POST', path: '/v1/enquiries', body: toEnquiryRequest(payload), timeoutMs: 15000 });
      } catch (e) {
        if (!isAppApiError(e)) throw e;
        if (e.isRateLimited) {
          throw new EnquirySendError('rate_limited', `You've sent a few enquiries already. Please try again in ${retryAfterText(e.retryAfter)}.`);
        }
        if (e.isNetwork) throw new EnquirySendError('network', 'Check your connection and try again.');
        if (e.status === 400) {
          const fieldErrors: Record<string, string> = {};
          for (const [path, msg] of Object.entries(e.fieldErrors)) fieldErrors[FIELD_MAP[path] ?? lastSegment(path)] ??= msg;
          throw new EnquirySendError('validation', e.message, fieldErrors);
        }
        throw new EnquirySendError('server', 'Something went wrong on our side. Please try again.');
      }
    },
  };
}
