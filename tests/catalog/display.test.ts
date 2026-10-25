import { describe, expect, it } from 'vitest';
import { formatUnit, toDisplayName } from '@/data/merge';

describe('toDisplayName', () => {
  it.each([
    ['PUNJABI SAMOSA ROTI', 'Punjabi Samosa Roti'],
    ['  MEAT   PESHAWARI CHAPLI KEBAB ', 'Meat Peshawari Chapli Kebab'],
    ['CHICKEN SEEKH KEBAB', 'Chicken Seekh Kebab'],
    ['ALOO TIKKI', 'Aloo Tikki'],
    ['SAMOSA AND CHUTNEY', 'Samosa and Chutney'],
    ['TIKKA-MASALA PIE', 'Tikka-Masala Pie'],
  ])('title-cases an all-caps name: %s', (input, expected) => {
    expect(toDisplayName(input)).toBe(expected);
  });

  it.each([
    ['Chicken Samosa', 'Chicken Samosa'],
    ['iPhone Case', 'iPhone Case'],
    ['Meat SAMOSA', 'Meat SAMOSA'],
  ])('leaves a name with lower-case letters exactly as written: %s', (input, expected) => {
    expect(toDisplayName(input)).toBe(expected);
  });

  it('handles empty and symbol-only input without throwing', () => {
    expect(toDisplayName('')).toBe('');
    expect(toDisplayName('   ')).toBe('');
    expect(toDisplayName('1234')).toBe('1234');
  });
});

describe('formatUnit', () => {
  it.each([
    ['500', '500g'],
    [' 720 ', '720g'],
    ['12.5', '12.5g'],
    ['20 pcs', '20 pcs'],
    ['700g', '700g'],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('formatUnit(%j) = %j', (input, expected) => {
    expect(formatUnit(input)).toBe(expected);
  });
});
