// Note anchors: a quote plus surrounding context, so a margin note finds its passage again after edits.
import { findAllPassages, type Range } from './text';

export interface Anchor { quote: string; prefix: string; suffix: string; start: number }

const CONTEXT = 32;

export function makeAnchor(text: string, range: Range): Anchor {
  return {
    quote: text.slice(range.start, range.end),
    prefix: text.slice(Math.max(0, range.start - CONTEXT), range.start),
    suffix: text.slice(range.end, range.end + CONTEXT),
    start: range.start,
  };
}

function agreeBackward(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function agreeForward(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

export function resolveAnchor(text: string, anchor: Anchor): Range | null {
  const matches = findAllPassages(text, anchor.quote);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  let best = matches[0];
  let bestScore = -1;
  let bestDistance = Infinity;
  for (const m of matches) {
    const score =
      agreeBackward(anchor.prefix, text.slice(Math.max(0, m.start - CONTEXT), m.start)) +
      agreeForward(anchor.suffix, text.slice(m.end, m.end + CONTEXT));
    const distance = Math.abs(m.start - anchor.start);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = m; bestScore = score; bestDistance = distance;
    }
  }
  return best;
}
