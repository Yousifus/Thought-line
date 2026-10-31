// Tests for the MCP server: the five tools over real HTTP with the SDK client, the token gate, error mapping, and toReading.
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import request from 'supertest';
import { AnalysisError, ProviderError, deriveStructure, findJumps } from '../../src/core';
import type { Analysis, PieceView } from '../../src/core';
import { buildApp } from '../../src/server/app';
import type { Config } from '../../src/server/config';
import { fileStore } from '../../src/server/fileStore';
import { toReading } from '../../src/server/mcp';
import { serialQueue } from '../../src/server/queue';
import { createService } from '../../src/server/service';
import type { Service } from '../../src/server/service';
import { fakeProvider } from '../helpers/fakeProvider';

const fixtures = path.resolve(__dirname, '../fixtures');
const TEXT = fs.readFileSync(path.join(fixtures, 'sample-piece.txt'), 'utf8');
const ok = () => fs.readFileSync(path.join(fixtures, 'sample-analysis.json'), 'utf8');

const TOKEN = 'a-long-throwaway-token-for-tests-0123456789';
const config: Config = {
  host: '127.0.0.1', port: 0, token: TOKEN, dataDir: '', maxChars: 24000,
  local: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'm' },
};

let dir: string;
const closers: Array<() => Promise<unknown>> = [];
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-mcp-')); });
afterEach(async () => {
  while (closers.length) await closers.pop()!();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function realService(responses: Array<string | Error>): Service {
  return createService({
    store: fileStore(dir), providers: { local: fakeProvider(responses) }, maxChars: 24000, queue: serialQueue(),
  });
}

/** Listens on port 0 of the loopback address and closes with the test. */
async function listen(service: Service): Promise<string> {
  const server = buildApp(config, service).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  closers.push(() => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
}

async function connect(url: string, headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }): Promise<Client> {
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
  closers.push(() => client.close());
  return client;
}

/** The one text item of a tool result, parsed. */
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text: string }>;
  expect(content).toHaveLength(1);
  expect(content[0].type).toBe('text');
  return { isError: res.isError === true, text: content[0].text, json: () => JSON.parse(content[0].text) };
}

describe('the tools over HTTP', () => {
  test('listTools returns exactly the five tools, each with a description', async () => {
    const client = await connect(await listen(realService([])));
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(['add_note', 'analyze_piece', 'analyze_text', 'list_pieces', 'read_piece']);
    for (const t of tools) expect(t.description?.length).toBeGreaterThan(40);
  });

  test('analyze_text, add_note, read_piece: the note comes back with gone: false', async () => {
    const client = await connect(await listen(realService([ok()])));
    const made = await call(client, 'analyze_text', { title: 'Tides', text: TEXT });
    expect(made.isError).toBe(false);
    const reading = made.json();
    expect(reading.privacy).toBe('private');
    expect(reading.stations.map((s: { id: string }) => s.id)).toEqual(['s1', 's2', 's3', 's4']);

    const noted = await call(client, 'add_note', {
      pieceId: reading.pieceId, author: 'claude-test', body: 'This leap is large.', quote: 'The moon therefore rules every living thing',
    });
    expect(noted.isError).toBe(false);
    expect(noted.json()).toMatchObject({ author: 'claude-test', body: 'This leap is large.' });

    const read = (await call(client, 'read_piece', { pieceId: reading.pieceId })).json();
    expect(read.notes).toHaveLength(1);
    expect(read.notes[0]).toMatchObject({
      author: 'claude-test', body: 'This leap is large.', quote: 'The moon therefore rules every living thing', gone: false,
    });
    const s3 = read.stations.find((s: { id: string }) => s.id === 's3');
    expect(s3.jump).toBeGreaterThan(0);
    expect(read.stations.find((s: { id: string }) => s.id === 's1').jump).toBeNull();
    expect(read.stations.find((s: { id: string }) => s.id === 's4').flags.deadEnd).toBe(true);
  });

  test('analyze_text files the piece as an agent draft, private unless asked', async () => {
    const service = realService([ok(), ok()]);
    const client = await connect(await listen(service));
    const a = (await call(client, 'analyze_text', { title: 'a', text: TEXT })).json();
    const b = (await call(client, 'analyze_text', { title: 'b', text: TEXT, privacy: 'public' })).json();
    expect((await service.readPiece(a.pieceId))!.piece).toMatchObject({ privacy: 'private', source: { kind: 'agent' } });
    expect((await service.readPiece(b.pieceId))!.piece).toMatchObject({ privacy: 'public', source: { kind: 'agent' } });
  });

  test('list_pieces lists summaries, and analyze_piece gives a new version in the same shape', async () => {
    const client = await connect(await listen(realService([ok(), ok()])));
    const first = (await call(client, 'analyze_text', { title: 'Tides', text: TEXT })).json();
    const list = (await call(client, 'list_pieces', {})).json();
    expect(list).toEqual([expect.objectContaining({ id: first.pieceId, title: 'Tides', versionCount: 1 })]);

    const again = (await call(client, 'analyze_piece', { pieceId: first.pieceId })).json();
    expect(Object.keys(again).sort()).toEqual(Object.keys(first).sort());
    expect(again.versionId).not.toBe(first.versionId);
    // Reading an older version by id still works.
    const old = (await call(client, 'read_piece', { pieceId: first.pieceId, versionId: first.versionId })).json();
    expect(old.versionId).toBe(first.versionId);
  });

  test('add_note with an absent quote is a tool error carrying the message', async () => {
    const client = await connect(await listen(realService([ok()])));
    const made = (await call(client, 'analyze_text', { title: 't', text: TEXT })).json();
    const res = await call(client, 'add_note', { pieceId: made.pieceId, author: 'claude-test', body: 'x', quote: 'this is nowhere in the piece' });
    expect(res.isError).toBe(true);
    expect(res.text).toBe('That quote is not in the piece');
  });

  test('an unknown piece or version is a tool error, not a crash', async () => {
    const client = await connect(await listen(realService([ok()])));
    const missing = await call(client, 'read_piece', { pieceId: 'nope' });
    expect(missing).toMatchObject({ isError: true, text: 'Piece not found' });
    const made = (await call(client, 'analyze_text', { title: 't', text: TEXT })).json();
    const noVersion = await call(client, 'read_piece', { pieceId: made.pieceId, versionId: 'no-such-version' });
    expect(noVersion).toMatchObject({ isError: true, text: 'Piece or version not found' });
    expect((await call(client, 'analyze_piece', { pieceId: 'nope' })).isError).toBe(true);
  });

  test('inputs are validated: a blank author, an oversize body and a missing quote are refused', async () => {
    const service = realService([ok()]);
    const client = await connect(await listen(service));
    const made = (await call(client, 'analyze_text', { title: 't', text: TEXT })).json();
    const base = { pieceId: made.pieceId, author: 'claude-test', body: 'fine', quote: 'The moon pulls on the sea' };
    for (const bad of [{ author: '   ' }, { author: 'x'.repeat(65) }, { body: '' }, { body: 'x'.repeat(4001) }, { quote: '' }, { quote: 'x'.repeat(2001) }]) {
      const res = await client.callTool({ name: 'add_note', arguments: { ...base, ...bad } }).then(r => r, () => ({ isError: true }));
      expect(res.isError).toBe(true);
    }
    expect((await service.readPiece(made.pieceId))!.notes).toHaveLength(0);
    // Trimmed author is stored trimmed.
    await call(client, 'add_note', { ...base, author: '  claude-echo  ' });
    expect((await service.readPiece(made.pieceId))!.notes[0].author).toBe('claude-echo');
  });
});

describe('error mapping', () => {
  const stub = (over: Partial<Service>): Service => ({ ...realService([]), ...over });

  test('analysis and provider errors become tool errors with their message', async () => {
    const client = await connect(await listen(stub({
      analyze: async () => { throw new AnalysisError('the model said no'); },
      readPiece: async () => { throw new ProviderError('upstream is down'); },
    })));
    expect(await call(client, 'analyze_piece', { pieceId: 'p' })).toMatchObject({ isError: true, text: 'the model said no' });
    expect(await call(client, 'read_piece', { pieceId: 'p' })).toMatchObject({ isError: true, text: 'upstream is down' });
  });

  test('a provider error message never carries a bearer token', async () => {
    const client = await connect(await listen(stub({
      analyze: async () => { throw new ProviderError('401 for Bearer sk-secret-123 at the endpoint'); },
    })));
    const res = await call(client, 'analyze_piece', { pieceId: 'p' });
    expect(res.isError).toBe(true);
    expect(res.text).not.toContain('sk-secret-123');
  });

  test('any other error is "Internal error", logged, and leaks nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = await connect(await listen(stub({
      listPieces: async () => { throw new Error(`ENOENT: no such file C:\\secret\\${TOKEN}`); },
    })));
    const res = await call(client, 'list_pieces', {});
    expect(res).toMatchObject({ isError: true, text: 'Internal error' });
    expect(spy).toHaveBeenCalled();
  });
});

describe('the gate and the transport', () => {
  test('a client without the header cannot connect (401)', async () => {
    const url = await listen(realService([]));
    await expect(connect(url, {})).rejects.toThrow(/401|unauthorized/i);
    await expect(connect(url, { Authorization: 'Bearer wrong' })).rejects.toThrow(/401|unauthorized/i);
  });

  test('an unauthenticated caller is turned away before the body is read', async () => {
    const app = buildApp(config, realService([]));
    await request(app).post('/mcp').set('Content-Type', 'application/json').send('{not json').expect(401);
    await request(app).get('/mcp').expect(401);
    await request(app).delete('/mcp').expect(401);
  });

  test('GET and DELETE answer 405 in stateless mode, and the reply is not cached', async () => {
    const app = buildApp(config, realService([]));
    const auth = { Authorization: `Bearer ${TOKEN}` };
    const get = await request(app).get('/mcp').set(auth).expect(405);
    expect(get.headers['cache-control']).toBe('no-store');
    await request(app).delete('/mcp').set(auth).expect(405);
  });

  test('a malformed body from an authenticated caller is a 400 JSON-RPC error', async () => {
    const app = buildApp(config, realService([]));
    const res = await request(app).post('/mcp').set({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }).send('{not json').expect(400);
    expect(res.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32700 } });
  });
});

describe('toReading', () => {
  const analysis: Analysis = {
    stations: [
      { id: 'a', claim: 'A', passage: 'pa', role: 'premise', expressed: 0.9, grounding: 'assertion' },
      { id: 'b', claim: 'B', passage: 'pb', role: 'step', expressed: 0.5, grounding: 'evidence', unanchored: true },
      { id: 'c', claim: 'C', passage: 'pc', role: 'step', expressed: 0.5, grounding: 'evidence' },
      { id: 'd', claim: 'D', passage: 'pd', role: 'conclusion', expressed: 0.5, grounding: 'evidence' },
    ],
    // b and c support each other (a loop); a and c both feed d (an interchange); a has nothing built on it except b.
    links: [
      { from: 'a', to: 'b', required: true },
      { from: 'b', to: 'c', required: true },
      { from: 'c', to: 'b', required: false },
      { from: 'c', to: 'd', required: true },
      { from: 'a', to: 'd', required: false },
    ],
    motifs: [
      { motif: 'moon', label: 'القمر', passage: 'x', order: 2 },
      { motif: 'sea', label: 'sea', passage: 'y', order: 0, unanchored: true },
      { motif: 'tide', label: 'tide', passage: 'z', order: 1 },
    ],
    language: 'mixed', model: 'm', createdAt: '2026-10-31T00:00:00.000Z',
  };
  const piece = { id: 'p1', title: 'T', privacy: 'public' as const, text: 'edited since', createdAt: 'c', updatedAt: 'u' };
  const version = { id: 'v1', pieceId: 'p1', savedAt: 's', text: 'the analysed text', analysis };
  const view: PieceView = {
    piece, version, structure: deriveStructure(analysis), jumps: findJumps(analysis),
    notes: [
      { id: 'n1', pieceId: 'p1', author: 'claude-test', body: 'here', createdAt: 'n', anchor: { quote: 'analysed', prefix: 'the ', suffix: ' text', start: 4 }, range: { start: 4, end: 12 } },
      { id: 'n2', pieceId: 'p1', author: 'claude-echo', body: 'lost', createdAt: 'n', anchor: { quote: 'deleted', prefix: '', suffix: '', start: 0 }, range: null },
    ],
  };

  test('flattens a view into stations with jump and flags, ordered motifs and notes with gone', () => {
    const r = toReading(view);
    expect(r).toMatchObject({ pieceId: 'p1', title: 'T', privacy: 'public', versionId: 'v1', text: 'the analysed text', stale: true, language: 'mixed' });
    const by = Object.fromEntries(r.stations.map(s => [s.id, s]));
    expect(by.b.flags).toEqual({ interchange: true, deadEnd: false, inLoop: true, unanchored: true });
    expect(by.c.flags.inLoop).toBe(true);
    expect(by.d.flags).toMatchObject({ interchange: true, inLoop: false, unanchored: false });
    expect(by.a.flags).toMatchObject({ inLoop: false, unanchored: false });
    expect(by.a.jump === null || typeof by.a.jump === 'number').toBe(true);
    expect(r.stations.filter(s => s.jump !== null).map(s => s.id)).toEqual(view.jumps.map(j => j.stationId));
    for (const j of view.jumps) expect(r.stations.find(s => s.id === j.stationId)!.jump).toBe(j.excess);
    expect(r.motifs.map(m => m.motif)).toEqual(['sea', 'tide', 'moon']);
    expect(r.notes).toEqual([
      { id: 'n1', author: 'claude-test', body: 'here', quote: 'analysed', createdAt: 'n', gone: false },
      { id: 'n2', author: 'claude-echo', body: 'lost', quote: 'deleted', createdAt: 'n', gone: true },
    ]);
  });

  test('a piece with no version reads as its own text with nothing derived', () => {
    const r = toReading({ piece, version: null, structure: null, jumps: [], notes: [] });
    expect(r).toMatchObject({ versionId: null, text: 'edited since', stale: false, stations: [], links: [], motifs: [], notes: [] });
  });
});
