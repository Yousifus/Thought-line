// Tests for the eval script's pure part: counts from an analysis, and the REVIEW.md marking sheet.
import fs from 'node:fs';
import path from 'node:path';
import { buildReview, summarize } from '../../scripts/eval-review';
import type { EvalResult } from '../../scripts/eval-review';
import type { Analysis } from '../../src/core';

const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../fixtures/sample-analysis.json'), 'utf8'));
const analysis: Analysis = { ...fixture, language: fixture.language ?? 'mixed', model: 'fixture', createdAt: '2026-10-31T00:00:00.000Z' };

describe('summarize', () => {
  test('counts stations, jumps, dead ends and loops, and lists motifs in order', () => {
    const s = summarize(analysis);
    expect(s.stations).toBe(analysis.stations.length);
    expect(s.jumps).toBeGreaterThanOrEqual(0);
    expect(s.motifPath).toEqual([...analysis.motifs].sort((a, b) => a.order - b.order).map(m => m.motif));
  });

  test('carries no claim or passage text', () => {
    const json = JSON.stringify(summarize(analysis));
    for (const st of analysis.stations) {
      expect(json).not.toContain(st.claim);
      expect(json).not.toContain(st.passage);
    }
  });
});

const ok = (label: string, model: string, ms: number, motifPath: string[]): EvalResult => ({
  ok: true, label, model, ms, file: `eval/out/${model}/${label}.json`,
  summary: { stations: 7, jumps: 2, deadEnds: 1, loops: 0, motifPath },
});

describe('buildReview', () => {
  const results: EvalResult[] = [
    ok('essay-1', 'model-a', 12340, ['moon', 'sea', 'night']),
    ok('essay-1', 'model-b', 4000, []),
    { ok: false, label: 'essay-1', model: 'model-c', ms: 900, error: 'The model found nothing to map in this piece' },
    ok('post-2', 'model-a', 8000, ['harbour']),
  ];
  const text = buildReview(results, '2026-10-31T12:00:00.000Z');

  test('has one section per sample and one block per model, in order of first appearance', () => {
    expect(text.match(/^## /gm)).toHaveLength(2);
    expect(text.match(/^### /gm)).toHaveLength(4);
    expect(text.indexOf('## essay-1')).toBeLessThan(text.indexOf('## post-2'));
    expect(text.indexOf('### model-a')).toBeLessThan(text.indexOf('### model-b'));
    expect(text).toContain('Models: model-a, model-b, model-c');
  });

  test('lists the counts, the motif path and the time for a finished run', () => {
    expect(text).toContain('- Stations: 7');
    expect(text).toContain('- Jumps: 2');
    expect(text).toContain('- Dead ends: 1');
    expect(text).toContain('- Loops: 0');
    expect(text).toContain('- Motif path: moon > sea > night');
    expect(text).toContain('- Motif path: (none)');
    expect(text).toContain('- Time: 12.3 s');
    expect(text).toContain('- Output: eval/out/model-a/essay-1.json');
  });

  test('gives each finished run both boxes and a failed run none', () => {
    expect(text.match(/^- \[ \] Logic right\?$/gm)).toHaveLength(3);
    expect(text.match(/^- \[ \] Thought right\?$/gm)).toHaveLength(3);
    expect(text).toContain('- Failed after 0.9 s: The model found nothing to map in this piece');
  });

  test('contains no em-dash', () => {
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });
});
