const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  pound: '£',
  deg: '°',
  middot: '·',
};

const ENTITY = /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g;
const BLOCK_TAGS = new Set([
  'p', 'div', 'br', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'section', 'article', 'blockquote', 'pre', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const MAX_HTML_INPUT = 50_000;
const MAX_DECODE_PASSES = 3;

function decodeOnce(input: string): string {
  return input.replace(ENTITY, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' ';
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Decodes to a fixed point (bounded) so double-encoded markup such as `&amp;lt;script&amp;gt;` cannot hide from the tag stripper. */
export function decodeEntities(input: string): string {
  let current = input;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function tagName(source: string, start: number): string {
  let i = start;
  if (source[i] === '/') i += 1;
  let end = i;
  while (end < source.length && /[A-Za-z0-9]/.test(source[end] ?? '')) end += 1;
  return source.slice(i, end).toLowerCase();
}

/** Single linear pass: no regex backtracking, so hostile `<<<<` or unterminated tags cannot cost quadratic time. */
function stripTags(source: string): string {
  const lower = source.toLowerCase();
  let out = '';
  let i = 0;
  while (i < source.length) {
    const lt = source.indexOf('<', i);
    if (lt === -1) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, lt);
    const next = source[lt + 1] ?? '';
    if (!/[A-Za-z/!?]/.test(next)) {
      out += '<';
      i = lt + 1;
      continue;
    }
    if (source.startsWith('<!--', lt)) {
      const close = source.indexOf('-->', lt + 4);
      if (close === -1) break;
      i = close + 3;
      continue;
    }
    const gt = source.indexOf('>', lt + 1);
    if (gt === -1) break;
    const name = tagName(source, lt + 1);
    const closing = next === '/';
    i = gt + 1;
    if (!closing && RAW_TEXT_TAGS.has(name)) {
      const close = lower.indexOf(`</${name}`, i);
      if (close === -1) break;
      const closeGt = source.indexOf('>', close);
      if (closeGt === -1) break;
      i = closeGt + 1;
    }
    if (BLOCK_TAGS.has(name)) out += ' ';
  }
  return out;
}

export function collapseWhitespace(input: string): string {
  // Whitespace first (tabs/newlines are control characters too), then every remaining control/format character (bidi overrides, zero-width).
  return input.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
}

/** Admin-portal HTML (leading `<` entity-escaped) to safe plain text: decode, strip markup and script bodies, collapse whitespace. */
export function htmlToText(input: string, maxLength = 2000): string {
  const decoded = decodeEntities(input.slice(0, MAX_HTML_INPUT));
  // Any angle bracket left over is not markup we recognised; drop it rather than let a client render it.
  const safe = collapseWhitespace(stripTags(decoded).replace(/[<>]/g, ' '));
  if (safe.length <= maxLength) return safe;
  const cut = safe.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Plain single-line text field (names, units): control characters removed, whitespace collapsed, length-capped. */
export function cleanLine(input: string, maxLength: number): string {
  return collapseWhitespace(input).slice(0, maxLength).trim();
}

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\-]/g;

export function escapeRegExp(input: string): string {
  return input.replace(REGEXP_SPECIALS, '\\$&');
}

const MAX_URL_LENGTH = 2048;

/** https only: http is upgraded (unless it names a port, where we cannot know TLS is served), anything else is dropped. */
export function toHttpsUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username !== '' || url.password !== '') return null;
  if (url.protocol === 'http:') {
    if (url.port !== '') return null;
    url.protocol = 'https:';
  }
  return url.protocol === 'https:' ? url.href : null;
}
