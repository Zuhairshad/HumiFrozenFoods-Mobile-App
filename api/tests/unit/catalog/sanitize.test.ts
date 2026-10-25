import { describe, expect, it } from 'vitest';
import { cleanLine, collapseWhitespace, decodeEntities, escapeRegExp, htmlToText, toHttpsUrl } from '../../../src/catalog/sanitize.js';

describe('decodeEntities', () => {
  it.each([
    ['&lt;h2&gt;', '<h2>'],
    ['Tom &amp; Jerry', 'Tom & Jerry'],
    ['Humi&rsquo;s', 'Humi’s'],
    ['&#39;quoted&#x27;', "'quoted'"],
    ['&#x1F600;', '\u{1F600}'],
    ['&POUND;5', '£5'],
    ['&unknownentity;', '&unknownentity;'],
    ['&#0;', '\u0000'],
    ['&#xD800;', ' '],
    ['&#1114112;', ' '],
    ['no entities & stuff', 'no entities & stuff'],
  ])('%j -> %j', (input, expected) => {
    expect(decodeEntities(input)).toBe(expected);
  });

  it('decodes double-encoded markup so it cannot hide from the stripper, but only a bounded number of times', () => {
    expect(decodeEntities('&amp;lt;b&amp;gt;')).toBe('<b>');
    expect(decodeEntities('&amp;amp;amp;amp;amp;lt;')).toBe('&amp;amp;lt;');
  });
});

describe('htmlToText', () => {
  it("handles the site's real shape: leading '<' entity-escaped, '>' raw", () => {
    const html = "&lt;h2>&lt;strong>Humi&rsquo;s Frozen Samosa&lt;/strong>&lt;/h2>&lt;p>Crispy &amp; golden.&lt;/p>&lt;ul>&lt;li>One&lt;/li>&lt;li>Two&lt;/li>&lt;/ul>&lt;h2>&lt;br>&lt;/h2>";
    expect(htmlToText(html)).toBe('Humi’s Frozen Samosa Crispy & golden. One Two');
  });

  it('keeps inline tags from splitting words but separates block elements', () => {
    expect(htmlToText('<p>Hum<b>i</b></p><p>Next</p>')).toBe('Humi Next');
  });

  it.each([
    ['plain script', '<p>a</p><script>alert(1)</script><p>b</p>'],
    ['upper-case script', '<SCRIPT type="x">alert(1)</SCRIPT>ok'],
    ['entity-escaped script', '&lt;script>alert(1)&lt;/script>ok'],
    ['double-encoded script', '&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;ok'],
    ['script with > inside attribute-ish text', '<script>if (1 > 0) alert(1)</script>ok'],
    ['style block', '<style>body{display:none}alert(1)</style>ok'],
    ['html comment', 'ok<!-- alert(1) -->'],
    ['unterminated script', 'ok<script>alert(1)'],
    ['unterminated script close', 'ok<script>alert(1)</script'],
    ['unterminated tag', 'ok<img src=x onerror=alert(1)'],
    ['unterminated comment', 'ok<!-- alert(1)'],
  ])('drops script content: %s', (_label, html) => {
    const text = htmlToText(html);
    expect(text).not.toContain('alert');
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
    expect(text.startsWith('ok') || text.endsWith('ok') || text === 'a b').toBe(true);
  });

  it('never returns angle brackets, even for stray ones', () => {
    expect(htmlToText('5 < 6 and 7 > 3 <3 <>')).toBe('5 6 and 7 3 3');
  });

  it('collapses whitespace and strips control and bidi characters', () => {
    expect(htmlToText('a \n\t b\u0000c​d‮e  f')).toBe('a bcde f');
  });

  it('truncates at a word boundary with an ellipsis', () => {
    const text = htmlToText('word '.repeat(50), 40);
    expect(text.length).toBeLessThanOrEqual(40);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toMatch(/wor…$/);
  });

  it('hard-cuts when there is no usable space', () => {
    expect(htmlToText('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`);
  });

  it('returns an empty string for empty input', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText('<p></p>')).toBe('');
  });

  it.each([
    ['many open brackets', '<'.repeat(1_000_000)],
    ['many unterminated tags', '<a '.repeat(300_000)],
    ['many script openers', '<script>'.repeat(100_000)],
    ['many entities', '&amp;'.repeat(200_000)],
    ['many comment openers', '<!--'.repeat(200_000)],
  ])('is linear on hostile input: %s', (_label, input) => {
    const started = performance.now();
    htmlToText(input);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('collapseWhitespace and cleanLine', () => {
  it('trims and collapses', () => {
    expect(collapseWhitespace('  a \r\n b  ')).toBe('a b');
  });

  it('cleanLine caps length and removes controls', () => {
    expect(cleanLine('ab\u0007cdef', 4)).toBe('abcd');
  });
});

describe('escapeRegExp', () => {
  const specials = '.*+?^${}()|[]\\/-';

  it('makes every special character literal', () => {
    for (const ch of specials) {
      const re = new RegExp(`^${escapeRegExp(ch)}$`);
      expect(re.test(ch)).toBe(true);
    }
  });

  it('neutralises catastrophic-backtracking patterns', () => {
    const evil = '(a+)+$';
    const re = new RegExp(escapeRegExp(evil), 'i');
    const started = performance.now();
    expect(re.test('a'.repeat(5000) + '!')).toBe(false);
    expect(re.test(`x${evil}y`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('leaves plain text alone', () => {
    expect(escapeRegExp('samosa roll 2')).toBe('samosa roll 2');
  });
});

describe('toHttpsUrl', () => {
  it.each([
    ['http://api.humisfrozenfoods.com/uploads/images/a.png', 'https://api.humisfrozenfoods.com/uploads/images/a.png'],
    ['https://example.com/a.png?x=1', 'https://example.com/a.png?x=1'],
    ['  HTTPS://Example.com/a  ', 'https://example.com/a'],
  ])('accepts %s', (input, expected) => {
    expect(toHttpsUrl(input)).toBe(expected);
  });

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:image/png;base64,AAAA'],
    ['ftp', 'ftp://example.com/a'],
    ['file', 'file:///etc/passwd'],
    ['protocol-relative', '//example.com/a.png'],
    ['relative', '/uploads/a.png'],
    ['credentials', 'https://user:pw@example.com/a'],
    ['http with explicit port', 'http://example.com:8080/a'],
    ['empty', ''],
    ['whitespace', '   '],
    ['too long', `https://example.com/${'a'.repeat(2100)}`],
    ['garbage', 'not a url'],
    ['number', 42],
    ['null', null],
    ['object', { $ne: null }],
  ])('rejects %s', (_label, input) => {
    expect(toHttpsUrl(input)).toBeNull();
  });
});
