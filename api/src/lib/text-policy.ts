/*
 * Shared invisible-character policy for free text.
 *
 * Rejected everywhere: control (Cc, except newline where the caller allows it), format (Cf: zero-width,
 * bidi overrides/isolates, BOM, soft hyphen, tag characters), line/paragraph separators, surrogates,
 * private-use characters, and variation selectors that do not directly follow an emoji.
 *
 * Emoji are the one exception. A valid emoji sequence is removed from the text before the check, so the
 * ZWJ (U+200D), variation selectors (U+FE0E/FE0F), skin-tone modifiers and tag characters it contains are
 * allowed only inside the sequence. Anything left over after removal is judged by the strict rules, so a
 * ZWJ between letters, a trailing ZWJ or a selector after a letter is still refused.
 */
const ELEMENT =
  '(?:\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?\\p{Emoji_Modifier}?|\\p{Emoji_Modifier}|[0-9#*]\\uFE0F?\\u20E3|\\p{Regional_Indicator}{2})';
const TAG_SEQUENCE = '\\u{1F3F4}[\\u{E0020}-\\u{E007E}]{2,8}\\u{E007F}';

/** One emoji, no ZWJ chains and no tag sequences: what names may contain. */
const SINGLE_EMOJI = new RegExp(ELEMENT, 'gu');
/** An emoji or a ZWJ sequence of at most eight elements. */
const EMOJI_SEQUENCE = new RegExp(`${TAG_SEQUENCE}|${ELEMENT}(?:\\u200D${ELEMENT}){0,7}`, 'gu');

const FORBIDDEN_STRICT = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}︀-️\u{E0100}-\u{E01EF}]/u;
const FORBIDDEN_KEEP_NEWLINE = /[^\P{Cc}\n]|[\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}︀-️\u{E0100}-\u{E01EF}]/u;

export interface TextPolicyOptions {
  /** Permit ZWJ emoji sequences (messages, notes). Names stay strict. */
  zwjEmoji?: boolean;
  /** Permit "\n" (multi-line messages). */
  newlines?: boolean;
}

/** True when `value` contains a character the policy refuses. */
export function hasForbiddenText(value: string, options: TextPolicyOptions = {}): boolean {
  const stripped = value.replace(options.zwjEmoji ? EMOJI_SEQUENCE : SINGLE_EMOJI, '');
  return (options.newlines ? FORBIDDEN_KEEP_NEWLINE : FORBIDDEN_STRICT).test(stripped);
}
