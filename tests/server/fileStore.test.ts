// Tests for the file store: round trips, ordering, concurrency, atomic writes and path safety. Each test uses a fresh temp folder.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileStore, writeFileAtomic } from '../../src/server/fileStore';
import type { Analysis } from '../../src/core/analysis';
import type { Piece, Store } from '../../src/core/store';

let dir: string;
let store: Store;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tl-store-'));
  store = fileStore(dir);
});
afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(dir, { recursive: true, force: true });
});

const analysis = (model = 'test-model'): Analysis => ({
  stations: [], links: [], motifs: [], language: 'en', model, createdAt: '2026-01-01T00:00:00.000Z',
});
const piece = (over: Partial<Piece> = {}): Piece => ({
  id: 'p1', title: 'On rivers', privacy: 'private', text: 'The river runs to the sea.',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
});
const anchor = { quote: 'river', prefix: 'The ', suffix: ' runs', start: 4 };

test('put then get round-trips a piece with Arabic text', async () => {
  const p = piece({ title: 'القمر', text: 'القمر يجذب المدّ' });
  await store.putPiece(p);
  expect(await store.getPiece('p1')).toEqual(p);
  const raw = await fs.readFile(path.join(dir, 'pieces', 'p1.json'), 'utf8');
  expect(raw).toContain('القمر يجذب المدّ');
});

test('getPiece returns null for an unknown piece', async () => {
  expect(await store.getPiece('nope')).toBeNull();
});

test('listPieces is newest updatedAt first and counts versions', async () => {
  await store.putPiece(piece({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }));
  await store.putPiece(piece({ id: 'b', updatedAt: '2026-03-01T00:00:00.000Z' }));
  await store.addVersion('a', 'x', analysis());
  await store.addVersion('a', 'y', analysis());
  const list = await store.listPieces();
  expect(list.map(s => s.id)).toEqual(['b', 'a']);
  expect(list.map(s => s.versionCount)).toEqual([0, 2]);
  expect(Object.keys(list[0]).sort()).toEqual(['id', 'privacy', 'title', 'updatedAt', 'versionCount']);
});

test('listVersions is newest first and latestVersion matches it', async () => {
  await store.putPiece(piece());
  const v1 = await store.addVersion('p1', 'one', analysis());
  const v2 = await store.addVersion('p1', 'two', analysis());
  const v3 = await store.addVersion('p1', 'three', analysis());
  const list = await store.listVersions('p1');
  expect(list.map(v => v.id)).toEqual([v3.id, v2.id, v1.id]);
  expect((await store.latestVersion('p1'))?.id).toBe(v3.id);
  expect(await store.getVersion('p1', v2.id)).toEqual(v2);
  expect(v1).toMatchObject({ pieceId: 'p1', text: 'one' });
  expect(Object.keys(v1).sort()).toEqual(['analysis', 'id', 'pieceId', 'savedAt', 'text']);
});

test('versions of an unknown or empty piece', async () => {
  await store.putPiece(piece());
  expect(await store.listVersions('p1')).toEqual([]);
  expect(await store.latestVersion('p1')).toBeNull();
  expect(await store.getVersion('p1', 'missing')).toBeNull();
  expect(await store.listVersions('ghost')).toEqual([]);
});

test('addVersion for an unknown piece throws', async () => {
  await expect(store.addVersion('ghost', 'x', analysis())).rejects.toThrow(/unknown piece/i);
});

test('two concurrent addVersion calls give two versions, listed, with latest agreeing with the list head', async () => {
  await store.putPiece(piece());
  const [a, b] = await Promise.all([
    store.addVersion('p1', 'first', analysis('m1')),
    store.addVersion('p1', 'second', analysis('m2')),
  ]);
  expect(a.id).not.toBe(b.id);
  const list = await store.listVersions('p1');
  expect(list).toHaveLength(2);
  expect(new Set(list.map(v => v.id))).toEqual(new Set([a.id, b.id]));
  expect((await store.latestVersion('p1'))?.id).toBe(list[0].id);
});

test('versions saved in the same millisecond still order deterministically (later call is newer)', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-05T10:00:00.000Z'));
  await store.putPiece(piece());
  const made = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(t => store.addVersion('p1', t, analysis())));
  expect(new Set(made.map(v => v.savedAt)).size).toBe(1);
  const list = await store.listVersions('p1');
  expect(list.map(v => v.id)).toEqual([...made].reverse().map(v => v.id));
  expect((await store.latestVersion('p1'))?.id).toBe(made[4].id);
  // a fresh store over the same folder agrees
  expect((await fileStore(dir).listVersions('p1')).map(v => v.id)).toEqual(list.map(v => v.id));
});

test('notes keep insertion order and get unique ids', async () => {
  const n1 = await store.addNote({ pieceId: 'p1', author: 'yousef', body: 'first', anchor });
  const n2 = await store.addNote({ pieceId: 'p1', author: 'claude', body: 'ملاحظة', anchor });
  expect(n1.id).not.toBe(n2.id);
  expect(n1.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  expect(await store.listNotes('p1')).toEqual([n1, n2]);
  expect(await store.listNotes('other')).toEqual([]);
});

test('twenty concurrent addNote calls keep all twenty', async () => {
  const made = await Promise.all(
    Array.from({ length: 20 }, (_, i) => store.addNote({ pieceId: 'p1', author: 'a', body: `note ${i}`, anchor })),
  );
  const notes = await store.listNotes('p1');
  expect(notes).toHaveLength(20);
  expect(new Set(notes.map(n => n.id)).size).toBe(20);
  expect(new Set(made.map(n => n.id))).toEqual(new Set(notes.map(n => n.id)));
  expect(notes.map(n => n.body)).toEqual(Array.from({ length: 20 }, (_, i) => `note ${i}`));
});

test('two stores over the same folder do not lose concurrent notes', async () => {
  const other = fileStore(dir);
  await Promise.all(Array.from({ length: 10 }, (_, i) =>
    (i % 2 ? store : other).addNote({ pieceId: 'p1', author: 'a', body: `n${i}`, anchor })));
  expect(await store.listNotes('p1')).toHaveLength(10);
});

test('findPieceBySourcePath finds an imported piece', async () => {
  await store.putPiece(piece({ id: 'a' }));
  await store.putPiece(piece({ id: 'b', source: { kind: 'import', path: 'C:\\notes\\essay.md' } }));
  expect((await store.findPieceBySourcePath('C:\\notes\\essay.md'))?.id).toBe('b');
  expect(await store.findPieceBySourcePath('C:\\notes\\other.md')).toBeNull();
});

test('a fresh store over the same folder sees earlier writes', async () => {
  await store.putPiece(piece());
  const v = await store.addVersion('p1', 'text', analysis());
  const n = await store.addNote({ pieceId: 'p1', author: 'a', body: 'hi', anchor });
  const again = fileStore(dir);
  expect(await again.getPiece('p1')).toEqual(piece());
  expect(await again.getVersion('p1', v.id)).toEqual(v);
  expect(await again.listNotes('p1')).toEqual([n]);
  expect((await again.listPieces())[0].versionCount).toBe(1);
});

test('putPiece replaces an existing piece', async () => {
  await store.putPiece(piece());
  await store.putPiece(piece({ title: 'Renamed', updatedAt: '2026-02-01T00:00:00.000Z' }));
  expect((await store.getPiece('p1'))?.title).toBe('Renamed');
  expect(await store.listPieces()).toHaveLength(1);
});

test('no temp files are left behind after writes', async () => {
  await store.putPiece(piece());
  await store.addVersion('p1', 'x', analysis());
  await store.addNote({ pieceId: 'p1', author: 'a', body: 'b', anchor });
  for (const sub of ['pieces', 'versions/p1', 'notes']) {
    const names = await fs.readdir(path.join(dir, sub));
    expect(names.filter(n => !n.endsWith('.json'))).toEqual([]);
  }
});

test('ids that could escape the data folder are rejected', async () => {
  await expect(store.putPiece(piece({ id: '../evil' }))).rejects.toThrow(/invalid id/i);
  await expect(store.addNote({ pieceId: '..\\evil', author: 'a', body: 'b', anchor })).rejects.toThrow(/invalid id/i);
  expect(await store.getPiece('../evil')).toBeNull();
  expect(await store.getVersion('p1', '../../x')).toBeNull();
});

test('a corrupt notes file is reported, never overwritten', async () => {
  await fs.mkdir(path.join(dir, 'notes'), { recursive: true });
  const file = path.join(dir, 'notes', 'p1.json');
  await fs.writeFile(file, '{ not json', 'utf8');
  await expect(store.addNote({ pieceId: 'p1', author: 'a', body: 'b', anchor })).rejects.toThrow(/p1\.json/);
  expect(await fs.readFile(file, 'utf8')).toBe('{ not json');
});

test('a corrupt piece file does not hide the others from listPieces', async () => {
  await store.putPiece(piece({ id: 'good' }));
  await fs.writeFile(path.join(dir, 'pieces', 'bad.json'), '{ nope', 'utf8');
  expect((await store.listPieces()).map(s => s.id)).toEqual(['good']);
  await expect(store.getPiece('bad')).rejects.toThrow(/bad\.json/);
});

test('uppercase ids are rejected, so one file cannot have two spellings', async () => {
  await expect(store.putPiece(piece({ id: 'ABC' }))).rejects.toThrow(/invalid id/i);
  await expect(store.addNote({ pieceId: 'ABC', author: 'a', body: 'b', anchor })).rejects.toThrow(/invalid id/i);
  await expect(store.addVersion('ABC', 'x', analysis())).rejects.toThrow(/invalid id/i);
  expect(await store.getPiece('ABC')).toBeNull();
});

// A data folder spelled in two cases is one folder on Windows; the locks must treat it as one.
test.runIf(process.platform === 'win32')('a data folder spelled in different cases shares its locks', async () => {
  const other = fileStore(dir.toUpperCase());
  await Promise.all(Array.from({ length: 12 }, (_, i) =>
    (i % 2 ? store : other).addNote({ pieceId: 'p1', author: 'a', body: `n${i}`, anchor })));
  expect(await store.listNotes('p1')).toHaveLength(12);
});

describe('unreadable and corrupt files', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => warn.mockRestore());

  test('a skipped corrupt piece file is warned about by name', async () => {
    await store.putPiece(piece({ id: 'good' }));
    await fs.writeFile(path.join(dir, 'pieces', 'bad.json'), '{ nope', 'utf8');
    await store.listPieces();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('bad.json');
  });

  test('a file that fails for another reason than parsing makes the list throw, not skip', async () => {
    await store.putPiece(piece({ id: 'good' }));
    await fs.mkdir(path.join(dir, 'pieces', 'locked.json')); // reading a directory fails with EISDIR
    await expect(store.listPieces()).rejects.toThrow();
    await expect(store.findPieceBySourcePath('x')).rejects.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  test('an unreadable version file makes the version lists throw, not skip', async () => {
    await store.putPiece(piece());
    await store.addVersion('p1', 'x', analysis());
    await fs.mkdir(path.join(dir, 'versions', 'p1', 'locked.json'));
    await expect(store.listVersions('p1')).rejects.toThrow();
    await expect(store.latestVersion('p1')).rejects.toThrow();
    await expect(store.addVersion('p1', 'y', analysis())).rejects.toThrow();
  });

  test('a corrupt newest version does not make addVersion reuse its seq', async () => {
    await store.putPiece(piece());
    await store.addVersion('p1', 'one', analysis());
    const v2 = await store.addVersion('p1', 'two', analysis());
    const corruptFile = path.join(dir, 'versions', 'p1', `${v2.id}.json`);
    await fs.writeFile(corruptFile, '{ truncated', 'utf8');
    const v3 = await store.addVersion('p1', 'three', analysis());
    const stored = JSON.parse(await fs.readFile(path.join(dir, 'versions', 'p1', `${v3.id}.json`), 'utf8'));
    expect(stored.seq).toBeGreaterThan(2);
    expect((await store.latestVersion('p1'))?.id).toBe(v3.id);
    expect(warn.mock.calls.some((c: unknown[]) => String(c[0]).includes(`${v2.id}.json`))).toBe(true);
  });

  test('versionCount agrees with listVersions when a version file is corrupt', async () => {
    await store.putPiece(piece());
    await store.addVersion('p1', 'one', analysis());
    const v2 = await store.addVersion('p1', 'two', analysis());
    await fs.writeFile(path.join(dir, 'versions', 'p1', `${v2.id}.json`), '{ truncated', 'utf8');
    const [summary] = await store.listPieces();
    expect(summary.versionCount).toBe((await store.listVersions('p1')).length);
    expect(summary.versionCount).toBe(1);
  });

  test('a UTF-8 BOM at the start of a file is ignored', async () => {
    await fs.mkdir(path.join(dir, 'pieces'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pieces', 'p1.json'), '﻿' + JSON.stringify(piece()), 'utf8');
    expect(await store.getPiece('p1')).toEqual(piece());
  });

  test('a notes file that is not an array is corrupt: named, never overwritten', async () => {
    await fs.mkdir(path.join(dir, 'notes'), { recursive: true });
    const file = path.join(dir, 'notes', 'p1.json');
    await fs.writeFile(file, '{"a":1}', 'utf8');
    await expect(store.addNote({ pieceId: 'p1', author: 'a', body: 'b', anchor })).rejects.toThrow(/p1\.json/);
    await expect(store.listNotes('p1')).rejects.toThrow(/p1\.json/);
    expect(await fs.readFile(file, 'utf8')).toBe('{"a":1}');
  });
});

describe('writeFileAtomic', () => {
  test('retries a transient EPERM on rename and then succeeds', async () => {
    const target = path.join(dir, 'a.json');
    let calls = 0;
    const rename = async (from: string, to: string) => {
      if (++calls < 3) throw Object.assign(new Error('locked'), { code: 'EPERM' });
      await fs.rename(from, to);
    };
    await writeFileAtomic(target, '{"ok":true}', rename);
    expect(calls).toBe(3);
    expect(await fs.readFile(target, 'utf8')).toBe('{"ok":true}');
    expect(await fs.readdir(dir)).toEqual(['a.json']);
  });

  test('gives up after the retries, removes the temp file and keeps the old content', async () => {
    const target = path.join(dir, 'a.json');
    await fs.writeFile(target, 'old', 'utf8');
    const rename = async () => { throw Object.assign(new Error('locked'), { code: 'EBUSY' }); };
    await expect(writeFileAtomic(target, 'new', rename)).rejects.toThrow(/locked/);
    expect(await fs.readdir(dir)).toEqual(['a.json']);
    expect(await fs.readFile(target, 'utf8')).toBe('old');
  });

  test('does not retry other errors', async () => {
    const target = path.join(dir, 'a.json');
    let calls = 0;
    const rename = async () => { calls++; throw Object.assign(new Error('nope'), { code: 'ENOSPC' }); };
    await expect(writeFileAtomic(target, 'x', rename)).rejects.toThrow(/nope/);
    expect(calls).toBe(1);
    expect(await fs.readdir(dir)).toEqual([]);
  });
});
