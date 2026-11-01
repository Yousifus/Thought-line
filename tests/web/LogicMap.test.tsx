// @vitest-environment jsdom
// Render tests for the Logic map and its pane: jump badge, flags that do not rely on colour, Arabic labels, clicking and keys,
// and the rule that a passage is selected in the editor only while the editor shows the analysed text.
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { deriveStructure, findJumps, findPassage } from '../../src/core';
import type { Analysis, Jump, PieceView, Station } from '../../src/core';
import { LogicMap, dotRadius, linkWidth } from '../../src/web/components/LogicMap';
import { LogicPane } from '../../src/web/components/LogicPane';
import { STALE_NOTE } from '../../src/web/editorSelection';

const text = readFileSync('tests/fixtures/sample-piece.txt', 'utf8');
const base = JSON.parse(readFileSync('tests/fixtures/sample-analysis.json', 'utf8')) as Omit<Analysis, 'model' | 'createdAt'>;
const stamp = '2026-10-31T00:00:00.000Z';

function viewOf(analysis: Analysis, over: Partial<PieceView> = {}, versionText = text): PieceView {
  return {
    piece: { id: 'p', title: 'T', privacy: 'private', text: versionText, createdAt: stamp, updatedAt: stamp },
    version: { id: 'v1', pieceId: 'p', savedAt: stamp, text: versionText, analysis },
    structure: deriveStructure(analysis),
    jumps: findJumps(analysis),
    notes: [],
    ...over,
  };
}
const sample: Analysis = { ...base, model: 'fake', createdAt: stamp };
const withStations = (fn: (s: Station) => Station): Analysis => ({ ...sample, stations: sample.stations.map(fn) });
const station = (name: RegExp) => screen.getByRole('button', { name });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('the jump badge reads "+0.35 over"', () => {
  const jump: Jump = { stationId: 's3', expressed: 0.97, support: 0.47, excess: 0.35 };
  render(<LogicMap view={viewOf(sample, { jumps: [jump] })} noteCounts={{}} onSelectRange={() => {}} />);
  expect(screen.getByText('+0.35 over')).toBeTruthy();
  expect(station(/moon rules/).getAttribute('aria-label')).toContain('0.35 over');
});

test('the jump the rules find in the fixture is badged with its own excess, and its incoming link is dashed', () => {
  const jumps = findJumps(sample);
  expect(jumps.map(j => j.stationId)).toEqual(['s3']);
  const { container } = render(<LogicMap view={viewOf(sample)} noteCounts={{}} onSelectRange={() => {}} />);
  expect(screen.getByText(`+${jumps[0].excess.toFixed(2)} over`)).toBeTruthy();
  // The link s2 -> s3 is the only one into the jump.
  expect(container.querySelectorAll('path.link.into-jump')).toHaveLength(1);
  expect(container.querySelectorAll('path.link')).toHaveLength(2);
});

test('clicking a station selects its passage in the analysed text', () => {
  const onSelectRange = vi.fn();
  render(<LogicMap view={viewOf(sample)} noteCounts={{}} onSelectRange={onSelectRange} />);
  fireEvent.click(station(/moon rules every living thing/));
  const expected = findPassage(text, sample.stations[2].passage);
  expect(expected).not.toBeNull();
  expect(onSelectRange).toHaveBeenCalledTimes(1);
  expect(onSelectRange).toHaveBeenCalledWith(expected);
  expect(text.slice(expected!.start, expected!.end)).toBe(sample.stations[2].passage);
});

test('a station is a keyboard control: focusable, Enter and Space select it', () => {
  const onSelectRange = vi.fn();
  render(<LogicMap view={viewOf(sample)} noteCounts={{}} onSelectRange={onSelectRange} />);
  const s1 = station(/pull on the sea raises the tide/);
  expect(s1.getAttribute('tabindex')).toBe('0');
  fireEvent.keyDown(s1, { key: 'Enter' });
  fireEvent.keyDown(s1, { key: ' ' });
  fireEvent.keyDown(s1, { key: 'a' });
  expect(onSelectRange).toHaveBeenCalledTimes(2);
  expect(onSelectRange).toHaveBeenLastCalledWith(findPassage(text, sample.stations[0].passage));
});

test('a station whose passage was not found is titled and sends null', () => {
  const analysis = withStations(s => (s.id === 's4' ? { ...s, passage: 'A sentence that is nowhere in the piece', unanchored: true } : s));
  const onSelectRange = vi.fn();
  const { container } = render(<LogicMap view={viewOf(analysis)} noteCounts={{}} onSelectRange={onSelectRange} />);
  const titles = [...container.querySelectorAll('title')].map(t => t.textContent);
  expect(titles.filter(t => t === 'Not found in the text')).toHaveLength(1);
  expect(container.querySelectorAll('.ring-unanchored')).toHaveLength(1);
  const s4 = station(/sea may remember/);
  expect(s4.getAttribute('aria-label')).toContain('Not found in the text');
  fireEvent.click(s4);
  expect(onSelectRange).toHaveBeenCalledWith(null);
});

test('flags are drawn as shapes: interchange ring, dead-end bar and hollow dot, loop arcs', () => {
  const analysis: Analysis = {
    ...sample,
    stations: [
      { id: 'a', claim: 'First', passage: 'The moon pulls on the sea', role: 'premise', expressed: 0.8, grounding: 'evidence' },
      { id: 'b', claim: 'Second', passage: 'pulls on the sea', role: 'step', expressed: 0.6, grounding: 'example' },
      { id: 'c', claim: 'Third', passage: 'lifts the tide', role: 'step', expressed: 0.6, grounding: 'example' },
      { id: 'd', claim: 'Fourth', passage: 'tide tables', role: 'premise', expressed: 0.5, grounding: 'example' },
    ],
    links: [
      { from: 'a', to: 'b', required: true }, { from: 'b', to: 'c', required: true }, { from: 'c', to: 'b', required: false }, { from: 'a', to: 'd', required: false },
    ],
  };
  const { container } = render(<LogicMap view={viewOf(analysis)} noteCounts={{}} onSelectRange={() => {}} />);
  // a has two outgoing links and b has two incoming: both are interchanges.
  expect(container.querySelectorAll('.ring-outer')).toHaveLength(2);
  expect(station(/First/).getAttribute('aria-label')).toContain('Interchange');
  // d has no outgoing link: a dead end, hollow, with an end bar. c and b loop; the two links between them are arcs.
  expect(station(/Fourth/).getAttribute('aria-label')).toContain('Dead end');
  expect(container.querySelectorAll('.end-bar')).toHaveLength(1);
  expect(container.querySelectorAll('circle.dot.hollow')).toHaveLength(1);
  expect(container.querySelectorAll('path.link.in-loop')).toHaveLength(2);
  expect(station(/Third/).getAttribute('aria-label')).toContain('In a loop');
});

test('required supports are thick and optional supports thin, as classes', () => {
  const analysis: Analysis = { ...sample, links: [{ from: 's1', to: 's3', required: true }, { from: 's2', to: 's3', required: false }] };
  const { container } = render(<LogicMap view={viewOf(analysis)} noteCounts={{}} onSelectRange={() => {}} />);
  expect(container.querySelectorAll('path.link.required')).toHaveLength(1);
  expect(container.querySelectorAll('path.link.optional')).toHaveLength(1);
});

test('Arabic labels are set right to left, English left to right', () => {
  const analysis = withStations(s => (s.id === 's4' ? { ...s, claim: 'أظن أن البحر يتذكر العواصف' } : s));
  const { container } = render(<LogicMap view={viewOf(analysis)} noteCounts={{}} onSelectRange={() => {}} />);
  const labels = [...container.querySelectorAll('text.label')];
  expect(labels).toHaveLength(4);
  const arabic = labels.find(l => l.textContent?.includes('البحر'))!;
  expect(arabic.getAttribute('direction')).toBe('rtl');
  expect(arabic.getAttribute('text-anchor')).toBe('start');
  const english = labels.find(l => l.textContent?.includes('moon'))!;
  expect(english.getAttribute('direction')).toBe('ltr');
  // The Arabic label hangs from the right edge of its box, the English one from the left.
  const x = (el: Element) => Number(el.querySelector('tspan')!.getAttribute('x'));
  expect(x(arabic)).toBeGreaterThan(0);
  expect(x(english)).toBeLessThan(0);
});

test('long claims are cut in the label; the full claim is in the aria-label and the tooltip', () => {
  const long = 'The harbour fishermen already plan their work around the moon and the tide tables every single morning';
  const analysis = withStations(s => (s.id === 's2' ? { ...s, claim: long } : s));
  const { container } = render(<LogicMap view={viewOf(analysis)} noteCounts={{}} onSelectRange={() => {}} />);
  const s2 = station(/harbour fishermen/);
  expect(s2.getAttribute('aria-label')).toContain(long);
  expect(s2.querySelector('title')!.textContent).toBe(long);
  const label = [...container.querySelectorAll('text.label')].find(l => l.textContent?.includes('harbour'))!;
  expect(label.querySelectorAll('tspan').length).toBeLessThanOrEqual(3);
  expect(label.textContent!.endsWith('…')).toBe(true);
});

test('a station with notes shows a count badge', () => {
  render(<LogicMap view={viewOf(sample)} noteCounts={{ s1: 2, s2: 1 }} onSelectRange={() => {}} />);
  expect(screen.getByText('2 notes')).toBeTruthy();
  expect(screen.getByText('1 note')).toBeTruthy();
  expect(station(/pull on the sea raises/).getAttribute('aria-label')).toContain('2 notes');
});

test('the SVG scales to the pane through its viewBox', () => {
  const { container } = render(<LogicMap view={viewOf(sample)} noteCounts={{}} onSelectRange={() => {}} />);
  const svg = container.querySelector('svg.logic-svg')!;
  expect(svg.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
  expect(svg.getAttribute('width')).toBeNull();
});

describe('LogicPane', () => {
  test('selects in the editor when it shows exactly the analysed text', () => {
    const onReveal = vi.fn();
    render(<LogicPane view={viewOf(sample)} noteCounts={{}} editorText={text} onReveal={onReveal} />);
    fireEvent.click(station(/moon rules every living thing/));
    expect(onReveal).toHaveBeenCalledWith(findPassage(text, sample.stations[2].passage));
    expect(screen.queryByText(STALE_NOTE)).toBeNull();
  });

  test('with an unsaved draft it shows a note and selects nothing; the note goes when the text matches again', () => {
    const onReveal = vi.fn();
    const view = viewOf(sample);
    const { rerender } = render(<LogicPane view={view} noteCounts={{}} editorText={`${text} And a new line.`} onReveal={onReveal} />);
    expect(screen.queryByText(STALE_NOTE)).toBeNull();
    fireEvent.click(station(/moon rules every living thing/));
    expect(onReveal).not.toHaveBeenCalled();
    expect(screen.getByText(STALE_NOTE)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(STALE_NOTE);
    rerender(<LogicPane view={view} noteCounts={{}} editorText={text} onReveal={onReveal} />);
    expect(screen.queryByText(STALE_NOTE)).toBeNull();
  });

  test('when the saved piece text moved on since the analysis, the same note appears', () => {
    const onReveal = vi.fn();
    const view = viewOf(sample, {}, text);
    view.piece = { ...view.piece, text: 'Rewritten after the analysis.' };
    render(<LogicPane view={view} noteCounts={{}} editorText={view.piece.text} onReveal={onReveal} />);
    fireEvent.click(station(/moon rules every living thing/));
    expect(onReveal).not.toHaveBeenCalled();
    expect(screen.getByText(STALE_NOTE)).toBeTruthy();
  });

  test('keeps the existing messages when there is no analysis', () => {
    const noVersion: PieceView = { ...viewOf(sample), version: null, structure: null, jumps: [] };
    const { rerender } = render(<LogicPane view={noVersion} />);
    expect(screen.getByRole('tabpanel', { name: 'Logic' }).textContent).toContain('Not analysed yet');
    rerender(<LogicPane view={null} />);
    expect(screen.getByRole('tabpanel', { name: 'Logic' }).textContent).toContain('Choose or create a piece');
  });
});

describe('LogicMap selection (Task 11 review fixes)', () => {
  test('the chosen station is marked with aria-current, not aria-pressed', () => {
    render(<LogicMap view={viewOf(sample)} noteCounts={{}} onSelectRange={() => {}} />);
    const s1 = station(/pull on the sea raises the tide/);
    expect(s1.getAttribute('aria-current')).toBeNull();
    fireEvent.click(s1);
    expect(s1.getAttribute('aria-current')).toBe('true');
    expect(s1.hasAttribute('aria-pressed')).toBe(false);
    expect(station(/moon rules every living thing/).getAttribute('aria-current')).toBeNull();
  });

  test('the selection is cleared when the same version id carries a new reading, as a re-read now does', () => {
    const before = viewOf(sample);
    const after = viewOf(withStations(s => (s.id === 's1' ? { ...s, claim: 'a different claim under the same id' } : s)));
    // Same version id, same text, a different map: exactly what replace-in-place produces.
    after.version = { ...after.version!, savedAt: '2026-10-31T00:05:00.000Z' };
    const { rerender } = render(<LogicMap view={before} noteCounts={{}} onSelectRange={() => {}} />);
    fireEvent.click(station(/pull on the sea raises the tide/));
    expect(station(/pull on the sea raises the tide/).getAttribute('aria-current')).toBe('true');
    rerender(<LogicMap view={after} noteCounts={{}} onSelectRange={() => {}} />);
    const hit = screen.queryByRole('button', { name: /pull on the sea raises the tide/ });
    expect(hit === null || hit.getAttribute('aria-current') === null).toBe(true);
  });

  test('the selection is cleared when another version is shown, since ids like s1 repeat across versions', () => {
    const v1 = viewOf(sample);
    const v2 = viewOf(sample);
    v2.version = { ...v2.version!, id: 'v2' };
    const { rerender } = render(<LogicMap view={v1} noteCounts={{}} onSelectRange={() => {}} />);
    fireEvent.click(station(/pull on the sea raises the tide/));
    expect(station(/pull on the sea raises the tide/).getAttribute('aria-current')).toBe('true');
    rerender(<LogicMap view={v2} noteCounts={{}} onSelectRange={() => {}} />);
    expect(station(/pull on the sea raises the tide/).getAttribute('aria-current')).toBeNull();
  });

  test('selected and focused look different without colour: a solid thick outline against a dashed one', () => {
    const css = readFileSync('src/web/index.css', 'utf8');
    const rule = (selector: string) => css.split('\n').find(l => l.startsWith(selector)) ?? '';
    const selected = rule('.logic-svg .station.selected .hit');
    const focused = rule('.logic-svg .station:focus-visible .hit');
    expect(selected).toMatch(/stroke-width:\s*4/);
    expect(selected).not.toMatch(/stroke-dasharray/);
    expect(focused).toMatch(/stroke-dasharray:\s*\d/);
  });
});

test('the strip under the map shows a claim\'s words on hover, and keeps them after a click', () => {
  render(<LogicMap view={viewOf(sample)} noteCounts={{}} onSelectRange={() => {}} />);
  expect(screen.getByText(/Point at a claim/)).toBeTruthy();
  const s3 = station(/moon rules every living thing/);
  fireEvent.mouseEnter(s3);
  expect(screen.getByText(sample.stations[2].passage)).toBeTruthy();
  fireEvent.mouseLeave(s3);
  expect(screen.queryByText(sample.stations[2].passage)).toBeNull();
  fireEvent.click(s3);
  fireEvent.mouseLeave(s3);
  expect(screen.getByText(sample.stations[2].passage)).toBeTruthy();
  expect(s3.getAttribute('aria-describedby')).toBeTruthy();
  expect(screen.getByText(sample.stations[2].claim, { selector: 'figcaption' })).toBeTruthy();
});

test('a claim whose words are not in the text shows the inferred note, never its paraphrase as a quote', () => {
  const analysis = withStations(s => (s.id === 's4' ? { ...s, passage: 'A sentence that is nowhere in the piece', unanchored: true } : s));
  render(<LogicMap view={viewOf(analysis)} noteCounts={{}} onSelectRange={() => {}} />);
  fireEvent.mouseEnter(station(/sea may remember/));
  expect(screen.getByText('Inferred: not found in the text.')).toBeTruthy();
  expect(screen.queryByText('A sentence that is nowhere in the piece')).toBeNull();
});

test('a confident claim is drawn heavier than a hedged one, and no station is a single bare number', () => {
  const { container } = render(<LogicMap view={viewOf(sample)} noteCounts={{}} onSelectRange={() => {}} />);
  const ids = sample.stations.map(s => s.id);
  const radii = [...container.querySelectorAll('.station .dot')].map(d => Number(d.getAttribute('r')));
  const r = (id: string) => radii[ids.indexOf(id)];
  expect(r('s3')).toBeCloseTo(dotRadius(0.97));
  expect(r('s3')).toBeGreaterThan(r('s1'));
  expect(r('s1')).toBeGreaterThan(r('s4'));
  const label = station(/moon rules every living thing/).getAttribute('aria-label')!;
  expect(label).toContain('Sounds 0.97');
  expect(label).toContain('supported to');
});

test('line weight is support; required and optional are told apart by the arrowhead, not by thickness', () => {
  const analysis: Analysis = { ...sample, links: [{ from: 's1', to: 's2', required: true }, { from: 's1', to: 's3', required: false }] };
  const { container } = render(<LogicMap view={viewOf(analysis)} noteCounts={{}} onSelectRange={() => {}} />);
  const links = [...container.querySelectorAll('path.link')] as SVGPathElement[];
  expect(links).toHaveLength(2);
  expect(links[0].getAttribute('marker-end')).toMatch(/arrow-filled/);
  expect(links[1].getAttribute('marker-end')).toMatch(/arrow-open/);
  // Both point at a claim backed by the same evidence, so the weight follows support and not requiredness.
  expect(Number(links[0].style.strokeWidth)).toBeCloseTo(linkWidth(0.8));
  expect(Number(links[1].style.strokeWidth)).toBeCloseTo(linkWidth(0.8));
  // A weaker target draws a thinner line.
  const weak: Analysis = { ...sample, stations: sample.stations.map(s => (s.id === 's3' ? { ...s, grounding: 'assertion' } : s)), links: [{ from: 's4', to: 's3', required: true }] };
  cleanup();
  const again = render(<LogicMap view={viewOf(weak)} noteCounts={{}} onSelectRange={() => {}} />).container;
  const only = again.querySelector('path.link') as SVGPathElement;
  expect(Number(only.style.strokeWidth)).toBeLessThan(linkWidth(0.8));
});

test('the key explains both channels and the inferred ring', () => {
  const { container } = render(<LogicMap view={viewOf(sample)} noteCounts={{}} onSelectRange={() => {}} />);
  const key = container.querySelector('.map-key')!.textContent!;
  expect(key).toMatch(/Its size is how sure the writing sounds/);
  expect(key).toMatch(/Its thickness is how well the claim it points at is backed/);
  expect(key).toMatch(/filled arrow means the support\s*is required/);
  expect(key).toMatch(/inferred rather than quoted/);
});
