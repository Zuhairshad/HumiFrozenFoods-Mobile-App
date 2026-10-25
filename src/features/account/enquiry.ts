import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../lib/api/http';
import { createHttpEnquiryTransport, EnquirySendError } from './enquiry-http';

export type EnquiryVariant = 'b2b' | 'salesRep' | 'contact';

export interface EnquiryValues {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  /** Business type (b2b) or topic (contact). */
  category: string;
  /** Weekly volume (b2b) or experience (salesRep). */
  volume: string;
  area: string;
  message: string;
}

export type EnquiryField = keyof EnquiryValues;
export type EnquiryErrors = Partial<Record<EnquiryField, string>>;

export const emptyEnquiry: EnquiryValues = {
  name: '',
  businessName: '',
  email: '',
  phone: '',
  category: '',
  volume: '',
  area: '',
  message: '',
};

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const isPhone = (v: string) => /^[+\d\s().-]+$/.test(v.trim()) && v.replace(/\D/g, '').length >= 9;

export interface VariantConfig {
  title: string;
  submitLabel: string;
  successTitle: string;
  successMessage: string;
  fields: readonly EnquiryField[];
  required: readonly EnquiryField[];
  categoryLabel?: string;
  categoryOptions?: readonly string[];
  volumeLabel?: string;
  volumeOptions?: readonly string[];
  messageLabel: string;
  messageRequired: boolean;
  messageMin: number;
}

export const VARIANTS: Record<EnquiryVariant, VariantConfig> = {
  b2b: {
    title: 'Request a call back',
    submitLabel: 'Send Enquiry',
    successTitle: 'Enquiry ready',
    successMessage: 'Our trade team will use these details to call you back.',
    fields: ['businessName', 'name', 'email', 'phone', 'category', 'volume', 'message'],
    required: ['businessName', 'name', 'email', 'phone', 'category'],
    categoryLabel: 'Business type',
    categoryOptions: ['Restaurant', 'Takeaway', 'Caterer', 'Retailer', 'Other'],
    volumeLabel: 'Expected weekly volume',
    volumeOptions: ['Under 50', '50 to 200', '200+'],
    messageLabel: 'Notes (optional)',
    messageRequired: false,
    messageMin: 0,
  },
  salesRep: {
    title: 'Your details',
    submitLabel: 'Send Application',
    successTitle: 'Application ready',
    successMessage: 'Our team will use these details to get in touch about becoming a sales rep.',
    fields: ['name', 'email', 'phone', 'area', 'volume', 'message'],
    required: ['name', 'email', 'phone', 'area'],
    volumeLabel: 'Sales experience',
    volumeOptions: ['New to sales', '1 to 3 years', '3+ years'],
    messageLabel: 'Tell us about yourself (optional)',
    messageRequired: false,
    messageMin: 0,
  },
  contact: {
    title: 'Send a message',
    submitLabel: 'Send Message',
    successTitle: 'Message ready',
    successMessage: 'Thanks for getting in touch.',
    fields: ['name', 'email', 'category', 'message'],
    required: ['name', 'email', 'category', 'message'],
    categoryLabel: 'Topic',
    categoryOptions: ['Order', 'Products', 'Delivery', 'Other'],
    messageLabel: 'Message',
    messageRequired: true,
    messageMin: 10,
  },
};

const LABELS: Record<EnquiryField, string> = {
  name: 'your name',
  businessName: 'your business name',
  email: 'your email address',
  phone: 'your phone number',
  category: 'an option',
  volume: 'an option',
  area: 'the area you cover',
  message: 'a message',
};

/** Validate a single field for a variant. Returns an error message or undefined. */
export function validateField(
  variant: EnquiryVariant,
  field: EnquiryField,
  values: EnquiryValues,
): string | undefined {
  const cfg = VARIANTS[variant];
  const value = values[field].trim();
  const required = cfg.required.includes(field);
  if (!value) return required ? `Enter ${LABELS[field]}.` : undefined;
  switch (field) {
    case 'name':
    case 'businessName':
      return value.length < 2 ? `Enter ${LABELS[field]}.` : undefined;
    case 'email':
      return isEmail(value) ? undefined : 'Enter a valid email address.';
    case 'phone':
      return isPhone(value) ? undefined : 'Enter a valid phone number.';
    case 'message':
      return value.length < cfg.messageMin ? `Write at least ${cfg.messageMin} characters.` : undefined;
    default:
      return undefined;
  }
}

export function validateEnquiry(variant: EnquiryVariant, values: EnquiryValues): EnquiryErrors {
  const errors: EnquiryErrors = {};
  for (const field of VARIANTS[variant].fields) {
    const error = validateField(variant, field, values);
    if (error) errors[field] = error;
  }
  return errors;
}

export interface EnquiryPayload {
  variant: EnquiryVariant;
  submittedAt: string;
  values: Partial<EnquiryValues>;
}

/** Sends an enquiry somewhere. Replace the active transport once a backend exists. */
export interface EnquiryTransport {
  readonly id: string;
  /** True only when `send` hands the enquiry to staff (server, email, CRM). */
  readonly deliversToStaff: boolean;
  send(payload: EnquiryPayload): Promise<void>;
}

const STORAGE_KEY = 'humi-enquiries-outbox';
const MAX_SAVED = 20;
const MOCK_LATENCY_MS = 800;

/** Keeps the enquiry on this device only. Nothing leaves the phone. */
export const localEnquiryTransport: EnquiryTransport = {
  id: 'local',
  deliversToStaff: false,
  async send(payload) {
    await new Promise<void>((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const list: unknown[] = Array.isArray(parsed) ? parsed : [];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([payload, ...list].slice(0, MAX_SAVED)));
    } catch {
      // Storage unavailable: still resolve, the form data is simply not persisted.
    }
  },
};

/** POST /v1/enquiries (honeypot `website` always empty). Selected when EXPO_PUBLIC_API_BASE_URL is set. */
export const httpEnquiryTransport: EnquiryTransport = createHttpEnquiryTransport();

let transport: EnquiryTransport = API_BASE_URL ? httpEnquiryTransport : localEnquiryTransport;

export function setEnquiryTransport(next: EnquiryTransport): void {
  transport = next;
}

/** True when the active transport really delivers to staff. False means "local mode". */
export function isEnquiryDeliveryConnected(): boolean {
  return transport.deliversToStaff;
}

/** Honest success copy per mode. Demo never claims delivery. */
export const LOCAL_ENQUIRY_NOTICE = "Saved on this device — sending isn't connected in demo mode";
export const LIVE_ENQUIRY_MESSAGE = "Thanks — we'll be in touch";

export type SubmitEnquiryResult =
  | { ok: true; delivered: boolean }
  | { ok: false; errors?: EnquiryErrors; message?: string };

const FIELDS = Object.keys(emptyEnquiry) as EnquiryField[];

export async function submitEnquiry(
  variant: EnquiryVariant,
  values: EnquiryValues,
): Promise<SubmitEnquiryResult> {
  const errors = validateEnquiry(variant, values);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const picked: Partial<EnquiryValues> = {};
  for (const field of VARIANTS[variant].fields) picked[field] = values[field].trim();

  try {
    await transport.send({ variant, submittedAt: new Date().toISOString(), values: picked });
    return { ok: true, delivered: transport.deliversToStaff };
  } catch (e) {
    if (e instanceof EnquirySendError) {
      const errors: EnquiryErrors = {};
      for (const [k, msg] of Object.entries(e.fieldErrors)) if ((FIELDS as string[]).includes(k)) errors[k as EnquiryField] = msg;
      return { ok: false, message: e.message, ...(Object.keys(errors).length ? { errors } : null) };
    }
    return { ok: false, message: 'Check your connection and try again.' };
  }
}
