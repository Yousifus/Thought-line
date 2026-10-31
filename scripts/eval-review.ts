// Pure helpers for `npm run eval`: summarise one analysis into counts, and build the REVIEW.md text. No I/O, so tests cover the formatting.
import { deriveStructure, findJumps } from '../src/core';
import type { Analysis } from '../src/core';

/** Counts and the motif path for one analysis. Never carries a claim or a passage, so it is safe to print and to put in REVIEW.md. */
export interface Summary {
  stations: number;
  jumps: number;
  deadEnds: number;
  loops: number;
  motifPath: string[];
}

/** `file` is where the full analysis was written, relative to the repo root. */
export type EvalResult =
  | { ok: true; label: string; model: string; ms: number; summary: Summary; file: string }
  | { ok: false; label: string; model: string; ms: number; error: string };

export function summarize(analysis: Analysis): Summary {
  const structure = deriveStructure(analysis);
  return {
    stations: analysis.stations.length,
    jumps: findJumps(analysis).length,
    deadEnds: structure.deadEnds.length,
    loops: structure.loops.length,
    motifPath: [...analysis.motifs].sort((a, b) => a.order - b.order).map(m => m.motif),
  };
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** One line of plain text: whitespace collapsed, and no leading '#' so an error can never turn into a heading in REVIEW.md. */
export function cleanError(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/^[#\s]+/, '');
}

/** The name an earlier REVIEW.md is moved to before a new one is written, e.g. REVIEW.2026-10-31T02-45-17Z.md (no characters Windows rejects). */
export function archivedReviewName(now: Date): string {
  return `REVIEW.${now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')}.md`;
}

/**
 * The marking sheet. One section per sample, one block per model with its counts, then the two boxes Yousef ticks.
 * Samples and models appear in the order they first occur in `results`. A failed run lists the reason and no boxes.
 */
export function buildReview(results: EvalResult[], generatedAt: string): string {
  const labels = [...new Set(results.map(r => r.label))];
  const models = [...new Set(results.map(r => r.model))];
  const lines: string[] = [
    '# Model review',
    '',
    `Generated ${generatedAt}. Tick a box when the map is right; the model with the most ticks wins, and the faster one if tied.`,
    '',
    `Models: ${models.join(', ')}`,
    `Samples: ${labels.length}`,
  ];
  for (const label of labels) {
    lines.push('', `## ${label}`);
    for (const r of results.filter(x => x.label === label)) {
      lines.push('', `### ${r.model}`, '');
      if (!r.ok) {
        lines.push(`- Failed after ${seconds(r.ms)}: ${cleanError(r.error)}`);
        continue;
      }
      const s = r.summary;
      lines.push(
        `- Stations: ${s.stations}`,
        `- Jumps: ${s.jumps}`,
        `- Dead ends: ${s.deadEnds}`,
        `- Loops: ${s.loops}`,
        `- Motif path: ${s.motifPath.length ? s.motifPath.join(' > ') : '(none)'}`,
        `- Time: ${seconds(r.ms)}`,
        `- Output: ${r.file}`,
        '- [ ] Logic right?',
        '- [ ] Thought right?',
      );
    }
  }
  return lines.join('\n') + '\n';
}
