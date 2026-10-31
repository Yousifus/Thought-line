// Tests that re-importing a folder never overwrites text edited in the app: hash bookkeeping, conflicts, legacy pieces, CLI output.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileStore } from '../../src/server/fileStore';
import { importFolder } from '../../src/server/import';
import { serialQueue } from '../../src/server/queue';
import { createService } from '../../src/server/service';
import { fakeProvider } from '../helpers/fakeProvider';

const root = path.resolve(__dirname, '../..');
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

let dataDir: string;
let folder: string;
let store: ReturnType<typeof fileStore>;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-conflict-data-'));
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-conflict-src-'));
  store = fileStore(dataDir);
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(folder, { recursive: true, force: true });
});

const write = (rel: string, content: string) => {
  const file = path.join(folder, rel);
  fs.writeFileSync(file, content);
  return fs.realpathSync(file);
};
const make = (providers = { local: fakeProvider([]) }) => createService({ store, providers, maxChars: 24000, queue: serialQueue() });
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const pieceFor = async (file: string) => (await store.findPieceBySourcePath(fs.realpathSync(path.join(folder, file))))!;
const run = (svc: ReturnType<typeof make>, opts: { analyze?: boolean } = {}) => importFolder({ service: svc, store }, folder, { privacy: 'private', ...opts });

test('the first import records the hash of the imported text in the piece source', async () => {
  write('plain.txt', 'Plain words in a text file.\n');
  await run(make());
  expect((await pieceFor('plain.txt')).source).toMatchObject({ kind: 'import', importedHash: sha256('Plain words in a text file.') });
});

test('an unchanged-in-app piece follows the file, and its hash moves with it', async () => {
  write('plain.txt', 'First words.\n');
  const svc = make();
  await run(svc);
  write('plain.txt', 'Second words.\n');
  expect(await run(svc)).toEqual({ created: 0, updated: 1, skipped: 0, conflicts: [], failed: [] });
  const piece = await pieceFor('plain.txt');
  expect(piece.text).toBe('Second words.');
  expect(piece.source?.importedHash).toBe(sha256('Second words.'));
  write('plain.txt', 'Third words.\n');
  expect((await run(svc)).updated).toBe(1);
});

test('a piece edited in the app is left alone when the file also changed, and reported as a conflict', async () => {
  write('plain.txt', 'First words.\n');
  const svc = make();
  await run(svc);
  const id = (await pieceFor('plain.txt')).id;
  await svc.updateText(id, 'Edited in the app.');
  const file = write('plain.txt', 'Changed on disk.\n');
  expect(await run(svc)).toEqual({ created: 0, updated: 0, skipped: 0, failed: [], conflicts: [{ path: file }] });
  const piece = (await store.getPiece(id))!;
  expect(piece.text).toBe('Edited in the app.');
  expect(piece.source?.importedHash).toBe(sha256('First words.'));
});

test('a piece edited in the app is simply kept when the file did not change', async () => {
  write('plain.txt', 'First words.\n');
  const svc = make();
  await run(svc);
  const id = (await pieceFor('plain.txt')).id;
  await svc.updateText(id, 'Edited in the app.');
  expect(await run(svc)).toEqual({ created: 0, updated: 0, skipped: 1, conflicts: [], failed: [] });
  expect((await store.getPiece(id))!.text).toBe('Edited in the app.');
});

test('a conflicting piece is not analysed, even with analyze on', async () => {
  write('plain.txt', 'First words.\n');
  const provider = fakeProvider([]);
  const svc = make({ local: provider });
  await run(svc);
  await svc.updateText((await pieceFor('plain.txt')).id, 'Edited in the app.');
  write('plain.txt', 'Changed on disk.\n');
  const again = await run(svc, { analyze: true });
  expect(again.conflicts).toHaveLength(1);
  expect(again.failed).toEqual([]);
  expect(provider.calls).toHaveLength(0);
});

test('a piece imported before the hash existed is never overwritten: a conflict when the file differs', async () => {
  const file = write('plain.txt', 'Disk words, newer.\n');
  const now = new Date().toISOString();
  await store.putPiece({
    id: 'legacy', title: 'plain', privacy: 'private', text: 'Old words.', createdAt: now, updatedAt: now,
    source: { kind: 'import', path: file },
  });
  const again = await run(make());
  expect(again.updated).toBe(0);
  expect(again.conflicts).toEqual([{ path: file }]);
  expect((await store.getPiece('legacy'))!.text).toBe('Old words.');
});

test('a legacy piece that already matches the file is skipped and gains its hash, so later runs can tell', async () => {
  const file = write('plain.txt', 'Same words.\n');
  const now = new Date().toISOString();
  await store.putPiece({
    id: 'legacy', title: 'plain', privacy: 'private', text: 'Same words.', createdAt: now, updatedAt: now,
    source: { kind: 'import', path: file },
  });
  const svc = make();
  expect(await run(svc)).toEqual({ created: 0, updated: 0, skipped: 1, conflicts: [], failed: [] });
  const gained = (await store.getPiece('legacy'))!;
  expect(gained.source).toEqual({ kind: 'import', path: file, importedHash: sha256('Same words.') });
  expect(gained.updatedAt).toBe(now);
  write('plain.txt', 'Newer words.\n');
  expect((await run(svc)).updated).toBe(1);
});

test('the CLI prints the conflict count and names the file, never the text', async () => {
  const env = { ...process.env, TL_TOKEN: 'x'.repeat(24), TL_HOST: '127.0.0.1', TL_PORT: '1', TL_LOCAL_MODEL: 'm', TL_DATA_DIR: dataDir };
  const cli = () => spawnSync(process.execPath, [tsx, 'scripts/import.ts', folder], { cwd: root, encoding: 'utf8', timeout: 60_000, env });
  write('secret.md', '# Quiet title\n\nA neutral sentence that must not be printed.');
  expect(cli().status).toBe(0);
  await make().updateText((await pieceFor('secret.md')).id, 'Edited in the app with other neutral words.');
  write('secret.md', '# Quiet title\n\nA different neutral sentence on disk.');
  const r = cli();
  expect(r.stdout).toMatch(/conflicts 1/);
  expect(r.stdout + r.stderr).toContain('secret.md');
  expect(r.stdout + r.stderr).not.toMatch(/neutral|Quiet title/);
}, 60_000);
