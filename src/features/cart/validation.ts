export const UK_POSTCODE = /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?)|[0-9][A-HJKPS-UW]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface CheckoutForm {
  name: string;
  email: string;
  phone: string;
  line1: string;
  city: string;
  postcode: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
}

export type FormErrors = Partial<Record<keyof CheckoutForm | 'slot', string>>;

export function validateCheckout(f: CheckoutForm, payment: 'cod' | 'card', hasSlot: boolean): FormErrors {
  const e: FormErrors = {};
  if (f.name.trim().length < 2) e.name = 'Please enter your full name';
  if (!EMAIL.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (f.phone.replace(/[^\d]/g, '').length < 10) e.phone = 'Enter a valid phone number';
  if (f.line1.trim().length < 4) e.line1 = 'Enter your street address';
  if (f.city.trim().length < 2) e.city = 'Enter your city';
  if (!UK_POSTCODE.test(f.postcode.trim())) e.postcode = 'Enter a valid UK postcode, e.g. M1 1AE';
  if (!hasSlot) e.slot = 'Choose a delivery slot';
  if (payment === 'card') {
    if (f.cardNumber.replace(/\s/g, '').length !== 16) e.cardNumber = 'Card number must be 16 digits';
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(f.cardExpiry)) e.cardExpiry = 'Use MM/YY';
    if (!/^\d{3,4}$/.test(f.cardCvc)) e.cardCvc = '3 or 4 digits';
  }
  return e;
}

export const formatCardNumber = (v: string) =>
  v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();

export const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};

export const normalisePostcode = (v: string) => {
  const c = v.replace(/\s/g, '').toUpperCase();
  return c.length > 3 ? `${c.slice(0, -3)} ${c.slice(-3)}` : c;
};
