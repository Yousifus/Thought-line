// Tests that the Vite dev server refuses to serve private files (data/, eval/, .env*) even by their absolute path.
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';

const root = path.resolve(__dirname, '../..');
const made: string[] = [];
const createdDirs: string[] = [];
let vite: ViteDevServer;

/** Writes a neutral probe file (creating its folder if needed) and remembers to remove it. */
function probe(rel: string): string {
  const file = path.join(root, rel);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); createdDirs.push(dir); }
  if (fs.existsSync(file)) throw new Error(`${rel} already exists; the probe will not overwrite it`);
  fs.writeFileSync(file, '{"probe":"neutral test file"}');
  made.push(file);
  return file;
}

beforeAll(async () => {
  vite = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    root: path.join(root, 'src/web'),
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
  });
});
afterAll(async () => {
  await vite?.close();
  for (const f of made) fs.rmSync(f, { force: true });
  for (const d of createdDirs) fs.rmSync(d, { recursive: true, force: true });
});

const status = async (file: string) => (await request(vite.middlewares).get(`/@fs/${file.replace(/\\/g, '/')}`)).status;

test('private folders and env files are not served', async () => {
  const denied = [probe('data/deny-probe.json'), probe('data/nested/deny-probe.json'), probe('eval/deny-probe.json'), probe('.env.deny-probe')];
  for (const file of denied) expect(await status(file), file).toBe(403);
});

test('an ordinary project file still is (so the check above is not just a broken URL)', async () => {
  expect(await status(path.join(root, 'package.json'))).toBe(200);
});
