// Tests for the Logic map layout: everything is placed, flags carry through, loops and self-support do not throw, labels wrap and truncate.
import { deriveStructure, findJumps } from '../../src/core';
import type { Analysis, Link, Station } from '../../src/core';
import { layoutLogic, wrapLabel } from '../../src/web/layout/logicLayout';

const st = (id: string, role: Station['role'], expressed: number, grounding: Station['grounding'], extra: Partial<Station> = {}): Station =>
  ({ id, claim: `Claim ${id}`, passage: `Passage ${id}`, role, expressed, grounding, ...extra });
const analysisOf = (stations: Station[], links: Link[]): Analysis =>
  ({ stations, links, motifs: [], language: 'en', model: 'fake', createdAt: '2026-10-31T00:00:00.000Z' });
const run = (a: Analysis, notes: Record<string, number> = {}) => layoutLogic(a, deriveStructure(a), findJumps(a), notes);

// s1 and s2 both feed s3 (an interchange); s3 states more than its supports back; s4 stands alone.
const branching = analysisOf(
  [st('s1', 'premise', 0.8, 'evidence'), st('s2', 'premise', 0.7, 'example'), st('s3', 'conclusion', 0.97, 'assertion'), st('s4', 'premise', 0.3, 'assertion')],
  [{ from: 's1', to: 's3', required: true }, { from: 's2', to: 's3', required: false }],
);

test('every station and link is laid out', () => {
  const out = run(branching);
  expect(out.stations.map(s => s.id).sort()).toEqual(['s1', 's2', 's3', 's4']);
  for (const s of out.stations) {
    expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(out.width);
    expect(s.y).toBeGreaterThan(0);
    expect(s.y).toBeLessThan(out.height);
  }
  expect(out.links).toHaveLength(2);
  for (const l of out.links) {
    expect(l.points.length).toBeGreaterThanOrEqual(2);
    expect(l.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    const from = out.stations.find(s => s.id === l.from)!;
    const to = out.stations.find(s => s.id === l.to)!;
    // Links run marker to marker, left to right for a forward link.
    expect(l.points[0]).toEqual({ x: from.x, y: from.y });
    expect(l.points[l.points.length - 1]).toEqual({ x: to.x, y: to.y });
    expect(to.x).toBeGreaterThan(from.x);
  }
  expect(out.links.find(l => l.from === 's1')!.required).toBe(true);
  expect(out.links.find(l => l.from === 's2')!.required).toBe(false);
});

test('links into a jumping station are marked intoJump', () => {
  const out = run(branching);
  const jump = out.stations.find(s => s.id === 's3')!.jump;
  expect(jump?.stationId).toBe('s3');
  expect(out.links.every(l => l.intoJump)).toBe(true);
  const calm = analysisOf([st('a', 'premise', 0.8, 'evidence'), st('b', 'conclusion', 0.8, 'assertion')], [{ from: 'a', to: 'b', required: true }]);
  expect(run(calm).links[0].intoJump).toBe(false);
  expect(run(calm).stations.every(s => s.jump === null)).toBe(true);
});

test('dead-end and interchange flags carry through', () => {
  const out = run(branching);
  const by = (id: string) => out.stations.find(s => s.id === id)!;
  expect(by('s3').isInterchange).toBe(true);
  expect(by('s1').isInterchange).toBe(false);
  expect(by('s4').isDeadEnd).toBe(true);
  expect(by('s3').isDeadEnd).toBe(false);
  expect(out.stations.every(s => !s.inLoop)).toBe(true);
  expect(out.links.every(l => !l.inLoop)).toBe(true);
});

test('a loop lays out without throwing', () => {
  const loop = analysisOf(
    [st('a', 'premise', 0.8, 'evidence'), st('b', 'step', 0.7, 'example'), st('c', 'step', 0.6, 'example'), st('d', 'conclusion', 0.6, 'example')],
    [{ from: 'a', to: 'b', required: true }, { from: 'b', to: 'c', required: true }, { from: 'c', to: 'b', required: true }, { from: 'c', to: 'd', required: true }],
  );
  const out = run(loop);
  expect(out.stations).toHaveLength(4);
  expect(out.links).toHaveLength(4);
  const inLoop = (id: string) => out.stations.find(s => s.id === id)!.inLoop;
  expect([inLoop('a'), inLoop('b'), inLoop('c'), inLoop('d')]).toEqual([false, true, true, false]);
  const link = (from: string, to: string) => out.links.find(l => l.from === from && l.to === to)!;
  expect(link('b', 'c').inLoop).toBe(true);
  expect(link('c', 'b').inLoop).toBe(true);
  expect(link('a', 'b').inLoop).toBe(false);
  expect(link('c', 'd').inLoop).toBe(false);
  expect(out.stations.every(s => Number.isFinite(s.x) && Number.isFinite(s.y))).toBe(true);
});

test('a station that supports itself, and an empty analysis, lay out', () => {
  const self = analysisOf([st('a', 'premise', 0.8, 'evidence')], [{ from: 'a', to: 'a', required: true }]);
  const out = run(self);
  expect(out.links).toHaveLength(1);
  expect(out.links[0].inLoop).toBe(true);
  expect(out.stations[0].inLoop).toBe(true);
  expect(run(analysisOf([], []))).toEqual({ stations: [], links: [], width: 0, height: 0 });
});

test('a link to a station that does not exist is left out', () => {
  const bad = analysisOf([st('a', 'premise', 0.8, 'evidence')], [{ from: 'a', to: 'ghost', required: true }]);
  expect(run(bad).links).toEqual([]);
});

test('note counts reach the stations, and stations without notes get zero', () => {
  const out = run(branching, { s3: 2 });
  expect(out.stations.find(s => s.id === 's3')!.noteCount).toBe(2);
  expect(out.stations.find(s => s.id === 's1')!.noteCount).toBe(0);
});

test('fifteen stations lay out inside the reported size without overlapping', () => {
  const stations: Station[] = [];
  const links: Link[] = [];
  for (let i = 0; i < 15; i++) stations.push(st(`n${i}`, i === 14 ? 'conclusion' : i < 8 ? 'premise' : 'step', 0.6, 'example'));
  for (let i = 0; i < 8; i++) links.push({ from: `n${i}`, to: `n${8 + Math.floor(i / 2)}`, required: true });
  for (let i = 8; i < 14; i++) links.push({ from: `n${i}`, to: i < 12 ? 'n12' : 'n14', required: i % 2 === 0 });
  const out = run(analysisOf(stations, links));
  expect(out.stations).toHaveLength(15);
  for (let i = 0; i < out.stations.length; i++) {
    for (let j = i + 1; j < out.stations.length; j++) {
      const a = out.stations[i];
      const b = out.stations[j];
      expect(Math.abs(a.x - b.x) >= 100 || Math.abs(a.y - b.y) >= 100).toBe(true);
    }
  }
});

describe('wrapLabel', () => {
  test('keeps a short claim on one line', () => {
    expect(wrapLabel('The tide rises')).toEqual(['The tide rises']);
  });
  test('wraps at word boundaries and ends in an ellipsis when it must drop words', () => {
    const lines = wrapLabel('The harbour fishermen already plan their work around the moon and the tide tables');
    expect(lines).toHaveLength(3);
    expect(lines.every(l => Array.from(l).length <= 18)).toBe(true);
    expect(lines[2].endsWith('…')).toBe(true);
  });
  test('a claim that fits exactly in three lines is not truncated; one more word is', () => {
    expect(wrapLabel('aaaa bbbb cccc dddd eeee ffff', 9, 3)).toEqual(['aaaa bbbb', 'cccc dddd', 'eeee ffff']);
    expect(wrapLabel('aaaa bbbb cccc dddd eeee ffff gggg', 9, 3)).toEqual(['aaaa bbbb', 'cccc dddd', 'eeee fff…']);
  });
  test('breaks a word longer than a line, and handles Arabic words', () => {
    expect(wrapLabel('x'.repeat(40), 18, 3)).toEqual(['x'.repeat(18), 'x'.repeat(18), 'xxxx']);
    expect(wrapLabel('أظن أن البحر يتذكر العواصف التي مرت به')).toEqual(['أظن أن البحر يتذكر', 'العواصف التي مرت', 'به']);
  });
});
