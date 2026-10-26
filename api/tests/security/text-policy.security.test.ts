import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enquirySchema, normaliseLine, normaliseMessage } from '../../src/enquiries/validation.js';
import { buildHarness, type Harness, type MongoFixture, seedProducts, startMongo } from './support.js';

const cp = (...points: number[]): string => String.fromCodePoint(...points);

const FAMILY = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466);
const RAINBOW_FLAG = cp(0x1f3f3, 0xfe0f, 0x200d, 0x1f308);
const HEART_ON_FIRE = cp(0x2764, 0xfe0f, 0x200d, 0x1f525);
const COOK = cp(0x1f9d1, 0x200d, 0x1f373);
const COOK_TONE = cp(0x1f9d1, 0x1f3fd, 0x200d, 0x1f373);
const THUMB_TONE = cp(0x1f44d, 0x1f3fd);
const KISS_TONES = cp(0x1f9d1, 0x1f3fb, 0x200d, 0x2764, 0xfe0f, 0x200d, 0x1f48b, 0x200d, 0x1f9d1, 0x1f3fc);
const SMILE_VS16 = cp(0x263a, 0xfe0f);
const VICTORY_TEXT_VS15 = cp(0x270c, 0xfe0e);
const KEYCAP = cp(0x31, 0xfe0f, 0x20e3);
const UK_FLAG = cp(0x1f1ec, 0x1f1e7);
const ENGLAND = cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);

describe('enquiry message: emoji sequences are allowed, invisible characters are not', () => {
  it.each([
    ['family ZWJ sequence', FAMILY],
    ['rainbow flag (VS16 + ZWJ)', RAINBOW_FLAG],
    ['heart on fire', HEART_ON_FIRE],
    ['cook', COOK],
    ['cook with skin tone', COOK_TONE],
    ['thumbs up with skin tone', THUMB_TONE],
    ['couple with two skin tones', KISS_TONES],
    ['smiley with VS16', SMILE_VS16],
    ['text-style victory with VS15', VICTORY_TEXT_VS15],
    ['keycap', KEYCAP],
    ['regional flag', UK_FLAG],
    ['England tag flag', ENGLAND],
  ])('accepts %s inside a message and keeps it byte-for-byte', (_name, emoji) => {
    const text = `Lovely samosas ${emoji} thanks, see you soon`;
    expect(normaliseMessage(text)).toBe(text);
    const parsed = enquirySchema.safeParse({ type: 'contact', name: 'Asha Patel', email: 'a@example.com', message: text });
    expect(parsed.success).toBe(true);
  });

  it('accepts emoji at the very start and end and several in a row', () => {
    const text = `${COOK}${FAMILY}${KISS_TONES} order for the party ${HEART_ON_FIRE}`;
    expect(normaliseMessage(text)).toBe(text);
  });

  it.each([
    ['zero-width space', cp(0x200b)],
    ['zero-width non-joiner', cp(0x200c)],
    ['word joiner', cp(0x2060)],
    ['left-to-right mark', cp(0x200e)],
    ['right-to-left mark', cp(0x200f)],
    ['RTL override', cp(0x202e)],
    ['LTR embedding', cp(0x202a)],
    ['bidi isolate', cp(0x2066)],
    ['pop directional isolate', cp(0x2069)],
    ['BOM / zero-width no-break space', cp(0xfeff)],
    ['soft hyphen', cp(0x00ad)],
    ['invisible separator', cp(0x2063)],
    ['bare tag character', cp(0xe0067)],
  ])('rejects %s anywhere in a message', (_name, ch) => {
    expect(normaliseMessage(`before ${ch} after`)).toBeNull();
    expect(normaliseMessage(`${ch}start of message here`)).toBeNull();
    expect(normaliseMessage(`end of message here${ch}`)).toBeNull();
    expect(normaliseMessage(`${COOK}${ch}${COOK}`)).toBeNull();
  });

  it.each([
    ['lone ZWJ between letters', `a${cp(0x200d)}b hello there friend`],
    ['ZWJ after a word', `hello${cp(0x200d)} there friend`],
    ['leading ZWJ', `${cp(0x200d)}hello there friend`],
    ['ZWJ between emoji and a letter', `${cp(0x1f468, 0x200d)}a hello there`],
    ['ZWJ before an emoji from a letter', `a${cp(0x200d, 0x1f468)} hello there`],
    ['trailing ZWJ after an emoji', `${cp(0x1f468, 0x200d)} hello there friend`],
    ['doubled ZWJ inside a sequence', `${cp(0x1f468, 0x200d, 0x200d, 0x1f469)} hello there`],
    ['ZWJ between spaces', `hello ${cp(0x200d)} there friend`],
    ['ZWJ chain used as a covert channel (12 elements)', cp(...Array.from({ length: 12 }, () => [0x1f468, 0x200d]).flat(), 0x1f469) + ' hello there'],
    ['VS16 after a letter', `hello a${cp(0xfe0f)} there friend`],
    ['VS15 after a letter', `hello a${cp(0xfe0e)} there friend`],
    ['VS16 after a digit without a keycap', `hello 1${cp(0xfe0f)} there friend`],
    ['VS16 on its own', `hello ${cp(0xfe0f)} there friend`],
    ['VS16 doubled after an emoji', `${cp(0x263a, 0xfe0f, 0xfe0f)} hello there friend`],
    ['VS-1 (U+FE00)', `${cp(0x263a, 0xfe00)} hello there friend`],
    ['supplementary variation selector', `hello a${cp(0xe0100)} there friend`],
    ['invisible text smuggled in supplementary selectors', `hello${cp(0xe0100, 0xe0101, 0xe0102, 0xe0103)} there friend`],
    ['lone skin-tone modifier glued to a letter then a ZWJ', `a${cp(0x1f3fd, 0x200d)}b hello there`],
  ])('rejects %s', (_name, text) => {
    expect(normaliseMessage(text)).toBeNull();
    const parsed = enquirySchema.safeParse({ type: 'contact', name: 'Asha Patel', email: 'a@example.com', message: text });
    expect(parsed.success).toBe(false);
  });

  it('keeps names strict: no ZWJ, no format characters and no stray variation selectors', () => {
    for (const bad of [`Al${cp(0x200d)}ex`, FAMILY, COOK, `Al${cp(0x200b)}ex`, `Al${cp(0x202e)}ex`, `Al${cp(0xfe0f)}ex`, `Al${cp(0xe0100)}ex`, ENGLAND]) {
      expect(normaliseLine(bad), JSON.stringify(bad)).toBeNull();
      expect(enquirySchema.safeParse({ type: 'contact', name: bad, email: 'a@example.com', message: 'a long enough message' }).success).toBe(false);
    }
    expect(normaliseLine('Jean-Luc O’Brien')).toBe('Jean-Luc O’Brien');
    expect(normaliseLine(`Sam ${SMILE_VS16}`)).toBe(`Sam ${SMILE_VS16}`);
  });

  it('applies the same business and name rules to the b2b and sales-rep variants', () => {
    const base = { email: 'a@example.com', phone: '07123 456789', message: `Order for the shop ${COOK_TONE}` };
    expect(enquirySchema.safeParse({ type: 'b2b', name: 'Asha Patel', business: { name: 'Patel Foods', type: 'Cafe' }, ...base }).success).toBe(true);
    expect(enquirySchema.safeParse({ type: 'b2b', name: 'Asha Patel', business: { name: `Patel${cp(0x200d)}Foods`, type: 'Cafe' }, ...base }).success).toBe(false);
    expect(enquirySchema.safeParse({ type: 'sales-rep', name: 'Asha Patel', ...base }).success).toBe(true);
  });
});

describe('checkout free-text fields reject invisible and direction-changing characters', () => {
  let mongo: MongoFixture;
  let h: Harness;

  beforeAll(async () => {
    mongo = await startMongo();
    await seedProducts(mongo.db);
    h = buildHarness(mongo);
  }, 120_000);

  afterAll(async () => {
    await mongo.stop();
  });

  it.each([
    ['name with RTL override', { contact: { name: `Asha ${cp(0x202e)}Patel`, email: 'asha@example.com', phone: '07123 456789' } }],
    ['name with zero-width space', { contact: { name: `Asha${cp(0x200b)}Patel`, email: 'asha@example.com', phone: '07123 456789' } }],
    ['name with isolate', { contact: { name: `Asha${cp(0x2066)}Patel`, email: 'asha@example.com', phone: '07123 456789' } }],
    ['address line with BOM', { address: { line1: `1 High${cp(0xfeff)} Street`, city: 'London', postcode: 'SW1A 1AA' } }],
    ['city with word joiner', { address: { line1: '1 High Street', city: `Lon${cp(0x2060)}don`, postcode: 'SW1A 1AA' } }],
    ['notes with RTL override', { notes: `leave ${cp(0x202e)}gnihton` }],
    ['notes with line separator', { notes: `a${cp(0x2028)}Delivery: 2030-01-01 morning` }],
    ['notes with bare ZWJ', { notes: `a${cp(0x200d)}b` }],
  ])('rejects %s', async (_name, over) => {
    const placed = await h.placeOrder(over);
    expect(placed.status).toBe(400);
  });

  it('still accepts ordinary international names and emoji in delivery notes', async () => {
    const placed = await h.placeOrder({
      contact: { name: 'Zoë Müller-Łukasiewicz', email: 'zoe@example.com', phone: '07123 456789' },
      address: { line1: '12 Rue de l’Église', city: 'Londres', postcode: 'SW1A 1AA' },
      notes: `Leave by the green door ${COOK_TONE} ${SMILE_VS16} thanks`,
    });
    expect(placed.status).toBe(201);
    const res = await h.call(`/v1/orders/${placed.orderId}`, { headers: { authorization: `Bearer ${placed.guestToken}` } });
    const order = (await res.json()) as { notes: string; contact: { name: string } };
    expect(order.notes).toContain(COOK_TONE);
    expect(order.contact.name).toBe('Zoë Müller-Łukasiewicz');
  });
});
