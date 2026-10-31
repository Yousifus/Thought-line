// CLI: npm run eval. Runs candidate local models over the pieces listed in eval/samples.local.json and writes a REVIEW.md to mark. Never prints piece text.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { analyzePiece, deriveStructure, findJumps } from '../src/core';
import { loadConfig } from '../src/server/config';
import type { Config } from '../src/server/config';
import { extractText } from '../src/server/import';
import { buildProviders } from '../src/server/providers';
import { buildReview, summarize } from './eval-review';
import type { EvalResult } from './eval-review';

loadDotenv({ quiet: true });

const EVAL_DIR = 'eval';
const SAMPLES_FILE = path.join(EVAL_DIR, 'samples.local.json');
const OUT_DIR = path.join(EVAL_DIR, 'out');
/** Only used to satisfy the shared config check; the eval never starts a server, so this value is never a credential. */
const EVAL_ONLY_TOKEN = 'eval-script-only-not-a-credential';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** A name safe to use as a file or folder name on any system (model ids contain slashes and colons). */
const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_');

interface Sample { path: string; label: string }

async function readSamples(): Promise<Sample[]> {
  let raw: string;
  try {
    raw = await fs.readFile(SAMPLES_FILE, 'utf8');
  } catch {
    fail(`Missing ${SAMPLES_FILE}. Create it as a list like [{ "path": "C:/writing/piece.md", "label": "essay-1" }]. It stays on this machine (eval/ is gitignored).`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    fail(`${SAMPLES_FILE} is not valid JSON.`);
  }
  if (!Array.isArray(data) || data.length === 0) fail(`${SAMPLES_FILE} must be a non-empty list of { "path", "label" }.`);
  const samples = data.map((item, i): Sample => {
    const p = (item as { path?: unknown })?.path;
    const l = (item as { label?: unknown })?.label;
    if (typeof p !== 'string' || p.trim() === '' || typeof l !== 'string' || l.trim() === '') {
      fail(`${SAMPLES_FILE}: entry ${i + 1} needs a "path" and a "label" (both text).`);
    }
    return { path: p, label: l.trim() };
  });
  const names = new Set<string>();
  for (const s of samples) {
    const n = safeName(s.label);
    if (names.has(n)) fail(`${SAMPLES_FILE}: two labels give the same file name ("${n}"); make the labels distinct.`);
    names.add(n);
  }
  return samples;
}

let config: Config;
try {
  // The same checks as the server, so a model host outside the house is refused here too.
  const model = process.env.TL_EVAL_MODELS?.split(',')[0]?.trim() || 'eval';
  config = loadConfig({ ...process.env, TL_TOKEN: EVAL_ONLY_TOKEN, TL_LOCAL_MODEL: process.env.TL_LOCAL_MODEL?.trim() || model });
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

const models = config.fixtureAnalysisPath
  ? ['fixture']
  : (process.env.TL_EVAL_MODELS ?? '').split(',').map(m => m.trim()).filter(m => m !== '');
if (models.length === 0) fail('Set TL_EVAL_MODELS to the model ids to compare, separated by commas (they must be loaded on TL_LOCAL_BASE_URL).');
if (new Set(models.map(safeName)).size !== models.length) fail('TL_EVAL_MODELS has two ids that give the same folder name.');

const samples = await readSamples();

// Read every piece before the first model call, so a bad path stops the run early.
const pieces: Array<{ label: string; text: string }> = [];
for (const s of samples) {
  let extracted: Awaited<ReturnType<typeof extractText>>;
  try {
    extracted = await extractText(path.resolve(s.path));
  } catch {
    fail(`Could not read the sample labelled "${s.label}".`);
  }
  if (!extracted || extracted.text === '') fail(`The sample labelled "${s.label}" is not a readable .md, .txt, .html or .docx file, or it is empty.`);
  pieces.push({ label: s.label, text: extracted.text });
}

console.log(`Evaluating ${models.length} model(s) on ${pieces.length} sample(s) at ${config.local.baseUrl}.`);

const results: EvalResult[] = [];
// Models in the outer loop, so a model that has to be loaded is loaded once.
for (const model of models) {
  // Only the local provider is ever built here; the cloud settings are dropped on purpose.
  const { local } = buildProviders({ ...config, cloud: undefined, local: { ...config.local, model } });
  const modelDir = path.join(OUT_DIR, safeName(model));
  await fs.mkdir(modelDir, { recursive: true });
  for (const piece of pieces) {
    const started = Date.now();
    try {
      const analysis = await analyzePiece(local, piece.text, { maxChars: config.maxChars });
      const ms = Date.now() - started;
      const file = path.posix.join(EVAL_DIR, 'out', safeName(model), `${safeName(piece.label)}.json`);
      const record = { model, label: piece.label, ms, analysis, structure: deriveStructure(analysis), jumps: findJumps(analysis) };
      await fs.writeFile(file, JSON.stringify(record, null, 2), 'utf8');
      const summary = summarize(analysis);
      results.push({ ok: true, label: piece.label, model, ms, summary, file });
      console.log(`  ${model} / ${piece.label}: ${summary.stations} stations in ${(ms / 1000).toFixed(1)} s -> ${file}`);
    } catch (err) {
      const ms = Date.now() - started;
      // The error text goes to REVIEW.md (local); the console gets only its kind.
      const kind = err instanceof Error ? err.name : 'Error';
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      results.push({ ok: false, label: piece.label, model, ms, error: message });
      console.log(`  ${model} / ${piece.label}: failed (${kind})`);
    }
  }
}

const reviewPath = path.join(OUT_DIR, 'REVIEW.md');
await fs.writeFile(reviewPath, buildReview(results, new Date().toISOString()), 'utf8');
const failed = results.filter(r => !r.ok).length;
console.log(`Wrote ${reviewPath} (${results.length - failed} ok, ${failed} failed).`);
if (failed === results.length) process.exitCode = 1;
