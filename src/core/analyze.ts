// Asks a model to read a piece, validates the answer, and cleans it up so later code can trust it.
import { modelAnalysisJsonSchema, ModelAnalysisSchema } from './analysis';
import type { Analysis, ModelAnalysis } from './analysis';
import { buildAnalysisPrompt } from './prompt';
import type { CompletionRequest, ModelProvider } from './provider';
import { findPassage } from './text';

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisError';
  }
}

const SCHEMA_NAME = 'analysis';

/**
 * The schema as it is sent to the model. `z.toJSONSchema` adds a top-level `$schema` that some strict
 * endpoints reject, and huge `minimum`/`maximum` bounds on integers that llama.cpp turns into an enormous
 * grammar. Neither carries meaning for the model, so both are removed (validation still happens in zod).
 */
export function schemaForRequest(schema: object): object {
  const strip = (node: unknown, top: boolean): unknown => {
    if (Array.isArray(node)) return node.map(n => strip(n, false));
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (k === 'minimum' || k === 'maximum') continue;
        if (k === '$schema' && top) continue;
        out[k] = strip(v, false);
      }
      return out;
    }
    return node;
  };
  return strip(schema, true) as object;
}

/** A value in [2, 100] is a percentage; (1, 2) is a slight overshoot and clamps to 1; everything is clamped into [0, 1]. */
function normalizeExpressed(v: number): number {
  const scaled = v >= 2 && v <= 100 ? v / 100 : v;
  return Math.min(1, Math.max(0, scaled));
}

function describeIssue(parsed: { error: { issues: Array<{ path: PropertyKey[]; message: string }> } }): string {
  const issue = parsed.error.issues[0];
  if (!issue) return 'the reply did not match the expected shape';
  const where = issue.path.length ? issue.path.map(String).join('.') : '(root)';
  return `${where}: ${issue.message}`;
}

async function askOnce(provider: ModelProvider, req: CompletionRequest): Promise<{ ok: true; value: ModelAnalysis } | { ok: false; why: string; empty?: boolean }> {
  const raw = await provider.complete(req);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, why: 'the reply was not valid JSON' };
  }
  const parsed = ModelAnalysisSchema.safeParse(json);
  if (!parsed.success) return { ok: false, why: describeIssue(parsed) };
  // A valid but empty reply for a non-empty piece is a miss, not an answer.
  if (parsed.data.stations.length === 0 && parsed.data.motifs.length === 0) {
    return { ok: false, why: 'the reply was empty', empty: true };
  }
  return { ok: true, value: parsed.data };
}

export async function analyzePiece(
  provider: ModelProvider,
  text: string,
  opts: { maxChars: number },
  now: () => Date = () => new Date(),
): Promise<Analysis> {
  if (text.trim() === '') throw new AnalysisError('Nothing to analyse');
  if (text.length > opts.maxChars) {
    throw new AnalysisError(`This piece is ${text.length} characters; the limit is ${opts.maxChars}. Split it or raise TL_MAX_CHARS.`);
  }

  const { system, user } = buildAnalysisPrompt(text);
  const req: CompletionRequest = { system, user, schemaName: SCHEMA_NAME, jsonSchema: schemaForRequest(modelAnalysisJsonSchema) };

  let result = await askOnce(provider, req);
  if (!result.ok) result = await askOnce(provider, req);
  if (!result.ok) {
    if (result.empty) throw new AnalysisError('The model found nothing to map in this piece');
    throw new AnalysisError(`The model's answer could not be read after two tries (${result.why}).`);
  }
  const model = result.value;

  // Keep the first station for each id, so everything downstream can rely on ids being unique.
  const seen = new Set<string>();
  const stations = model.stations
    .filter(s => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .map(s => {
      const station: Analysis['stations'][number] = { ...s, expressed: normalizeExpressed(s.expressed) };
      if (!findPassage(text, s.passage)) station.unanchored = true;
      return station;
    });

  const links = model.links.filter(l => seen.has(l.from) && seen.has(l.to));

  const motifs = model.motifs
    .map(m => {
      const motif: Analysis['motifs'][number] = { ...m };
      if (!findPassage(text, m.passage)) motif.unanchored = true;
      return motif;
    })
    .sort((a, b) => a.order - b.order);

  return { stations, links, motifs, language: model.language, model: provider.name, createdAt: now().toISOString() };
}
