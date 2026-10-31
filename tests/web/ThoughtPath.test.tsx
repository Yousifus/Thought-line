// @vitest-environment jsdom
// Render tests for the Thought path, the notes margin and the Thought pane: nodes, returns, terminus, clicking, Arabic, passage gone.
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { deriveStructure, findJumps, findPassage } from '../../src/core';
import type { Analysis, MotifMention, NoteView, PieceView } from '../../src/core';
import { NotesMargin } from '../../src/web/components/NotesMargin';
import { ThoughtPane } from '../../src/web/components/ThoughtPane';
import { ThoughtPath } from '../../src/web/components/ThoughtPath';
import { STALE_NOTE } from '../../src/web/editorSelection';

const text = readFileSync('tests/fixtures/sample-piece.txt', 'utf8');
const base = JSON.parse(readFileSync('tests/fixtures/sample-analysis.json', 'utf8')) as Omit<Analysis, 'model' | 'createdAt'>;
const stamp = '2026-10-31T00:00:00.000Z';
const sample: Analysis = { ...base, model: 'fake', createdAt: stamp };

function viewOf(analysis: Analysis, over: Partial<PieceView> = {}, id = 'v1'): PieceView {
  return {
    piece: { id: 'p', title: 'T', privacy: 'private', text, createdAt: stamp, updatedAt: stamp },
    version: { id, pieceId: 'p', savedAt: stamp, text, analysis },
    structure: deriveStructure(analysis),
    jumps: findJumps(analysis),
    notes: [],
    ...over,
  };
}
const withMotifs = (motifs: MotifMention[]): Analysis => ({ ...sample, motifs });
const mention = (motif: string, passage: string, order: number, label = motif): MotifMention => ({ motif, label, passage, order });
const node = (name: RegExp) => screen.getByRole('button', { name });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ThoughtPath', () => {
  test('draws one node per image, in order of first appearance, with the same image in two languages as one node', () => {
    render(<ThoughtPath view={viewOf(sample)} onSelectRange={() => {}} />);
    const names = screen.getAllByRole('button').map(b => b.getAttribute('aria-label'));
    // moon, sea, tide, harbour, wave: five images from eight mentions.
    expect(names).toHaveLength(5);
    expect(names[0]).toMatch(/^moon/);
    expect(names[3]).toMatch(/^harbour/);
    // An image first met in Arabic is labelled with the Arabic word.
    expect(names[4]).toMatch(/^الأمواج/);
    expect(node(/^moon/).getAttribute('aria-label')).toContain('2 mentions');
  });

  test('forward steps form one line, returns are arcs, and the end is a terminus', () => {
    const analysis = withMotifs([
      mention('sun', 'The moon pulls on the sea', 0),
      mention('wings', 'pulls on the sea', 1),
      mention('sun', 'lifts the tide', 2),
      mention('star', 'tide tables', 3),
    ]);
    const { container } = render(<ThoughtPath view={viewOf(analysis)} onSelectRange={() => {}} />);
    expect(container.querySelectorAll('path.return-arc')).toHaveLength(1);
    expect(container.querySelectorAll('line.forward-line')).toHaveLength(1);
    expect(container.querySelectorAll('.terminus')).toHaveLength(1);
    expect(node(/^star/).getAttribute('aria-label')).toContain('Where the piece ends');
    expect(node(/^sun/).getAttribute('aria-label')).not.toContain('Where the piece ends');
  });

  test('clicking an image selects the passage of its first mention', () => {
    const onSelectRange = vi.fn();
    render(<ThoughtPath view={viewOf(sample)} onSelectRange={onSelectRange} />);
    fireEvent.click(node(/^tide/));
    expect(onSelectRange).toHaveBeenCalledWith(findPassage(text, 'lifts the tide'));
    // The moon appears again later; its first mention is the English one.
    fireEvent.click(node(/^moon/));
    expect(onSelectRange).toHaveBeenLastCalledWith(findPassage(text, 'The moon pulls on the sea'));
  });

  test('an image is a keyboard control, and a mention not found in the text sends null', () => {
    const onSelectRange = vi.fn();
    const analysis = withMotifs([{ ...mention('sun', 'nowhere in the text', 0), unanchored: true }, mention('sea', 'pulls on the sea', 1)]);
    render(<ThoughtPath view={viewOf(analysis)} onSelectRange={onSelectRange} />);
    const sun = node(/^sun/);
    expect(sun.getAttribute('tabindex')).toBe('0');
    expect(sun.getAttribute('aria-label')).toContain('Not found in the text');
    fireEvent.keyDown(sun, { key: 'Enter' });
    fireEvent.keyDown(sun, { key: ' ' });
    fireEvent.keyDown(sun, { key: 'x' });
    expect(onSelectRange).toHaveBeenCalledTimes(2);
    expect(onSelectRange).toHaveBeenCalledWith(null);
  });

  test('the chosen image is marked with aria-current, and the mark clears when another version is shown', () => {
    const view = viewOf(sample);
    const { rerender } = render(<ThoughtPath view={view} onSelectRange={() => {}} />);
    expect(node(/^moon/).getAttribute('aria-current')).toBeNull();
    fireEvent.click(node(/^moon/));
    expect(node(/^moon/).getAttribute('aria-current')).toBe('true');
    expect(node(/^moon/).hasAttribute('aria-pressed')).toBe(false);
    rerender(<ThoughtPath view={viewOf(sample, {}, 'v2')} onSelectRange={() => {}} />);
    expect(node(/^moon/).getAttribute('aria-current')).toBeNull();
  });

  test('Arabic labels are set right to left, English left to right', () => {
    const analysis = withMotifs([mention('moon', 'ويظهر القمر شاحبا', 0, 'القمر'), mention('sea', 'pulls on the sea', 1)]);
    const { container } = render(<ThoughtPath view={viewOf(analysis)} onSelectRange={() => {}} />);
    const labels = [...container.querySelectorAll('text.node-label')];
    expect(labels.find(l => l.textContent === 'القمر')!.getAttribute('direction')).toBe('rtl');
    expect(labels.find(l => l.textContent === 'sea')!.getAttribute('direction')).toBe('ltr');
  });

  test('says so when the model found no images, and when there is no analysis', () => {
    const { rerender } = render(<ThoughtPath view={viewOf(withMotifs([]))} onSelectRange={() => {}} />);
    expect(screen.getByText('The model found no images in this piece.')).toBeTruthy();
    rerender(<ThoughtPath view={{ ...viewOf(sample), version: null, structure: null, jumps: [] }} onSelectRange={() => {}} />);
    expect(screen.getByText(/Not analysed yet/)).toBeTruthy();
  });
});

describe('ThoughtPane', () => {
  test('selects in the editor only while it shows the analysed text, and otherwise says why', () => {
    const onReveal = vi.fn();
    const view = viewOf(sample);
    const { rerender } = render(<ThoughtPane view={view} editorText={text} onReveal={onReveal} />);
    fireEvent.click(node(/^tide/));
    expect(onReveal).toHaveBeenCalledWith(findPassage(text, 'lifts the tide'));
    expect(screen.queryByText(STALE_NOTE)).toBeNull();

    onReveal.mockClear();
    rerender(<ThoughtPane view={view} editorText={`${text} More.`} onReveal={onReveal} />);
    fireEvent.click(node(/^tide/));
    expect(onReveal).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe(STALE_NOTE);
    rerender(<ThoughtPane view={view} editorText={text} onReveal={onReveal} />);
    expect(screen.queryByText(STALE_NOTE)).toBeNull();
  });

  test('keeps the existing messages when there is no analysis', () => {
    const { rerender } = render(<ThoughtPane view={null} />);
    expect(screen.getByRole('tabpanel', { name: 'Thought' }).textContent).toContain('Choose or create a piece');
    rerender(<ThoughtPane view={{ ...viewOf(sample), version: null, structure: null, jumps: [] }} />);
    expect(screen.getByRole('tabpanel', { name: 'Thought' }).textContent).toContain('Not analysed yet');
  });
});

describe('NotesMargin', () => {
  const note = (id: string, author: string, body: string, quote: string, createdAt: string, gone = false): NoteView => {
    const start = text.indexOf(quote);
    return {
      id, pieceId: 'p', author, body, createdAt,
      anchor: { quote, prefix: '', suffix: '', start: Math.max(0, start) },
      range: gone ? null : { start, end: start + quote.length },
    };
  };

  test('lists each note with its author, body and quote, newest last', () => {
    const notes = [
      note('n2', 'claude-test', 'Second.', 'tide tables', '2026-10-31T02:00:00.000Z'),
      note('n1', 'yousef', 'First.', 'The moon pulls on the sea', '2026-10-31T01:00:00.000Z'),
    ];
    render(<NotesMargin notes={notes} onSelectRange={() => {}} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('yousef');
    expect(items[0].textContent).toContain('First.');
    expect(items[1].textContent).toContain('claude-test');
    const quote = items[1].querySelector('blockquote')!;
    expect(quote.textContent).toBe('tide tables');
    expect(quote.getAttribute('dir')).toBe('auto');
  });

  test('clicking a note selects its range; a note with no passage says so and selects nothing', () => {
    const onSelectRange = vi.fn();
    const live = note('n1', 'yousef', 'Live.', 'tide tables', '2026-10-31T01:00:00.000Z');
    const lost = note('n2', 'claude-test', 'Lost.', 'a passage that was deleted', '2026-10-31T02:00:00.000Z', true);
    render(<NotesMargin notes={[live, lost]} onSelectRange={onSelectRange} />);
    expect(screen.getAllByText('Passage gone')).toHaveLength(1);
    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).not.toContain('Passage gone');
    fireEvent.click(screen.getByRole('button', { name: /Show .* in the text/ }));
    expect(onSelectRange).toHaveBeenCalledTimes(1);
    expect(onSelectRange).toHaveBeenCalledWith(live.range);
    fireEvent.click(items[1]);
    expect(onSelectRange).toHaveBeenCalledTimes(1);
  });

  test('an Arabic quote and body are set right to left by dir="auto"', () => {
    const arabic = 'عند الفجر يهدأ الميناء';
    render(<NotesMargin notes={[note('n1', 'yousef', 'ملاحظة', arabic, stamp)]} onSelectRange={() => {}} />);
    expect(screen.getByText(arabic).getAttribute('dir')).toBe('auto');
    expect(screen.getByText('ملاحظة').getAttribute('dir')).toBe('auto');
  });

  test('says so when there are no notes', () => {
    render(<NotesMargin notes={[]} onSelectRange={() => {}} />);
    expect(screen.getByText(/No notes yet/)).toBeTruthy();
  });
});
