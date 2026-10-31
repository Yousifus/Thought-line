// Tests for counting margin notes per station by overlap of the note's range with the station's passage.
import type { NoteView, Station } from '../../src/core';
import { NO_NOTES, notesByStation } from '../../src/web/layout/notes';

const text = 'The sun gives. So we fly.';
const station = (id: string, passage: string): Station => ({ id, claim: id, passage, role: 'step', expressed: 0.5, grounding: 'example' });
const stations = [station('s1', 'The sun gives'), station('s2', 'So we fly')];
const stamp = '2026-10-31T00:00:00.000Z';
const note = (id: string, quote: string | null): NoteView => {
  const start = quote === null ? -1 : text.indexOf(quote);
  return {
    id, pieceId: 'p', author: 'yousef', body: 'b', createdAt: stamp,
    anchor: { quote: quote ?? 'gone', prefix: '', suffix: '', start: Math.max(0, start) },
    range: quote === null ? null : { start, end: start + quote.length },
  };
};

test('a note counts on the station whose passage it overlaps', () => {
  expect(notesByStation(text, stations, [note('n1', 'we fly')])).toEqual({ s2: 1 });
});

test('a note that touches two passages counts on both', () => {
  expect(notesByStation(text, stations, [note('n1', 'gives. So')])).toEqual({ s1: 1, s2: 1 });
});

test('several notes on one passage add up', () => {
  expect(notesByStation(text, stations, [note('n1', 'we'), note('n2', 'fly'), note('n3', 'So we fly')])).toEqual({ s2: 3 });
});

test('a note that only borders a passage does not count on it', () => {
  // "The sun gives" ends at index 13; the note starts at the full stop (13) and ends at 14: no shared character.
  expect(notesByStation(text, stations, [note('n1', '.')])).toEqual({});
});

test('a note whose passage is gone, and a station whose passage is not in the text, count nowhere', () => {
  const lost = [...stations, station('s3', 'Nowhere in this text')];
  expect(notesByStation(text, lost, [note('n1', null), note('n2', 'sun')])).toEqual({ s1: 1 });
});

test('no notes gives the shared empty object', () => {
  expect(notesByStation(text, stations, [])).toEqual({});
  expect(NO_NOTES).toEqual({});
});
