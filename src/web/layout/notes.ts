// Margin-note helpers: the one shared "no notes" value, and how many notes sit on each station's passage.
import { findPassage } from '../../core';
import type { NoteView, Station } from '../../core';

/** One empty count map, so components that default to "no notes" keep a stable identity. */
export const NO_NOTES: Record<string, number> = {};

/**
 * Notes per station id, counting a note on every station whose passage it overlaps (sharing at least one character).
 * `text` is the text the notes' ranges were measured against. Stations with no notes are left out.
 */
export function notesByStation(text: string, stations: Station[], notes: NoteView[]): Record<string, number> {
  const placed = notes.flatMap(n => (n.range ? [n.range] : []));
  if (placed.length === 0) return NO_NOTES;
  const counts: Record<string, number> = {};
  for (const s of stations) {
    const p = findPassage(text, s.passage);
    if (!p) continue;
    const n = placed.filter(r => r.start < p.end && p.start < r.end).length;
    if (n > 0) counts[s.id] = n;
  }
  return counts;
}
