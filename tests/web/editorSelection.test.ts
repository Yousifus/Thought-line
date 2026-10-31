// @vitest-environment jsdom
// Tests for the rule that a passage is selected in the editor only while the editor shows exactly the analysed text.
import { planSelection, revealRange } from '../../src/web/editorSelection';

const text = 'First sentence. The passage to find. Last sentence.';
const range = { start: 16, end: 36 };

describe('planSelection', () => {
  test('selects when the editor shows exactly the analysed text', () => {
    expect(planSelection(text, text, range)).toEqual({ kind: 'select', range });
  });
  test('is stale when the editor text differs, even by one character', () => {
    expect(planSelection(text, `${text} `, range)).toEqual({ kind: 'stale' });
    expect(planSelection(text, 'something else', range)).toEqual({ kind: 'stale' });
  });
  test('does nothing when the passage has no range', () => {
    expect(planSelection(text, text, null)).toEqual({ kind: 'none' });
    expect(planSelection(text, 'different', null)).toEqual({ kind: 'none' });
  });
});

describe('revealRange', () => {
  const box = (value: string) => {
    const ta = document.createElement('textarea');
    ta.value = value;
    document.body.appendChild(ta);
    return ta;
  };
  afterEach(() => { document.body.innerHTML = ''; });

  test('selects the range, focuses the box and leaves the text alone', () => {
    const ta = box(text);
    revealRange(ta, range);
    expect(ta.value).toBe(text);
    expect(ta.selectionStart).toBe(16);
    expect(ta.selectionEnd).toBe(36);
    expect(document.activeElement).toBe(ta);
  });

  test('scrolls a passage that is further down into view, a third of the way from the top', () => {
    const ta = box(text);
    // jsdom has no layout: say the box is 300 tall, and that the text before the passage is 900 tall.
    Object.defineProperty(ta, 'clientHeight', { value: 300 });
    Object.defineProperty(ta, 'scrollHeight', { get: () => (ta.value.length === text.length ? 2000 : 900) });
    revealRange(ta, range);
    expect(ta.scrollTop).toBe(800);
    expect(ta.value).toBe(text);
    expect(ta.selectionStart).toBe(16);
  });

  test('does not scroll a passage that is within the first screenful', () => {
    const ta = box(text);
    Object.defineProperty(ta, 'clientHeight', { value: 300 });
    Object.defineProperty(ta, 'scrollHeight', { get: () => (ta.value.length === text.length ? 2000 : 120) });
    revealRange(ta, range);
    expect(ta.scrollTop).toBe(0);
  });
});
