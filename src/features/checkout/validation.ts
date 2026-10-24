export const UK_POSTCODE =
  /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?)|[0-9][A-HJKPS-UW]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface CheckoutFormValues {
  email: string;
  phone: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  notes: string;
}

export const EMPTY_FORM: CheckoutFormValues = {
  email: '',
  phone: '',
  name: '',
  line1: '',
  line2: '',
  city: '',
  postcode: '',
  notes: '',
};

export type RequiredField = 'email' | 'phone' | 'name' | 'line1' | 'city' | 'postcode';
export type FormErrors = Partial<Record<RequiredField | 'slot', string>>;

export function validateField(field: RequiredField, v: CheckoutFormValues): string | undefined {
  switch (field) {
    case 'email':
      return EMAIL.test(v.email.trim()) ? undefined : 'Enter a valid email address.';
    case 'phone':
      return v.phone.replace(/[^\d]/g, '').length >= 10 ? undefined : 'Enter a valid phone number.';
    case 'name':
      return v.name.trim().length >= 2 ? undefined : 'Enter your full name.';
    case 'line1':
      return v.line1.trim().length >= 4 ? undefined : 'Enter your street address.';
    case 'city':
      return v.city.trim().length >= 2 ? undefined : 'Enter your town or city.';
    case 'postcode':
      return UK_POSTCODE.test(v.postcode.trim()) ? undefined : 'Enter a valid UK postcode, e.g. M1 1AE.';
  }
}

export const REQUIRED_FIELDS: readonly RequiredField[] = ['email', 'phone', 'name', 'line1', 'city', 'postcode'];

export function validateForm(v: CheckoutFormValues, hasSlot: boolean): FormErrors {
  const e: FormErrors = {};
  for (const f of REQUIRED_FIELDS) {
    const msg = validateField(f, v);
    if (msg) e[f] = msg;
  }
  if (!hasSlot) e.slot = 'Choose a delivery day and time.';
  return e;
}

/** "m11ae" -> "M1 1AE" */
export const normalisePostcode = (v: string): string => {
  const c = v.replace(/\s/g, '').toUpperCase();
  return c.length > 3 ? `${c.slice(0, -3)} ${c.slice(-3)}` : c;
};
