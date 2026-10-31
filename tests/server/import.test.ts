// Tests for folder import: file types, titles, re-runs, privacy, canonical paths, and the CLI's "server is running" guard.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { fileStore } from '../../src/server/fileStore';
import { extractText, importFolder, SERVER_RUNNING_MESSAGE, serverIsRunning } from '../../src/server/import';
import { serialQueue } from '../../src/server/queue';
import { createService } from '../../src/server/service';
import { fakeProvider } from '../helpers/fakeProvider';

const root = path.resolve(__dirname, '../..');
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

let dataDir: string;
let folder: string;
let store: ReturnType<typeof fileStore>;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-import-data-'));
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-import-src-'));
  store = fileStore(dataDir);
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(folder, { recursive: true, force: true });
});

const write = (rel: string, content: string | Buffer) => {
  const file = path.join(folder, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};

const make = (providers = { local: fakeProvider([]) }) =>
  createService({ store, providers, maxChars: 24000, queue: serialQueue() });

const HTML_POST = `<!doctype html><html><head><title>Site name | A walk</title><style>p{color:red}</style></head>
<body>
<nav><a href="/">Home</a> <a href="/about">About the author</a></nav>
<article>
<header><span>Posted on a date</span></header>
<h1>A walk by the river</h1>
<p>The water was low &amp; slow. Nobody&#39;s boat was out.</p>
<p>We stood a while.<br>Then we left.</p>
<script>var tracker = "do not keep";</script>
<ul><li>First stop</li><li>Second stop</li></ul>
</article>
<footer>Copyright footer words</footer>
</body></html>`;

function seed() {
  write('notes/essay.md', '# On patience\n\nSome neutral words about waiting.\n');
  write('site/index.html', HTML_POST);
  write('plain.txt', 'Plain words in a text file.\n');
  write('picture.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

test('imports md, html and txt, ignores png', async () => {
  seed();
  const svc = make();
  const result = await importFolder({ service: svc, store }, folder, { privacy: 'private' });
  expect(result).toEqual({ created: 3, updated: 0, skipped: 0, failed: [] });

  const pieces = await Promise.all((await svc.listPieces()).map(s => store.getPiece(s.id)));
  const html = pieces.find(p => p?.source?.path?.endsWith('index.html'))!;
  expect(html.title).toBe('A walk by the river');
  expect(html.text).toContain('The water was low & slow.');
  expect(html.text).toContain("Nobody's boat was out.");
  expect(html.text).not.toMatch(/About the author|Home|Copyright footer|Posted on|tracker|color:red|Site name/);
  // Paragraph breaks stay as blank lines and runs of newlines never exceed two.
  expect(html.text).toContain('The water was low & slow. Nobody\'s boat was out.\n\nWe stood a while.\nThen we left.');
  expect(html.text).not.toMatch(/\n{3,}/);
  expect(html.text).toContain('First stop');

  const md = pieces.find(p => p?.source?.path?.endsWith('essay.md'))!;
  expect(md.title).toBe('On patience');
  const txt = pieces.find(p => p?.source?.path?.endsWith('plain.txt'))!;
  expect(txt.title).toBe('plain');
  expect(txt.source?.kind).toBe('import');
});

test('a second run skips unchanged files', async () => {
  seed();
  const svc = make();
  await importFolder({ service: svc, store }, folder, { privacy: 'private' });
  const again = await importFolder({ service: svc, store }, folder, { privacy: 'private' });
  expect(again).toEqual({ created: 0, updated: 0, skipped: 3, failed: [] });
  expect(await svc.listPieces()).toHaveLength(3);
});

test('an edited file updates', async () => {
  seed();
  const svc = make();
  await importFolder({ service: svc, store }, folder, { privacy: 'private' });
  write('plain.txt', 'Different plain words, now edited.\n');
  const again = await importFolder({ service: svc, store }, folder, { privacy: 'private' });
  expect(again).toEqual({ created: 0, updated: 1, skipped: 2, failed: [] });
  const piece = (await store.findPieceBySourcePath(fs.realpathSync(path.join(folder, 'plain.txt'))))!;
  expect(piece.text).toBe('Different plain words, now edited.');
});

test('docx text is extracted', async () => {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun('First paragraph of a Word file.')] }),
        new Paragraph({ children: [new TextRun('Second paragraph here.')] }),
        new Paragraph({ children: [new TextRun('فقرة بالعربية تبقى كما هي')] }),
      ],
    }],
  });
  const file = write('draft.docx', await Packer.toBuffer(doc));
  const out = await extractText(file);
  expect(out?.title).toBe('draft');
  expect(out?.text).toContain('First paragraph of a Word file.');
  expect(out?.text).toContain('Second paragraph here.');
  expect(out?.text).toContain('فقرة بالعربية تبقى كما هي');

  const result = await importFolder({ service: make(), store }, folder, { privacy: 'private' });
  expect(result.created).toBe(1);
});

test('imported pieces are private unless --public', async () => {
  seed();
  const svc = make();
  await importFolder({ service: svc, store }, folder, { privacy: 'private' });
  expect((await svc.listPieces()).map(p => p.privacy)).toEqual(['private', 'private', 'private']);

  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir);
  await importFolder({ service: svc, store }, folder, { privacy: 'public' });
  expect((await svc.listPieces()).map(p => p.privacy)).toEqual(['public', 'public', 'public']);
});

test('extractText gives null for unknown types, keeps Arabic untouched, and falls back to the file name', async () => {
  expect(await extractText(write('x.png', 'not text'))).toBeNull();
  expect(await extractText(write('x.pdf', 'not text'))).toBeNull();
  const arabic = 'تأمل في الصبر\n\nكلمات هادئة عن الانتظار.';
  const md = await extractText(write('صبر.md', arabic));
  expect(md).toEqual({ title: 'صبر', text: arabic });
  const html = await extractText(write('bare.htm', '<html><body><p>مرحبا</p><p>بالعالم</p></body></html>'));
  expect(html).toEqual({ title: 'bare', text: 'مرحبا\n\nبالعالم' });
});

test('html titles: h1, then <title>, then file name; article preferred over body', async () => {
  const noH1 = await extractText(write('a.html', '<html><head><title>Only title</title></head><body><p>Body text</p></body></html>'));
  expect(noH1?.title).toBe('Only title');
  const none = await extractText(write('b.html', '<body><p>Body text</p></body>'));
  expect(none?.title).toBe('b');
  const withArticle = await extractText(write('c.html', '<body><p>outside</p><article><p>inside</p></article></body>'));
  expect(withArticle?.text).toBe('inside');
});

test('a bad file is recorded and the run continues; empty files fail with a reason', async () => {
  seed();
  write('broken.docx', 'this is not a zip file');
  write('empty.md', '   \n');
  const result = await importFolder({ service: make(), store }, folder, { privacy: 'private' });
  expect(result.created).toBe(3);
  expect(result.failed.map(f => path.basename(f.path)).sort()).toEqual(['broken.docx', 'empty.md']);
  expect(result.failed.every(f => f.error.length > 0)).toBe(true);
});

test('analyze: true analyses created pieces through the service', async () => {
  write('one.txt', 'A short neutral sentence.');
  const analyses: string[] = [];
  const svc = make();
  const real = svc.analyze;
  svc.analyze = async id => { analyses.push(id); return real(id); };
  // The fake provider has nothing queued, so analysis fails: the piece still exists and the failure is reported.
  const result = await importFolder({ service: svc, store }, folder, { privacy: 'private', analyze: true });
  expect(analyses).toHaveLength(1);
  expect(result.created).toBe(1);
  expect(result.failed).toHaveLength(1);
  expect(result.failed[0].error).toMatch(/analysis/i);
});

test('without analyze no model is called', async () => {
  seed();
  const local = fakeProvider([]);
  await importFolder({ service: make({ local }), store }, folder, { privacy: 'private' });
  expect(local.calls).toHaveLength(0);
});

test('source paths are canonical: a relative spelling of the folder skips on the second run', async () => {
  seed();
  const svc = make();
  await importFolder({ service: svc, store }, folder, { privacy: 'private' });
  const relative = path.relative(process.cwd(), folder);
  const again = await importFolder({ service: svc, store }, relative, { privacy: 'private' });
  expect(again).toEqual({ created: 0, updated: 0, skipped: 3, failed: [] });
  expect(await svc.listPieces()).toHaveLength(3);
});

test.runIf(process.platform === 'win32')('source paths are canonical: a differently cased folder skips on the second run', async () => {
  seed();
  const svc = make();
  await importFolder({ service: svc, store }, folder, { privacy: 'private' });
  const shouted = folder.toUpperCase();
  expect(shouted).not.toBe(folder);
  const again = await importFolder({ service: svc, store }, shouted, { privacy: 'private' });
  expect(again).toEqual({ created: 0, updated: 0, skipped: 3, failed: [] });
  expect(await svc.listPieces()).toHaveLength(3);
});

test('a folder that does not exist rejects with a clear message', async () => {
  await expect(importFolder({ service: make(), store }, path.join(folder, 'nope'), { privacy: 'private' }))
    .rejects.toThrow(/folder/i);
});

test('serverIsRunning uses the injected connector for the configured host and port', async () => {
  const seen: Array<[string, number]> = [];
  const up = await serverIsRunning('127.0.0.1', 4390, async (h, p) => { seen.push([h, p]); return true; });
  const down = await serverIsRunning('127.0.0.1', 4390, async () => false);
  expect([up, down]).toEqual([true, false]);
  expect(seen).toEqual([['127.0.0.1', 4390]]);
});

test('the default connector sees a listener and an empty port', async () => {
  const listener = net.createServer();
  await new Promise<void>(r => listener.listen(0, '127.0.0.1', r));
  const port = (listener.address() as net.AddressInfo).port;
  expect(await serverIsRunning('127.0.0.1', port)).toBe(true);
  await new Promise<void>(r => listener.close(() => r()));
  expect(await serverIsRunning('127.0.0.1', port)).toBe(false);
});

function runCli(args: string[], env: Record<string, string>) {
  return spawnSync(process.execPath, [tsx, 'scripts/import.ts', ...args], {
    cwd: root, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, TL_TOKEN: 'x'.repeat(24), TL_HOST: '127.0.0.1', TL_LOCAL_MODEL: 'm', TL_DATA_DIR: dataDir, ...env },
  });
}

test('the CLI refuses to write while the server is running on the same host and port', async () => {
  seed();
  const listener = net.createServer();
  await new Promise<void>(r => listener.listen(0, '127.0.0.1', r));
  const port = (listener.address() as net.AddressInfo).port;
  // spawnSync would block this process's event loop and starve the listener, so use the async API.
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [tsx, 'scripts/import.ts', folder], {
    cwd: root,
    env: { ...process.env, TL_TOKEN: 'x'.repeat(24), TL_HOST: '127.0.0.1', TL_PORT: String(port), TL_LOCAL_MODEL: 'm', TL_DATA_DIR: dataDir },
  });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const code = await new Promise<number | null>(r => child.on('close', r));
  await new Promise<void>(r => listener.close(() => r()));
  expect(code).not.toBe(0);
  expect(stderr).toContain(SERVER_RUNNING_MESSAGE);
  expect(await store.listPieces()).toEqual([]);
}, 60_000);

test('the CLI imports privately by default, prints counts and never the text', () => {
  write('secret.md', '# Quiet title\n\nA neutral sentence that must not be printed.');
  const r = runCli([folder], { TL_PORT: '1' });
  expect(r.status).toBe(0);
  expect(r.stdout).toMatch(/created 1/);
  expect(r.stdout + r.stderr).not.toMatch(/neutral sentence|Quiet title/);
});

test('the CLI prints usage and exits non-zero without a folder', () => {
  const r = runCli([], { TL_PORT: '1' });
  expect(r.status).not.toBe(0);
  expect(r.stderr).toMatch(/Usage/);
});
