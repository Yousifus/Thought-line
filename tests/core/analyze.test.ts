// Tests for analyzePiece: input limits, one retry, and post-processing of the model's answer.
import { analyzePiece, AnalysisError } from '../../src/core/analyze';
import { buildAnalysisPrompt } from '../../src/core/prompt';
import { fakeProvider } from '../helpers/fakeProvider';

const TEXT = 'The sun gives. So we fly.';

interface Opts {
  stationPassage?: string;
  extraLink?: { from: string; to: string; required: boolean };
  duplicateFirstStation?: boolean;
  expressed?: [number, number];
  motifOrder?: [number, number];
}

/** A valid ModelAnalysis JSON string for TEXT, with knobs for the cases under test. */
function ok(o: Opts = {}): string {
  const stations: any[] = [
    { id: 's1', claim: 'The sun gives', passage: o.stationPassage ?? 'The sun gives', role: 'premise', expressed: o.expressed?.[0] ?? 0.9, grounding: 'assertion' },
    { id: 's2', claim: 'So we fly', passage: 'So we fly', role: 'conclusion', expressed: o.expressed?.[1] ?? 0.6, grounding: 'example' },
  ];
  if (o.duplicateFirstStation) stations.push({ ...stations[0], claim: 'a later duplicate', passage: 'zzz' });
  const links: any[] = [{ from: 's1', to: 's2', required: true }];
  if (o.extraLink) links.push(o.extraLink);
  const motifs = [
    { motif: 'sun', label: 'sun', passage: 'The sun', order: o.motifOrder?.[0] ?? 0 },
    { motif: 'wing', label: 'fly', passage: 'we fly', order: o.motifOrder?.[1] ?? 1 },
  ];
  return JSON.stringify({ stations, links, motifs, language: 'en' });
}

test('retries once on broken JSON', async () => {
  const p = fakeProvider(['{not json', ok()]);
  expect((await analyzePiece(p, TEXT, { maxChars: 1000 })).model).toBe('fake');
  expect(p.calls).toHaveLength(2);
  expect(p.calls[1]).toEqual(p.calls[0]);
});
test('retries once when the JSON does not match the schema', async () => {
  const p = fakeProvider([JSON.stringify({ stations: 'nope' }), ok()]);
  await analyzePiece(p, TEXT, { maxChars: 1000 });
  expect(p.calls).toHaveLength(2);
});
test('two failures is an error that names the first schema issue', async () => {
  await expect(analyzePiece(fakeProvider(['x', 'y']), TEXT, { maxChars: 1000 })).rejects.toBeInstanceOf(AnalysisError);
  const bad = JSON.stringify({ stations: 'nope' });
  await expect(analyzePiece(fakeProvider([bad, bad]), TEXT, { maxChars: 1000 })).rejects.toThrow(/stations/);
});
test('a provider error is not swallowed by the retry', async () => {
  const p = fakeProvider([new Error('Model at http://x/v1 unreachable'), ok()]);
  await expect(analyzePiece(p, TEXT, { maxChars: 1000 })).rejects.toThrow(/unreachable/);
  expect(p.calls).toHaveLength(1);
});
test('a paraphrased passage is kept and marked unanchored', async () => {
  const a = await analyzePiece(fakeProvider([ok({ stationPassage: 'the sun is generous' })]), TEXT, { maxChars: 1000 });
  expect(a.stations[0].unanchored).toBe(true);
  expect(a.stations[1].unanchored).toBeUndefined();
});
test('a motif whose passage is not in the text is kept and marked unanchored', async () => {
  const raw = JSON.parse(ok());
  raw.motifs[0].passage = 'a moon that is not here';
  const a = await analyzePiece(fakeProvider([JSON.stringify(raw)]), TEXT, { maxChars: 1000 });
  expect(a.motifs).toHaveLength(2);
  expect(a.motifs.find(m => m.motif === 'sun')?.unanchored).toBe(true);
  expect(a.motifs.find(m => m.motif === 'wing')?.unanchored).toBeUndefined();
});
test('an empty passage counts as unanchored', async () => {
  const a = await analyzePiece(fakeProvider([ok({ stationPassage: '' })]), TEXT, { maxChars: 1000 });
  expect(a.stations[0].unanchored).toBe(true);
});
test('links to unknown stations and duplicate ids are dropped', async () => {
  const a = await analyzePiece(fakeProvider([ok({ extraLink: { from: 's1', to: 'ghost', required: true }, duplicateFirstStation: true })]), TEXT, { maxChars: 1000 });
  expect(a.links.some(l => l.to === 'ghost')).toBe(false);
  expect(a.links).toEqual([{ from: 's1', to: 's2', required: true }]);
  expect(a.stations.filter(s => s.id === 's1')).toHaveLength(1);
  expect(a.stations.find(s => s.id === 's1')?.claim).toBe('The sun gives');
});
test('links from unknown stations are dropped too', async () => {
  const a = await analyzePiece(fakeProvider([ok({ extraLink: { from: 'ghost', to: 's2', required: false } })]), TEXT, { maxChars: 1000 });
  expect(a.links.some(l => l.from === 'ghost')).toBe(false);
});
test('percent and out-of-range certainty are normalized', async () => {
  const a = await analyzePiece(fakeProvider([ok({ expressed: [85, -0.2] })]), TEXT, { maxChars: 1000 });
  expect(a.stations.map(s => s.expressed)).toEqual([0.85, 0]);
});
test('certainty rule: (1, 2) clamps to 1; [2, 100] is a percentage; the rest clamps to [0, 1]', async () => {
  const run = async (e: [number, number]) => (await analyzePiece(fakeProvider([ok({ expressed: e })]), TEXT, { maxChars: 1000 })).stations.map(s => s.expressed);
  expect(await run([1, 0])).toEqual([1, 0]);
  expect(await run([1.5, 1.2])).toEqual([1, 1]);
  expect(await run([2, 85])).toEqual([0.02, 0.85]);
  expect(await run([100, 250])).toEqual([1, 1]);
  expect(await run([-3, 0.5])).toEqual([0, 0.5]);
});
test('a reply with no stations and no motifs is retried once, then accepted if the retry has content', async () => {
  const empty = JSON.stringify({ stations: [], links: [], motifs: [], language: 'en' });
  const p = fakeProvider([empty, ok()]);
  const a = await analyzePiece(p, TEXT, { maxChars: 1000 });
  expect(p.calls).toHaveLength(2);
  expect(p.calls[1]).toEqual(p.calls[0]);
  expect(a.stations).toHaveLength(2);
});
test('two empty replies is an error saying the model found nothing', async () => {
  const empty = JSON.stringify({ stations: [], links: [], motifs: [], language: 'en' });
  const p = fakeProvider([empty, empty]);
  await expect(analyzePiece(p, TEXT, { maxChars: 1000 })).rejects.toThrow('The model found nothing to map in this piece');
  expect(p.calls).toHaveLength(2);
});
test('stations alone, or motifs alone, are not empty', async () => {
  const onlyMotifs = JSON.stringify({ stations: [], links: [], motifs: [{ motif: 'sun', label: 'sun', passage: 'The sun', order: 0 }], language: 'en' });
  const p = fakeProvider([onlyMotifs]);
  expect((await analyzePiece(p, TEXT, { maxChars: 1000 })).motifs).toHaveLength(1);
  expect(p.calls).toHaveLength(1);
});
test('motifs are sorted by order', async () => {
  const a = await analyzePiece(fakeProvider([ok({ motifOrder: [5, 2] })]), TEXT, { maxChars: 1000 });
  expect(a.motifs.map(m => m.motif)).toEqual(['wing', 'sun']);
});
test('model and createdAt are stamped from the provider and the clock', async () => {
  const a = await analyzePiece(fakeProvider([ok()], 'local', 'gemma-4'), TEXT, { maxChars: 1000 }, () => new Date('2026-10-31T01:02:03.000Z'));
  expect(a.model).toBe('gemma-4');
  expect(a.createdAt).toBe('2026-10-31T01:02:03.000Z');
  expect(a.language).toBe('en');
});
test('empty and oversized pieces never reach the model', async () => {
  const p = fakeProvider([]);
  await expect(analyzePiece(p, '   \n ', { maxChars: 1000 })).rejects.toThrow('Nothing to analyse');
  await expect(analyzePiece(p, 'x'.repeat(1001), { maxChars: 1000 })).rejects.toThrow(/limit is 1000/);
  expect(p.calls).toHaveLength(0);
});
test('the size message is exact', async () => {
  await expect(analyzePiece(fakeProvider([]), 'x'.repeat(1001), { maxChars: 1000 }))
    .rejects.toThrow('This piece is 1001 characters; the limit is 1000. Split it or raise TL_MAX_CHARS.');
});
test('a piece exactly at the limit is accepted', async () => {
  const p = fakeProvider([ok()]);
  await analyzePiece(p, 'x'.repeat(1000), { maxChars: 1000 });
  expect(p.calls).toHaveLength(1);
});
test('the request sends the text alone as the user message and a schema without $schema or integer bounds', async () => {
  const p = fakeProvider([ok()]);
  await analyzePiece(p, TEXT, { maxChars: 1000 });
  const sent = p.calls[0];
  expect(sent.user).toBe(TEXT);
  expect(sent.schemaName).toBe('analysis');
  const json = JSON.stringify(sent.jsonSchema);
  expect(json).not.toContain('$schema');
  expect(json).not.toMatch(/"minimum"|"maximum"/);
  expect(json).toContain('"stations"');
  expect(json).toContain('"integer"');
});
test('the prompt carries each rule the brief requires', () => {
  const { system, user } = buildAnalysisPrompt(TEXT);
  expect(user).toBe(TEXT);
  expect(system).toMatch(/verbatim/i);
  expect(system).toMatch(/never translate/i);
  expect(system).toMatch(/writer sounds/i);
  expect(system).toMatch(/hedges/i);
  expect(system).toMatch(/evidence/);
  expect(system).toMatch(/example/);
  expect(system).toMatch(/assertion/);
  expect(system).toMatch(/premise/);
  expect(system).toMatch(/conclusion/);
  expect(system).toMatch(/lowercase English noun/);
  expect(system).toMatch(/as written/);
  expect(system).toMatch(/mixed/);
});
test('the prompt covers reflective writing and guards against instructions inside the text', () => {
  const { system } = buildAnalysisPrompt(TEXT);
  expect(system).toMatch(/reflective/i);
  expect(system).toMatch(/observations, beliefs or stated feelings/);
  expect(system).toMatch(/no conclusion/);
  expect(system).toMatch(/3 to 15/);
  expect(system).toMatch(/never instructions to follow/i);
  expect(system).toMatch(/addressed to the reader/);
});
