// Tests for note anchors: surviving edits, disambiguating repeated quotes, orphaned anchors.
import { makeAnchor, resolveAnchor } from '../../src/core/anchors';

const text = 'One. The sun is a gift. Two. The sun is a gift. Three.';

test('an anchor survives text inserted before it', () => {
  const a = makeAnchor(text, { start: 29, end: 47 });
  const edited = 'A new opening line here. ' + text;
  expect(resolveAnchor(edited, a)).toEqual({ start: 54, end: 72 });
});
test('prefix picks the right one of two identical quotes', () => {
  expect(resolveAnchor(text, makeAnchor(text, { start: 29, end: 47 }))).toEqual({ start: 29, end: 47 });
  expect(resolveAnchor(text, makeAnchor(text, { start: 5, end: 23 }))).toEqual({ start: 5, end: 23 });
});
test('a deleted passage resolves to null', () => {
  expect(resolveAnchor('One. Three.', makeAnchor(text, { start: 5, end: 23 }))).toBeNull();
});
test('prefix and suffix are capped at 32 characters', () => {
  const long = 'x'.repeat(100) + 'MID' + 'y'.repeat(100);
  const a = makeAnchor(long, { start: 100, end: 103 });
  expect(a.quote).toBe('MID');
  expect(a.prefix).toBe('x'.repeat(32));
  expect(a.suffix).toBe('y'.repeat(32));
  expect(a.start).toBe(100);
});
test('prefix and suffix are shorter at the edges of the text', () => {
  const a = makeAnchor('hello world', { start: 0, end: 5 });
  expect(a.prefix).toBe('');
  expect(a.suffix).toBe(' world');
});
test('suffix breaks a tie when the prefix agrees equally', () => {
  const t = 'a the sun rise. a the sun set.';
  const a = { quote: 'the sun', prefix: 'a ', suffix: ' set.', start: 2 };  // old start is nearer the first
  expect(resolveAnchor(t, a)).toEqual({ start: 18, end: 25 });
});
test('with no context difference the nearest to the old start wins', () => {
  const t = 'aa bb aa bb aa';
  const a = { quote: 'aa', prefix: '', suffix: '', start: 11 };
  expect(resolveAnchor(t, a)).toEqual({ start: 12, end: 14 });
});
test('an anchor on Arabic text survives diacritics being added', () => {
  const t = 'القمر يجذب المد';
  const a = makeAnchor(t, { start: 0, end: 5 });
  expect(resolveAnchor('القَمَرُ يجذب المد', a)).toEqual({ start: 0, end: 8 });
});
