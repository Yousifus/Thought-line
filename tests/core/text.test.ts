// Tests for passage matching: whitespace, Arabic normalization, offset mapping, direction.
import { findAllPassages, findPassage, normalizeForMatch, textDirection } from '../../src/core/text';

test('finds a passage across different whitespace', () => {
  expect(findPassage('the  sun\n gifted wings', 'the sun gifted')).toEqual({ start: 0, end: 16 });
});
test('finds Arabic despite diacritics in the text', () => {
  expect(findPassage('القَمَرُ يجذب المدّ', 'القمر يجذب')?.start).toBe(0);
});
test('the range of a diacritic-bearing match covers the trailing diacritic', () => {
  const text = 'القَمَرُ يجذب المدّ';
  const r = findPassage(text, 'القمر');
  expect(r).toEqual({ start: 0, end: 8 });
  expect(text.slice(r!.start, r!.end)).toBe('القَمَرُ');
});
test('finds Arabic despite different alef forms', () => {
  expect(findPassage('عن الإسلام والأخلاق', 'الاسلام والاخلاق')).not.toBeNull();
});
test('alef maqsura and ya, tatweel are folded', () => {
  expect(findPassage('إلى الحياة', 'الي الحياة')).not.toBeNull();
  expect(findPassage('الشـــمس', 'الشمس')).toEqual({ start: 0, end: 8 });
});
test('missing passage is null', () => { expect(findPassage('a b c', 'd')).toBeNull(); });
test('matching ignores case', () => {
  expect(findPassage('The Sun', 'the sun')).toEqual({ start: 0, end: 7 });
});
test('surrounding whitespace in the passage is ignored', () => {
  expect(findPassage('a quiet moon', '  quiet moon \n')).toEqual({ start: 2, end: 12 });
});
test('empty or whitespace-only passage matches nothing', () => {
  expect(findPassage('abc', '')).toBeNull();
  expect(findAllPassages('abc', '   ')).toEqual([]);
});
test('offsets stay correct after a combining mark earlier in the text', () => {
  const text = 'é the sun';            // NFC would shrink the first two units to one
  expect(findPassage(text, 'the sun')).toEqual({ start: 3, end: 10 });
});
test('offsets stay correct after a length-changing lowercase mapping', () => {
  const text = 'İx the sun';             // 'İ'.toLowerCase() is two units
  expect(findPassage(text, 'the sun')).toEqual({ start: 3, end: 10 });
});
test('offsets stay correct after Arabic diacritics earlier in the text', () => {
  const text = 'القَمَرُ the sun';
  const r = findPassage(text, 'the sun');
  expect(text.slice(r!.start, r!.end)).toBe('the sun');
});
test('a composed passage matches decomposed text and the range covers both units', () => {
  expect(findPassage('café au lait', 'café')).toEqual({ start: 0, end: 5 });
  expect(findPassage('café au lait', 'café')).toEqual({ start: 0, end: 4 });
});
test('findAllPassages returns every non-overlapping match in order', () => {
  expect(findAllPassages('ab ab  ab', 'ab')).toEqual([
    { start: 0, end: 2 }, { start: 3, end: 5 }, { start: 7, end: 9 },
  ]);
});
test('normalizeForMatch folds as specified', () => {
  expect(normalizeForMatch('  The \n\t SUN ')).toBe(' the sun ');
  expect(normalizeForMatch('أإآى')).toBe('اااي');
  expect(normalizeForMatch('مُحَمَّد')).toBe('محمد');
});
test('direction', () => {
  expect(textDirection('القمر')).toBe('rtl');
  expect(textDirection('moon القمر')).toBe('ltr');
  expect(textDirection('')).toBe('ltr');
});
test('direction skips leading digits, spaces and punctuation', () => {
  expect(textDirection('  1. «القمر»')).toBe('rtl');
  expect(textDirection('... 42')).toBe('ltr');
});
