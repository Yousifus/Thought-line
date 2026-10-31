// Tests for the Thought path layout: nodes by first appearance, forward steps and returns, one node per image across languages.
import type { MotifMention } from '../../src/core';
import { layoutThought } from '../../src/web/layout/thoughtLayout';

const mentions = (motifs: string[]): MotifMention[] => motifs.map((motif, order) => ({ motif, label: motif, passage: motif, order }));

test('returns to an earlier image are returns', () => {
  expect(layoutThought(mentions(['sun', 'wings', 'sun', 'star']))).toEqual({
    nodes: [
      { motif: 'sun', label: 'sun', index: 0, mentions: 2 },
      { motif: 'wings', label: 'wings', index: 1, mentions: 1 },
      { motif: 'star', label: 'star', index: 2, mentions: 1 },
    ],
    steps: [
      { from: 'sun', to: 'wings', kind: 'forward' },
      { from: 'wings', to: 'sun', kind: 'return' },
      { from: 'sun', to: 'star', kind: 'forward' },
    ],
    endMotif: 'star',
  });
});

test('the same image in two languages is one node, labelled by its first mention', () => {
  const r = layoutThought([
    { motif: 'moon', label: 'moon', passage: 'moon', order: 0 },
    { motif: 'moon', label: 'القمر', passage: 'القمر', order: 1 },
  ]);
  expect(r.nodes).toEqual([{ motif: 'moon', label: 'moon', index: 0, mentions: 2 }]);
  expect(r.steps).toEqual([]);
});

test('a mention that repeats the one before it makes no step but still counts', () => {
  const r = layoutThought(mentions(['sea', 'sea', 'sea', 'sky']));
  expect(r.nodes.map(n => [n.motif, n.mentions])).toEqual([['sea', 3], ['sky', 1]]);
  expect(r.steps).toEqual([{ from: 'sea', to: 'sky', kind: 'forward' }]);
});

test('mentions are walked in their order, not the order of the array', () => {
  const m: MotifMention[] = [
    { motif: 'b', label: 'b', passage: 'b', order: 1 },
    { motif: 'a', label: 'Alif', passage: 'a', order: 0 },
  ];
  const r = layoutThought(m);
  expect(r.nodes.map(n => n.motif)).toEqual(['a', 'b']);
  expect(r.nodes[0].label).toBe('Alif');
  expect(r.endMotif).toBe('b');
  expect(m[0].motif).toBe('b'); // the input is left as it was
});

test('the walk may end on an image it has been to before', () => {
  const r = layoutThought(mentions(['a', 'b', 'a']));
  expect(r.endMotif).toBe('a');
  expect(r.steps.at(-1)).toEqual({ from: 'b', to: 'a', kind: 'return' });
});

test('no mentions: no nodes, no steps, no end', () => {
  expect(layoutThought([])).toEqual({ nodes: [], steps: [], endMotif: null });
});
