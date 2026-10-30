// Finds quoted passages in a text (Arabic and English) and reports ranges into the ORIGINAL text.

/** Offsets are JavaScript string indexes (UTF-16 code units) into the original text. */
export interface Range { start: number; end: number }

interface Normalized {
  text: string;
  /** For each UTF-16 unit of `text`: where its source cluster starts and ends in the original. */
  starts: number[];
  ends: number[];
}

const MARK = /^\p{M}$/u;
const WHITESPACE = /^\s$/u;

function isDropped(ch: string): boolean {
  const c = ch.codePointAt(0)!;
  return (c >= 0x064b && c <= 0x065f) || c === 0x0670 || c === 0x0640; // Arabic diacritics, dagger alef, tatweel
}

function foldChar(ch: string): string {
  switch (ch) {
    case 'أ': case 'إ': case 'آ': return 'ا'; // أ إ آ -> ا
    case 'ى': return 'ي';                               // ى -> ي
    default: return ch;
  }
}

/**
 * Normalizes while remembering, for every output unit, which slice of the original it came from.
 * NFC is applied per cluster (a base character plus its combining marks), not to the whole string, so
 * every output unit traces to a known original slice even when composition changes the length.
 */
function buildNormalized(s: string): Normalized {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let lastWasSpace = false;
  let i = 0;
  while (i < s.length) {
    const first = s.codePointAt(i)!;
    let j = i + (first > 0xffff ? 2 : 1);
    while (j < s.length) {
      const cp = s.codePointAt(j)!;
      const len = cp > 0xffff ? 2 : 1;
      if (!MARK.test(s.slice(j, j + len))) break;
      j += len;
    }
    for (const raw of s.slice(i, j).normalize('NFC')) {
      if (isDropped(raw)) continue;
      const ch = foldChar(raw).toLowerCase();
      if (WHITESPACE.test(ch)) {
        if (lastWasSpace) { ends[ends.length - 1] = j; continue; }
        text += ' ';
        starts.push(i);
        ends.push(j);
        lastWasSpace = true;
        continue;
      }
      lastWasSpace = false;
      for (let k = 0; k < ch.length; k++) { starts.push(i); ends.push(j); }
      text += ch;
    }
    i = j;
  }
  return { text, starts, ends };
}

export function normalizeForMatch(s: string): string {
  return buildNormalized(s).text;
}

export function findAllPassages(text: string, passage: string): Range[] {
  const needle = normalizeForMatch(passage).trim();
  if (needle === '') return [];
  const hay = buildNormalized(text);
  const out: Range[] = [];
  let from = 0;
  for (;;) {
    const at = hay.text.indexOf(needle, from);
    if (at < 0) break;
    const last = at + needle.length - 1;
    out.push({ start: hay.starts[at], end: hay.ends[last] });
    from = at + needle.length;
  }
  return out;
}

export function findPassage(text: string, passage: string): Range | null {
  return findAllPassages(text, passage)[0] ?? null;
}

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/u;
const LETTER = /\p{L}/u;

/** Direction of the first strong character; text with none (including '') is 'ltr'. */
export function textDirection(s: string): 'rtl' | 'ltr' {
  for (const ch of s) {
    if (RTL_CHAR.test(ch) && LETTER.test(ch)) return 'rtl';
    if (LETTER.test(ch)) return 'ltr';
  }
  return 'ltr';
}
