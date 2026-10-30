# Thought-line v2, Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local service on the PC that reads a piece of writing with a local model and shows it as two maps (Logic and Thought), flags where certainty jumps, and lets Claude and the PC's local agent leave margin notes through MCP.

**Architecture:** One Node service (Express) holds storage, analysis and the MCP server. It serves a React web app and is reached over Tailscale with a bearer token. Runtime-neutral code (analysis types, certainty rule, text anchoring, model provider, store interface) lives in `src/core/` with no Node imports, so a later browser build can reuse it. Node-only code (files, HTTP, MCP, import) lives in `src/server/`.

**Tech Stack:** TypeScript (strict), React 19, Vite 6, Tailwind 4, Express 4, zod 4, @modelcontextprotocol/sdk, @dagrejs/dagre, node-html-parser, mammoth, vitest, supertest, @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-10-31-thought-line-v2-design.md`

**Scope of this plan.** The spec has six features. This plan is Milestone 1: the core (one piece, two tabs), **where certainty jumps** (feature 3) and **readers in the margin** (feature 4), plus folder import, because the tool is useless until his writing is in it. Two later plans follow, each building on this one: **Milestone 2** covers then and now (feature 2) and threads across the library (feature 1). **Milestone 3** covers speak it in (feature 5). The storage model here (saved versions with frozen analyses, notes anchored to passages, a language-neutral motif key) is built now so those milestones need no migration.

**Where to build.** Tasks 1 to 12 run anywhere with Node 22+, using a fake model in tests and a fixture model for UI work. Task 13 runs on the PC (ECHO-POINT), where the GPU and the private writings are.

## Global Constraints

- Node `>=22` (`"engines"` in package.json). TypeScript `"strict": true`.
- Nothing under `src/core/` imports `node:*`, `fs`, `path`, `os`, `child_process`, `express`, or reads `process`. A test enforces this (Task 1).
- The tool makes no network calls except to the configured model endpoints. No telemetry, no CDN fonts or scripts in the web app.
- A `private` piece is only ever sent to the **local** provider. New pieces default to `private`.
- The server never binds `0.0.0.0` or `::`. Every `/api` and `/mcp` request needs `Authorization: Bearer <TL_TOKEN>`.
- `data/`, `eval/`, `.env` and any personal text are gitignored. The repo is public.
- Certainty rule constants: `JUMP_LIMIT = 0.15`; root support by grounding `evidence 0.8, example 0.6, assertion 0.4` (tunable; the spec fixes only the order).
- No em-dashes in user-facing copy (UI strings, README).
- Arabic and English: right-to-left text renders correctly; passages are never translated or transliterated.
- LICENSE: MIT, `Copyright (c) 2026 Yousef Awlaki`.

## Review Focus

1. **Arabic passages with different diacritics or alef forms** (the model writes `اسلام` where the text has `إسلام`, or drops harakat): the passage must still be found and anchored. Test in Task 4.
2. **The model returns certainty as a percent** (`85`) or out of range (`-0.2`, `1.4`): values in (1, 100] are read as percents, and everything is clamped to [0, 1]. The map must not show nonsense jumps. Test in Task 5.
3. **An empty or whitespace-only piece is analysed:** refuse with "Nothing to analyse" and make no model call. Test in Task 5.
4. **Two analyses of the same piece at once** (the browser and an agent): both run one after the other, two versions are saved, and no file is corrupted. Test in Task 7.
5. **The local model is unreachable while the browser waits:** the UI shows the error, naming the endpoint, and the text being edited is not lost. Test in Task 10.

---

### Task 1: Clear v1 and set up the v2 skeleton

**Files:**
- Delete: `server.ts`, `src/` (all v1 files), `firebase-applet-config.json`, `metadata.json`, `bun.lock`, `assets/.aistudio/` (keep `hero-preview.png` only if the README still uses it; v2 gets a new screenshot in Task 13, so delete it)
- Replace: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.env.example`
- Create: `LICENSE`, `vitest.config.ts`, `src/core/.gitkeep`, `tests/core/purity.test.ts`

**Interfaces:**
- Produces: npm scripts `dev:server` (`tsx watch src/server/main.ts`), `dev:web` (`vite`), `build` (`vite build`, output `dist/web`), `start` (`tsx src/server/main.ts`), `test` (`vitest run`), `typecheck` (`tsc --noEmit`), `import` (`tsx scripts/import.ts`), `eval` (`tsx scripts/eval-models.ts`).

- [ ] **Step 1: Delete the v1 files listed above and write the new package.json**

Dependencies: `react@^19`, `react-dom@^19`, `express@^4`, `zod@^4`, `@modelcontextprotocol/sdk`, `@dagrejs/dagre`, `node-html-parser`, `mammoth`, `dotenv`, `tsx`. Dev: `typescript@~5.8`, `vite@^6`, `@vitejs/plugin-react`, `tailwindcss@^4`, `@tailwindcss/vite`, `vitest`, `jsdom`, `@testing-library/react`, `supertest`, `docx`, `@types/express`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/supertest`. Use npm (package-lock.json); remove Firebase, Gemini, motion, recharts.

`.gitignore` adds `data/`, `eval/`, `.env`, `dist/`, `node_modules/`. `.env.example` lists every `TL_*` variable from Task 7 with placeholder values and no real token.

- [ ] **Step 2: Write the failing purity test**

```ts
// tests/core/purity.test.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const FORBIDDEN = /from\s+['"](node:|fs|path|os|child_process|express)['"/]|\bprocess\./;
test('src/core has no Node-only imports', () => {
  const dir = 'src/core';
  const files = readdirSync(dir).filter(f => f.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(FORBIDDEN);
});
```

- [ ] **Step 3: Run it and see it fail** (`npx vitest run tests/core/purity.test.ts`). Expected: FAIL, `files.length` is 0.

- [ ] **Step 4: Create `src/core/index.ts` exporting nothing yet** (`export {};`) and delete `.gitkeep`.

- [ ] **Step 5: Run `npm test` and `npm run typecheck`.** Expected: both pass.

- [ ] **Step 6: Commit** `chore: clear v1 and set up the v2 skeleton`.

### Task 2: Analysis types and structure

**Files:**
- Create: `src/core/analysis.ts`, `src/core/structure.ts`
- Test: `tests/core/structure.test.ts`

**Interfaces:**
- Produces:
```ts
export type Privacy = 'private' | 'public';
export type Grounding = 'evidence' | 'example' | 'assertion';
export type Role = 'premise' | 'step' | 'conclusion';
export interface Station { id: string; claim: string; passage: string; role: Role; expressed: number; grounding: Grounding; unanchored?: boolean }
export interface Link { from: string; to: string; required: boolean }   // `from` supports `to`
export interface MotifMention { motif: string; label: string; passage: string; order: number; unanchored?: boolean }
export interface Analysis { stations: Station[]; links: Link[]; motifs: MotifMention[]; language: 'ar' | 'en' | 'mixed'; model: string; createdAt: string }
export const ModelAnalysisSchema: z.ZodType  // what the model returns: stations, links, motifs, language (no model/createdAt/unanchored)
export type ModelAnalysis = z.infer<typeof ModelAnalysisSchema>;
export const modelAnalysisJsonSchema: object // z.toJSONSchema(ModelAnalysisSchema)
// structure.ts
export interface Structure { interchanges: string[]; loops: string[][]; deadEnds: string[] }
export function deriveStructure(a: Pick<Analysis, 'stations' | 'links'>): Structure
```
`motif` is a short lowercase English noun gloss (`"moon"`) even for Arabic text; `label` is the word as written (`"القمر"`). This is what lets threads cross languages in Milestone 2.

Definitions: an **interchange** has 2+ incoming or 2+ outgoing links. A **loop** is a strongly connected component with 2+ stations, or a station linked to itself (Tarjan); each loop's ids are sorted. A **dead end** is a non-conclusion with no outgoing link, or a conclusion with no incoming link. Output arrays are sorted by id.

- [ ] **Step 1: Write the failing tests**

```ts
const st = (id: string, role: Role = 'step') => ({ id, claim: id, passage: id, role, expressed: 0.5, grounding: 'assertion' as const });
test('a clean chain has no flags', () => {
  const s = deriveStructure({ stations: [st('a','premise'), st('b'), st('c','conclusion')], links: [{from:'a',to:'b',required:true},{from:'b',to:'c',required:true}] });
  expect(s).toEqual({ interchanges: [], loops: [], deadEnds: [] });
});
test('two supports into one claim make an interchange', () => {
  const s = deriveStructure({ stations: [st('a','premise'), st('b','premise'), st('c','conclusion')], links: [{from:'a',to:'c',required:true},{from:'b',to:'c',required:false}] });
  expect(s.interchanges).toEqual(['c']);
});
test('circular support is a loop', () => {
  const s = deriveStructure({ stations: [st('a'), st('b'), st('c','conclusion')], links: [{from:'a',to:'b',required:true},{from:'b',to:'a',required:true},{from:'b',to:'c',required:true}] });
  expect(s.loops).toEqual([['a','b']]);
});
test('a premise nothing builds on, and an unsupported conclusion, are dead ends', () => {
  const s = deriveStructure({ stations: [st('a','premise'), st('z','conclusion')], links: [] });
  expect(s.deadEnds).toEqual(['a','z']);
});
```

- [ ] **Step 2: Run, expect FAIL** (`npx vitest run tests/core/structure.test.ts`).
- [ ] **Step 3: Implement the types, schema and `deriveStructure`.** In the schema, `expressed` is `z.number()` (no range: Task 5 normalizes it) and `order` is `z.number().int()`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(core): analysis types and argument structure`.

### Task 3: Where certainty jumps

**Files:**
- Create: `src/core/certainty.ts`
- Test: `tests/core/certainty.test.ts`

**Interfaces:**
- Consumes: `Station`, `Link`, `Grounding`, `Analysis` (Task 2).
- Produces:
```ts
export const JUMP_LIMIT = 0.15;
export const GROUNDING_SUPPORT: Record<Grounding, number>; // { evidence: 0.8, example: 0.6, assertion: 0.4 }
export interface Jump { stationId: string; expressed: number; support: number; excess: number } // excess rounded to 2 dp
export function supportOf(a: Pick<Analysis, 'stations' | 'links'>): Map<string, number>
export function findJumps(a: Pick<Analysis, 'stations' | 'links'>): Jump[]   // sorted by stationId
```

The rule, as the spec reads: **support** of a station with no incoming links is `GROUNDING_SUPPORT[grounding]`. Otherwise it is the minimum **credited** value over its required incoming links, or the maximum over all incoming links if none is required. **Allowed** is `support + JUMP_LIMIT`. **Credited** is `min(expressed, allowed)`, so a station never passes on more certainty than it claims or than it is allowed. A **jump** is `expressed - allowed > 1e-9`. Links that lie inside a loop (both ends in the same strongly connected component from `deriveStructure`) are ignored for support, so cycles terminate. Compute in topological order.

- [ ] **Step 1: Write the failing tests**

```ts
test('an evidenced root may be stated up to 0.95', () => {
  expect(findJumps({ stations: [st('a','evidence',0.95)], links: [] })).toEqual([]);
});
test('a bare assertion stated at 0.9 is a jump of 0.35', () => {
  expect(findJumps({ stations: [st('a','assertion',0.9)], links: [] }))
    .toEqual([{ stationId: 'a', expressed: 0.9, support: 0.4, excess: 0.35 }]);
});
test('a step may sit exactly 0.15 above its input, not more', () => {
  const links = [{ from: 'a', to: 'b', required: true }];
  expect(findJumps({ stations: [st('a','evidence',0.7), st('b','assertion',0.85)], links })).toEqual([]);
  expect(findJumps({ stations: [st('a','evidence',0.7), st('b','assertion',0.86)], links })[0].excess).toBe(0.01);
});
test('required inputs cap at the weakest; optional inputs take the strongest', () => {
  const stations = [st('a','evidence',0.7), st('b','assertion',0.5), st('c','assertion',0.5)];
  expect(supportOf({ stations, links: [{from:'a',to:'c',required:true},{from:'b',to:'c',required:true}] }).get('c')).toBe(0.5);
  expect(supportOf({ stations, links: [{from:'a',to:'c',required:false},{from:'b',to:'c',required:false}] }).get('c')).toBe(0.7);
});
test('a loop does not hang and falls back to grounding', () => {
  const s = supportOf({ stations: [st('a','assertion',0.5), st('b','example',0.5)], links: [{from:'a',to:'b',required:true},{from:'b',to:'a',required:true}] });
  expect([s.get('a'), s.get('b')]).toEqual([0.4, 0.6]);
});
```
(`st(id, grounding, expressed)` is a local helper building a `Station` with role `step`.)

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(core): flag where certainty jumps`.

### Task 4: Finding passages and anchoring notes

**Files:**
- Create: `src/core/text.ts`, `src/core/anchors.ts`
- Test: `tests/core/text.test.ts`, `tests/core/anchors.test.ts`

**Interfaces:**
- Produces:
```ts
// text.ts
export interface Range { start: number; end: number }          // offsets into the ORIGINAL text
export function normalizeForMatch(s: string): string
export function findAllPassages(text: string, passage: string): Range[]
export function findPassage(text: string, passage: string): Range | null   // first match
export function textDirection(s: string): 'rtl' | 'ltr'                    // first strong character; '' -> 'ltr'
// anchors.ts
export interface Anchor { quote: string; prefix: string; suffix: string; start: number }
export function makeAnchor(text: string, range: Range): Anchor             // prefix/suffix: up to 32 chars
export function resolveAnchor(text: string, anchor: Anchor): Range | null
```
`normalizeForMatch`: NFC, then remove Arabic diacritics (U+064B to U+065F, U+0670) and tatweel (U+0640), map `أ إ آ` to `ا` and `ى` to `ي`, lowercase, and collapse whitespace runs to one space. Matching runs on the normalized text with an index map back to original offsets.

`resolveAnchor`: no match gives `null`, one match gives that match. With several matches, score each by how many characters of `prefix` (from its end) and `suffix` (from its start) agree, and break ties by distance from `anchor.start`.

- [ ] **Step 1: Write the failing tests**

```ts
test('finds a passage across different whitespace', () => {
  expect(findPassage('the  sun\n gifted wings', 'the sun gifted')).toEqual({ start: 0, end: 16 });
});
test('finds Arabic despite diacritics in the text', () => {
  expect(findPassage('القَمَرُ يجذب المدّ', 'القمر يجذب')?.start).toBe(0);
});
test('finds Arabic despite different alef forms', () => {           // Review Focus 1
  expect(findPassage('عن الإسلام والأخلاق', 'الاسلام والاخلاق')).not.toBeNull();
});
test('missing passage is null', () => { expect(findPassage('a b c', 'd')).toBeNull(); });
test('direction', () => {
  expect(textDirection('القمر')).toBe('rtl');
  expect(textDirection('moon القمر')).toBe('ltr');
  expect(textDirection('')).toBe('ltr');
});
// anchors.test.ts
const text = 'One. The sun is a gift. Two. The sun is a gift. Three.';
test('an anchor survives text inserted before it', () => {
  const a = makeAnchor(text, { start: 29, end: 47 });
  const edited = 'A new opening line here. ' + text;
  expect(resolveAnchor(edited, a)).toEqual({ start: 54, end: 72 });
});
test('prefix picks the right one of two identical quotes', () => {
  expect(resolveAnchor(text, makeAnchor(text, { start: 29, end: 47 }))).toEqual({ start: 29, end: 47 });
});
test('a deleted passage resolves to null', () => {
  expect(resolveAnchor('One. Three.', makeAnchor(text, { start: 5, end: 23 }))).toBeNull();
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(core): passage matching and note anchors`.

### Task 5: Model provider, privacy routing and analysis

**Files:**
- Create: `src/core/provider.ts`, `src/core/prompt.ts`, `src/core/analyze.ts`, `tests/helpers/fakeProvider.ts`
- Test: `tests/core/provider.test.ts`, `tests/core/analyze.test.ts`

**Interfaces:**
- Consumes: `Analysis`, `ModelAnalysisSchema`, `modelAnalysisJsonSchema`, `Privacy` (Task 2); `findPassage` (Task 4).
- Produces:
```ts
// provider.ts
export interface CompletionRequest { system: string; user: string; schemaName: string; jsonSchema: object }
export interface ModelProvider { readonly name: string; readonly kind: 'local' | 'cloud'; complete(req: CompletionRequest, signal?: AbortSignal): Promise<string> }
export interface OpenAICompatibleOptions { baseUrl: string; model: string; kind: 'local' | 'cloud'; apiKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch }
export function openAICompatible(opts: OpenAICompatibleOptions): ModelProvider   // name = opts.model
export class ProviderError extends Error {}
export function providerFor(privacy: Privacy, providers: { local: ModelProvider; cloud?: ModelProvider }): ModelProvider
// prompt.ts
export function buildAnalysisPrompt(text: string): { system: string; user: string }
// analyze.ts
export class AnalysisError extends Error {}
export function analyzePiece(provider: ModelProvider, text: string, opts: { maxChars: number }, now?: () => Date): Promise<Analysis>
// tests/helpers/fakeProvider.ts
export function fakeProvider(responses: Array<string | Error>, kind?: 'local' | 'cloud', name?: string): ModelProvider & { calls: CompletionRequest[] }
```

`openAICompatible` sends `POST {baseUrl}/chat/completions` with `{ model, temperature: 0.2, messages: [system, user], response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema: jsonSchema } } }`. It sends `Authorization: Bearer` only when `apiKey` is set, uses a default timeout of 180000 ms, and returns `choices[0].message.content`. A network failure, timeout or non-2xx response throws a `ProviderError` whose message names `baseUrl`, for example `Model at http://127.0.0.1:1234/v1 unreachable: ...` or `... returned 500`.

`providerFor`: a `private` piece always gets `local`. A `public` piece gets `cloud` if one is set, otherwise `local`.

The prompt must say, in the system message:
- `passage` is copied **verbatim** from the text and never translated.
- `expressed` is how sure the **writer sounds** (0 to 1; hedges low, absolute statements high), not the model's opinion of the idea.
- `grounding` is what backs a claim in the text itself: `evidence` (data or a cited source), `example`, or `assertion`.
- `role` is `premise`, `step` or `conclusion`.
- Motifs are the concrete images and figures the writing moves through, in order. `motif` is a short lowercase English noun even for Arabic text, and `label` is the word as written.
- `language` is `ar`, `en` or `mixed`.

The user message is the text alone.

`analyzePiece`, in order:
1. A trimmed empty text throws `AnalysisError('Nothing to analyse')`.
2. Text longer than `maxChars` throws `AnalysisError('This piece is {n} characters; the limit is {max}. Split it or raise TL_MAX_CHARS.')`.
3. Both checks above happen before any model call.
4. Call the model, `JSON.parse`, then `ModelAnalysisSchema.safeParse`. If either fails, retry once with the same request. A second failure throws an `AnalysisError` summarizing the first schema issue.
5. Post-process: keep the first station for each duplicate id; drop links to unknown ids; normalize `expressed` (a value in (1, 100] is divided by 100, then everything is clamped to [0, 1]); mark `unanchored: true` on any station or motif whose passage `findPassage` cannot locate (keep it, never drop it); sort motifs by `order`; set `model = provider.name` and `createdAt = now().toISOString()`.

- [ ] **Step 1: Write the failing tests**

```ts
// provider.test.ts
test('posts an OpenAI-style request with a JSON schema and no auth header for a local model', async () => {
  const seen: any[] = [];
  const fetchImpl = async (url: any, init: any) => { seen.push({ url, init }); return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] })); };
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', fetchImpl: fetchImpl as any });
  expect(await p.complete({ system: 's', user: 'u', schemaName: 'analysis', jsonSchema: {} })).toBe('{}');
  expect(seen[0].url).toBe('http://x/v1/chat/completions');
  expect(JSON.parse(seen[0].init.body).response_format.type).toBe('json_schema');
  expect(seen[0].init.headers.Authorization).toBeUndefined();
});
test('an unreachable model names its address', async () => {
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as any });
  await expect(p.complete({ system: '', user: '', schemaName: 'a', jsonSchema: {} })).rejects.toThrow(/http:\/\/x\/v1/);
});
test('private pieces never go to the cloud', () => {
  const local = fakeProvider([], 'local'), cloud = fakeProvider([], 'cloud');
  expect(providerFor('private', { local, cloud })).toBe(local);
  expect(providerFor('public', { local, cloud })).toBe(cloud);
  expect(providerFor('public', { local })).toBe(local);
});
// analyze.test.ts  (TEXT = 'The sun gives. So we fly.'; ok() returns a valid ModelAnalysis JSON string for it)
test('retries once on broken JSON', async () => {
  const p = fakeProvider(['{not json', ok()]);
  expect((await analyzePiece(p, TEXT, { maxChars: 1000 })).model).toBe('fake');
  expect(p.calls).toHaveLength(2);
});
test('two failures is an error', async () => {
  await expect(analyzePiece(fakeProvider(['x', 'y']), TEXT, { maxChars: 1000 })).rejects.toBeInstanceOf(AnalysisError);
});
test('a paraphrased passage is kept and marked unanchored', async () => {
  const a = await analyzePiece(fakeProvider([ok({ stationPassage: 'the sun is generous' })]), TEXT, { maxChars: 1000 });
  expect(a.stations[0].unanchored).toBe(true);
});
test('links to unknown stations and duplicate ids are dropped', async () => {
  const a = await analyzePiece(fakeProvider([ok({ extraLink: { from: 's1', to: 'ghost', required: true }, duplicateFirstStation: true })]), TEXT, { maxChars: 1000 });
  expect(a.links.some(l => l.to === 'ghost')).toBe(false);
  expect(a.stations.filter(s => s.id === 's1')).toHaveLength(1);
});
test('percent and out-of-range certainty are normalized', async () => {     // Review Focus 2
  const a = await analyzePiece(fakeProvider([ok({ expressed: [85, -0.2] })]), TEXT, { maxChars: 1000 });
  expect(a.stations.map(s => s.expressed)).toEqual([0.85, 0]);
});
test('empty and oversized pieces never reach the model', async () => {      // Review Focus 3
  const p = fakeProvider([]);
  await expect(analyzePiece(p, '   \n ', { maxChars: 1000 })).rejects.toThrow('Nothing to analyse');
  await expect(analyzePiece(p, 'x'.repeat(1001), { maxChars: 1000 })).rejects.toThrow(/limit is 1000/);
  expect(p.calls).toHaveLength(0);
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement the provider, prompt and `analyzePiece`, and the fake provider** (default name `'fake'`, kind `'local'`; it shifts responses in order and throws the item if it is an `Error`).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(core): model provider, privacy routing and analysis`.

### Task 6: Store interface and file store

**Files:**
- Create: `src/core/store.ts`, `src/server/fileStore.ts`
- Test: `tests/server/fileStore.test.ts`

**Interfaces:**
- Consumes: `Analysis`, `Privacy` (Task 2); `Anchor` (Task 4).
- Produces:
```ts
// src/core/store.ts
export interface Piece { id: string; title: string; privacy: Privacy; text: string; source?: { kind: 'paste' | 'import' | 'agent'; path?: string }; createdAt: string; updatedAt: string }
export interface Version { id: string; pieceId: string; savedAt: string; text: string; analysis: Analysis }
export interface Note { id: string; pieceId: string; author: string; body: string; anchor: Anchor; createdAt: string }
export interface PieceSummary { id: string; title: string; privacy: Privacy; updatedAt: string; versionCount: number }
export interface Store {
  listPieces(): Promise<PieceSummary[]>;                       // newest updatedAt first
  getPiece(id: string): Promise<Piece | null>;
  findPieceBySourcePath(path: string): Promise<Piece | null>;
  putPiece(piece: Piece): Promise<void>;
  addVersion(pieceId: string, text: string, analysis: Analysis): Promise<Version>;   // throws if the piece is unknown
  listVersions(pieceId: string): Promise<Array<Pick<Version, 'id' | 'savedAt'>>>;   // newest first
  getVersion(pieceId: string, versionId: string): Promise<Version | null>;
  latestVersion(pieceId: string): Promise<Version | null>;
  addNote(input: Omit<Note, 'id' | 'createdAt'>): Promise<Note>;
  listNotes(pieceId: string): Promise<Note[]>;                // oldest first
}
// src/server/fileStore.ts
export function fileStore(dataDir: string): Store
```
Layout under `dataDir`: `pieces/<id>.json`, `versions/<pieceId>/<id>.json`, `notes/<pieceId>.json` (an array). Every write goes to a temp file in the same folder, then is renamed. IDs come from `crypto.randomUUID()`. Files are UTF-8 JSON, so Arabic is stored as written.

- [ ] **Step 1: Write the failing tests** (each uses a fresh `mkdtemp` folder):
  - `put then get round-trips a piece with Arabic text` (`text: 'القمر يجذب المدّ'`)
  - `listVersions is newest first and latestVersion matches it`
  - `addVersion for an unknown piece throws`
  - `notes keep insertion order and get unique ids`
  - `findPieceBySourcePath finds an imported piece`
  - `a fresh store over the same folder sees earlier writes`
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: store interface and file store`.

### Task 7: Config, service and HTTP API

**Files:**
- Create: `src/server/config.ts`, `src/server/auth.ts`, `src/server/queue.ts`, `src/server/service.ts`, `src/server/api.ts`, `src/server/app.ts`, `src/server/main.ts`, `src/server/fixtureProvider.ts`
- Test: `tests/server/config.test.ts`, `tests/server/service.test.ts`, `tests/server/api.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 6.
- Produces:
```ts
// config.ts
export interface Config { host: string; port: number; token: string; dataDir: string; maxChars: number;
  local: { baseUrl: string; model: string }; cloud?: { baseUrl: string; model: string; apiKey: string }; fixtureAnalysisPath?: string }
export function loadConfig(env: Record<string, string | undefined>): Config
// auth.ts
export function requireToken(token: string): express.RequestHandler
// queue.ts
export type SerialQueue = <T>(job: () => Promise<T>) => Promise<T>;
export function serialQueue(): SerialQueue
// service.ts
export interface NoteView extends Note { range: Range | null }          // null shows as "passage gone"
export interface PieceView { piece: Piece; version: Version | null; structure: Structure | null; jumps: Jump[]; notes: NoteView[] }
export interface Service {
  listPieces(): Promise<PieceSummary[]>;
  createPiece(input: { title: string; text: string; privacy?: Privacy; source?: Piece['source'] }): Promise<Piece>;
  updateText(pieceId: string, text: string): Promise<Piece>;
  setPrivacy(pieceId: string, privacy: Privacy): Promise<Piece>;
  analyze(pieceId: string): Promise<Version>;                          // analyses piece.text, saves a version; queued
  readPiece(pieceId: string, versionId?: string): Promise<PieceView | null>;   // latest version when versionId is omitted
  addNote(input: { pieceId: string; author: string; body: string; quote: string; prefix?: string; suffix?: string }): Promise<Note>;
}
export class NotFoundError extends Error {}
export function createService(deps: { store: Store; providers: { local: ModelProvider; cloud?: ModelProvider }; maxChars: number; queue: SerialQueue }): Service
// api.ts
export function apiRouter(service: Service): express.Router
// app.ts
export function buildApp(config: Config, service: Service): express.Express
// fixtureProvider.ts  (dev only: UI work without a GPU)
export function fixtureProvider(path: string): ModelProvider   // kind 'local', name 'fixture', returns the file's contents
```

`loadConfig` rules:
- `TL_TOKEN` is required and must be 24+ characters, else it throws `TL_TOKEN must be set (24+ characters)`.
- `TL_HOST` defaults to `127.0.0.1`. The values `0.0.0.0`, `::` and an empty string throw `Refusing to listen on all interfaces; set TL_HOST to the Tailscale address or 127.0.0.1`.
- `TL_PORT` defaults to `4390`, `TL_DATA_DIR` to `./data`, and `TL_MAX_CHARS` to `24000`.
- `TL_LOCAL_BASE_URL` defaults to `http://127.0.0.1:1234/v1`. `TL_LOCAL_MODEL` is required unless `TL_FIXTURE_ANALYSIS` is set.
- The cloud provider is on only when `TL_CLOUD_BASE_URL`, `TL_CLOUD_MODEL` and `TL_CLOUD_API_KEY` are all set. A partial set throws.

`requireToken` compares with `crypto.timingSafeEqual` (lengths checked first) and answers 401 `{ "error": "unauthorized" }`.

`createService`:
- `analyze` runs `analyzePiece(providerFor(piece.privacy, providers), piece.text, { maxChars })` inside the queue, then `store.addVersion`.
- `readPiece` computes `deriveStructure` and `findJumps` from the shown version. It resolves every note with `resolveAnchor` against the shown version's text, or against `piece.text` when there is no version.
- `addNote` locates `quote` with `findPassage` in the latest version's text (or `piece.text`), builds the anchor with `makeAnchor`, and throws `NotFoundError('That quote is not in the piece')` when it is missing.

`main.ts` loads `.env` with dotenv, builds the providers from config (the fixture provider replaces `local` when `TL_FIXTURE_ANALYSIS` is set), and listens on `host:port`.

Routes. All take and return JSON, and `buildApp` mounts them under `/api` behind `requireToken`:
- `GET /api/pieces`
- `POST /api/pieces` with `{ title, text, privacy? }`
- `GET /api/pieces/:id?version=`
- `PUT /api/pieces/:id/text` with `{ text }`
- `PUT /api/pieces/:id/privacy` with `{ privacy }`
- `POST /api/pieces/:id/analyze`
- `GET /api/pieces/:id/versions`
- `POST /api/pieces/:id/notes` with `{ author, body, quote, prefix?, suffix? }`

Errors:
- `NotFoundError` and an unknown piece give 404.
- `AnalysisError` gives 422.
- `ProviderError` gives 502.
- Every error body is `{ error: message }`.

`buildApp` sets a JSON body limit of 2mb and serves `dist/web` statically at `/` with no auth. The page itself holds no data; the token gates the data.

- [ ] **Step 1: Write the failing tests**

```ts
// config.test.ts
test('refuses to listen on all interfaces', () => {
  expect(() => loadConfig({ TL_TOKEN: 'x'.repeat(24), TL_LOCAL_MODEL: 'm', TL_HOST: '0.0.0.0' })).toThrow(/all interfaces/);
});
test('needs a long token', () => { expect(() => loadConfig({ TL_LOCAL_MODEL: 'm', TL_TOKEN: 'short' })).toThrow(/24\+/); });
test('a half-set cloud provider is an error', () => {
  expect(() => loadConfig({ TL_TOKEN: 'x'.repeat(24), TL_LOCAL_MODEL: 'm', TL_CLOUD_BASE_URL: 'https://c' })).toThrow();
});
// service.test.ts  (in-memory: fileStore over mkdtemp)
test('a private piece is analysed locally even when a cloud key is set', async () => {
  const local = fakeProvider([ok()], 'local'), cloud = fakeProvider([ok()], 'cloud');
  const svc = createService({ store, providers: { local, cloud }, maxChars: 24000, queue: serialQueue() });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  await svc.analyze(p.id);
  expect([local.calls.length, cloud.calls.length]).toEqual([1, 0]);
});
test('a note follows its passage into an edited text, and shows as gone when the passage is deleted', async () => { /* addNote on 'So we fly', updateText inserting a line before it -> range shifts; updateText removing it -> range null */ });
test('a note on a quote that is not in the piece is refused', async () => { /* rejects NotFoundError */ });
test('two analyses at once both save, one after the other', async () => {   // Review Focus 4
  const svc = /* local fake with [ok(), ok()] */;
  await Promise.all([svc.analyze(id), svc.analyze(id)]);
  expect(await store.listVersions(id)).toHaveLength(2);
});
// api.test.ts  (supertest against buildApp)
test('no token, no data', async () => { await request(app).get('/api/pieces').expect(401); });
test('a dead model gives 502 naming the address', async () => { /* local fake throws ProviderError('Model at http://127.0.0.1:1234/v1 unreachable') -> 502, body.error matches /127\.0\.0\.1:1234/ */ });
test('unknown piece is 404', async () => { await request(app).get('/api/pieces/nope').set(auth).expect(404); });
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement config, auth, queue, service, api, app, main and the fixture provider.**
- [ ] **Step 4: Run, expect PASS.** Then `TL_TOKEN=... TL_FIXTURE_ANALYSIS=tests/fixtures/sample-analysis.json npm start`, followed by `curl -H "Authorization: Bearer ..." localhost:4390/api/pieces`. Expected: `[]`. Create the fixture pair `tests/fixtures/sample-piece.txt` and `sample-analysis.json` here. Use an original short paragraph, half English and half Arabic, about the moon and the tides, with one deliberate overstated claim and one dead end. **Never use his writing.**
- [ ] **Step 5: Commit** `feat(server): config, service and token-gated API`.

### Task 8: MCP server for the readers in the margin

**Files:**
- Create: `src/server/mcp.ts`
- Modify: `src/server/app.ts` (mount it)
- Test: `tests/server/mcp.test.ts`

**Interfaces:**
- Consumes: `Service`, `PieceView` (Task 7).
- Produces: `export function mountMcp(app: express.Express, service: Service): void` exposes Streamable HTTP in stateless mode at `POST /mcp` (a new `McpServer` and transport per request), behind `requireToken`. It has five tools, each with a zod input schema. Each tool returns one text content item holding JSON:
  - `list_pieces({})` returns `PieceSummary[]`.
  - `read_piece({ pieceId, versionId? })` returns the `PieceView`, flattened for reading: text, stations each with `jump` (excess or null) and `flags` (`interchange`, `deadEnd`, `inLoop`, `unanchored`), motifs in order, and notes with author, body, quote and `gone: boolean`.
  - `analyze_piece({ pieceId })` returns the same shape as `read_piece`, for the new version.
  - `analyze_text({ title, text, privacy? })`, where `privacy` defaults to `'private'`. It creates a piece with source `{ kind: 'agent' }`, analyses it, and returns the `read_piece` shape. It is for an agent's own drafts.
  - `add_note({ pieceId, author, body, quote, prefix?, suffix? })` returns the `Note`. A missing quote is a tool error with the `NotFoundError` message.

  Tool descriptions tell the agent: quote the passage exactly as it appears; `author` is your own name (for example `claude-qalam`, `claude-echo`); notes are read by Yousef.

- [ ] **Step 1: Write the failing test.** Start `buildApp` on port 0 with a fixture-backed service. Connect the SDK `Client` through `StreamableHTTPClientTransport`, with `requestInit: { headers: { Authorization: 'Bearer …' } }`.
  - `listTools` returns exactly the five names.
  - `analyze_text`, then `add_note` (author `claude-test`), then `read_piece` shows that note with `gone: false`.
  - `add_note` with an absent quote returns `isError: true`.
  - A client without the header fails to connect (401).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement and mount.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Check the PC's local agent harness.** Find out whether it can use an HTTP MCP server with a header. If it only supports stdio, note in the README that it connects through `npx mcp-remote http://<host>:4390/mcp --header "Authorization: Bearer ${TL_TOKEN}"`; no extra code is needed. Ask Yousef where the harness lives if it is not obvious. Do not name it in the public repo.
- [ ] **Step 6: Commit** `feat(server): MCP tools for margin notes`.

### Task 9: Folder import

**Files:**
- Create: `src/server/import.ts`, `scripts/import.ts`
- Test: `tests/server/import.test.ts`

**Interfaces:**
- Consumes: `Service`, `Store` (Tasks 6 and 7).
- Produces:
```ts
export function extractText(filePath: string): Promise<{ title: string; text: string } | null>   // .md .txt .html .htm .docx; anything else -> null
export function importFolder(deps: { service: Service; store: Store }, folder: string, opts: { privacy: Privacy; analyze?: boolean }): Promise<{ created: number; updated: number; skipped: number; failed: Array<{ path: string; error: string }> }>
```
Title rules by file type:
- **.md:** the first `# ` heading, otherwise the file name without extension.
- **.txt:** the file name.
- **.html:** the `<article>` element if present, otherwise `<body>`. Drop `script`, `style`, `nav`, `header` and `footer`. The title is the first `<h1>`, otherwise `<title>`, otherwise the file name. Use node-html-parser and keep paragraph breaks as blank lines.
- **.docx:** `mammoth.extractRawText`; the title is the file name.

The walk is recursive. A file whose absolute path is already stored is updated if its text changed and skipped otherwise. A new file is created with `source: { kind: 'import', path }` and `opts.privacy`. `analyze: true` analyses each created or updated piece through the service queue. A file that fails is recorded in `failed` and the run continues.

CLI: `npm run import -- <folder> [--public] [--analyze]`. It defaults to private and prints the counts. For site posts, point it at the site repo's `writing/` folder with `--public`.

- [ ] **Step 1: Write the failing tests** (`mkdtemp` fixtures):
  - `imports md, html and txt, ignores png` gives created 3; the html piece's text excludes the nav text and its title is the `<h1>`.
  - `a second run skips unchanged files` gives skipped 3.
  - `an edited file updates` gives updated 1.
  - `docx text is extracted`, with the fixture written in the test using the `docx` dev package.
  - `imported pieces are private unless --public`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat: folder import for md, txt, html and docx`.

### Task 10: Web app shell

**Files:**
- Create: `src/web/main.tsx`, `src/web/App.tsx`, `src/web/api.ts`, `src/web/index.css`, `src/web/components/TokenGate.tsx`, `src/web/components/PieceList.tsx`, `src/web/components/PieceEditor.tsx`
- Modify: `index.html`, `vite.config.ts` (root `src/web`, `build.outDir` `../../dist/web`, dev proxy `/api` to `http://127.0.0.1:4390`)
- Test: `tests/web/api.test.ts`, `tests/web/PieceEditor.test.tsx`

**Interfaces:**
- Consumes: the HTTP API (Task 7).
- Produces:
```ts
// api.ts
export function getToken(): string | null              // localStorage 'tl.token', reads wrapped in try/catch
export function setToken(t: string): void
export class ApiError extends Error { constructor(message: string, readonly status: number) }
export const api: {
  listPieces(): Promise<PieceSummary[]>;
  createPiece(b: { title: string; text: string; privacy?: Privacy }): Promise<Piece>;
  readPiece(id: string, versionId?: string): Promise<PieceView>;
  updateText(id: string, text: string): Promise<Piece>;
  setPrivacy(id: string, privacy: Privacy): Promise<Piece>;
  analyze(id: string): Promise<Version>;
  addNote(id: string, b: { body: string; quote: string; prefix?: string; suffix?: string }): Promise<Note>;   // author 'yousef'
}
```
Layout:
- **Left:** the piece list with a privacy badge on each piece and a "New piece" button.
- **Centre:** the editor. It has a title, a textarea with `dir="auto"`, and a privacy toggle that shows Private or Public. "Save and analyse" saves the text and then runs the analysis.
- **Right:** two tabs, **Logic** and **Thought**. Each shows a placeholder until Tasks 11 and 12.

`TokenGate` asks for the token once. Fonts are a system stack with an Arabic-capable fallback (for example `system-ui, "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif`), with no web fonts. Types are imported from `src/core`.

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment jsdom
test('every call carries the token', async () => { /* setToken('t'); stub fetch; api.listPieces(); expect header Authorization 'Bearer t' */ });
test('a failed analysis shows the error and keeps the text', async () => {   // Review Focus 5
  /* render PieceEditor with api.analyze rejecting new ApiError('Model at http://127.0.0.1:1234/v1 unreachable', 502);
     type into the textarea, click "Save and analyse";
     expect screen.getByRole('alert') to contain '127.0.0.1:1234'; expect the textarea value unchanged */
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.** Then run `npm run dev:server` with the fixture provider, alongside `npm run dev:web`. Open the app in the browser, enter the token, create a piece from `tests/fixtures/sample-piece.txt`, and click "Save and analyse". Expected: no console errors; the piece appears in the list with a Private badge.
- [ ] **Step 5: Commit** `feat(web): app shell, token gate and editor`.

### Task 11: The Logic map

**Files:**
- Create: `src/web/layout/logicLayout.ts`, `src/web/components/LogicMap.tsx`
- Modify: `src/web/App.tsx` (Logic tab)
- Test: `tests/web/logicLayout.test.ts`, `tests/web/LogicMap.test.tsx`

**Interfaces:**
- Consumes: `Analysis`, `Structure`, `Jump`, `textDirection`, `findPassage`.
- Produces:
```ts
export interface LaidOutStation { id: string; x: number; y: number; station: Station; isInterchange: boolean; isDeadEnd: boolean; inLoop: boolean; jump: Jump | null; noteCount: number }
export interface LaidOutLink { from: string; to: string; points: Array<{ x: number; y: number }>; required: boolean; intoJump: boolean; inLoop: boolean }
export interface LogicLayout { stations: LaidOutStation[]; links: LaidOutLink[]; width: number; height: number }
export function layoutLogic(analysis: Analysis, structure: Structure, jumps: Jump[], noteCounts: Record<string, number>): LogicLayout
export function LogicMap(props: { view: PieceView; noteCounts: Record<string, number>; onSelectRange(r: Range | null): void }): JSX.Element
```
`layoutLogic` uses `@dagrejs/dagre` with `rankdir: 'LR'`. It reads like a transit map: claims are stations and supports are lines.

Each state is drawn in a way that does not rely on colour alone:
- **Interchange:** a double ring.
- **Dead end:** a hollow station with an end bar.
- **Loop:** links drawn as a returning arc.
- **Unanchored:** a dotted outline, titled "Not found in the text".
- **Jump:** the link into the station is dashed, with a badge reading `+0.21 over`, using `excess` to 2 dp.
- **Required and optional supports:** solid and thin lines.
- **Notes:** a note count badge.

Labels are SVG `<text>` with `direction` and `text-anchor` set from `textDirection(claim)`. Clicking a station calls `onSelectRange(findPassage(text, station.passage))`, and the editor highlights the passage. Every station has an `aria-label` that lists its claim and flags.

- [ ] **Step 1: Write the failing tests:**
  - `every station and link is laid out`.
  - `links into a jumping station are marked intoJump`.
  - `dead-end and interchange flags carry through`.
  - `a loop lays out without throwing`.
  - (render) `the jump badge reads "+0.35 over"`, and `clicking a station selects its passage`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.** Then open the fixture piece's Logic tab in the browser and take a screenshot. Expected: the overstated claim shows a dashed link with a badge, the dead end shows its end bar, and the Arabic labels read right to left.
- [ ] **Step 5: Commit** `feat(web): Logic map`.

### Task 12: The Thought path and the notes margin

**Files:**
- Create: `src/web/layout/thoughtLayout.ts`, `src/web/layout/notes.ts`, `src/web/components/ThoughtPath.tsx`, `src/web/components/NotesMargin.tsx`
- Modify: `src/web/App.tsx`, `src/web/components/PieceEditor.tsx` (select text, then "Add note")
- Test: `tests/web/thoughtLayout.test.ts`, `tests/web/notes.test.ts`

**Interfaces:**
- Consumes: `MotifMention`, `Station`, `NoteView`, `findPassage`, `api.addNote`.
- Produces:
```ts
export interface ThoughtNode { motif: string; label: string; index: number; mentions: number }
export interface ThoughtStep { from: string; to: string; kind: 'forward' | 'return' }
export function layoutThought(motifs: MotifMention[]): { nodes: ThoughtNode[]; steps: ThoughtStep[]; endMotif: string | null }
export function notesByStation(text: string, stations: Station[], notes: NoteView[]): Record<string, number>   // overlap of note range and station passage range
export function ThoughtPath(props: { view: PieceView; onSelectRange(r: Range | null): void }): JSX.Element
export function NotesMargin(props: { notes: NoteView[]; onSelectRange(r: Range | null): void }): JSX.Element
```
`layoutThought` places nodes in order of first appearance; a node's `label` is the label of its first mention. It walks the mentions in `order`, skips a mention whose motif repeats the previous one, and makes a step to an already-seen motif a `return`, otherwise a `forward`. `endMotif` is the last mention's motif.

Draw the forward steps as one line, returns as arcs back over it, and the end as a terminus. Clicking a node selects its first mention's passage.

The margin lists each note with its author, body and quote. A note whose `range` is null shows "Passage gone". Clicking a note selects its range.

- [ ] **Step 1: Write the failing tests**

```ts
test('returns to an earlier image are returns', () => {
  const m = ['sun','wings','sun','star'].map((motif, order) => ({ motif, label: motif, passage: motif, order }));
  expect(layoutThought(m)).toEqual({
    nodes: [{ motif:'sun',label:'sun',index:0,mentions:2 }, { motif:'wings',label:'wings',index:1,mentions:1 }, { motif:'star',label:'star',index:2,mentions:1 }],
    steps: [{ from:'sun',to:'wings',kind:'forward' }, { from:'wings',to:'sun',kind:'return' }, { from:'sun',to:'star',kind:'forward' }],
    endMotif: 'star',
  });
});
test('the same image in two languages is one node', () => {
  const r = layoutThought([{ motif:'moon',label:'moon',passage:'moon',order:0 }, { motif:'moon',label:'القمر',passage:'القمر',order:1 }]);
  expect(r.nodes).toEqual([{ motif:'moon', label:'moon', index:0, mentions:2 }]);
});
test('a note counts on the station whose passage it overlaps', () => { /* text 'The sun gives. So we fly.'; station passage 'So we fly'; note range over 'we fly' -> { s2: 1 } */ });
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.** In the browser, add a note through `add_note` over MCP (with `author: 'claude-test'`) and one through the UI. Expected: both show in the margin with their authors and badge the right station. Edit the text to delete one note's passage, save and analyse, and that note shows "Passage gone". Take a screenshot of the Thought tab.
- [ ] **Step 5: Commit** `feat(web): Thought path and notes margin`.

### Task 13: README, model evaluation, and first real run on the PC

**Files:**
- Create: `README.md` (replace), `scripts/eval-models.ts`, `docs/screenshot.png`
- Test: none (the pass bar is Yousef's marks; see the spec's "Judging quality")

**Interfaces:**
- Consumes: `analyzePiece`, `openAICompatible`, `deriveStructure`, `findJumps`.
- Produces: `npm run eval`. It reads `eval/samples.local.json` (gitignored), which holds `[{ "path": "...", "label": "..." }]`, and `TL_EVAL_MODELS` (comma-separated model ids on `TL_LOCAL_BASE_URL`). For each sample and model it writes `eval/out/<model>/<label>.json`. It also writes `eval/out/REVIEW.md`. For each sample, that file lists each model's station count, jumps, dead ends, loops, the motif path and the time taken, then two checkboxes: `Logic right?` and `Thought right?`. Everything under `eval/` stays on the PC.

- [ ] **Step 1: Write the README.** Cover what v2 is (a local tool; it needs your own local model, and optionally a key for public pieces), install, a `.env` walkthrough, running on a Tailscale address, importing a folder, and connecting an agent: `claude mcp add --transport http thought-line http://<tailscale-ip>:4390/mcp --header "Authorization: Bearer <token>"`, plus the `mcp-remote` route from Task 8. Add a line that the public bring-your-own-key version is planned, and the screenshot from Task 11. No em-dashes.
- [ ] **Step 2: Write `scripts/eval-models.ts` and run it once against the fixture provider.** Expected: it writes `eval/out/fixture/<label>.json` and a `REVIEW.md`.
- [ ] **Step 3: On the PC: install, set `.env` (host = the PC's Tailscale address), and pick 3 candidate models that fit 12 GB VRAM** with room for an 8k+ context, served by LM Studio's OpenAI-compatible server. Choose candidates for good Arabic and good structured output, and record why each was picked in `REVIEW.md`.
- [ ] **Step 4: Ask Yousef to name 5 to 6 pieces** (mixed personal and site posts) and list them in `eval/samples.local.json`. Run `npm run eval`. Expected: `REVIEW.md` with maps for every sample and model, and no crashes.
- [ ] **Step 5: Yousef marks `REVIEW.md`.** Set `TL_LOCAL_MODEL` to the model with the most marks; if it is tied, the faster one wins. Record the choice and the tally (no text from the pieces) in the README's "Model" section.
- [ ] **Step 6: Start the service on the PC, import his writing folder (private) and the site's `writing/` folder (`--public`), and connect Claude on both machines over MCP.** Expected: `list_pieces` from the laptop's Claude returns his pieces.
- [ ] **Step 7: Commit** `docs: README and model evaluation` (only the README, the script and the screenshot; check `git status` shows nothing from `data/` or `eval/`).
