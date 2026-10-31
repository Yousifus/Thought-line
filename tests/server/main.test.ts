// Tests that main.ts refuses to start, with a clear message and a non-zero exit, when the config is unsafe.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { buildProviders } from '../../src/server/providers';
import type { Config } from '../../src/server/config';

const root = path.resolve(__dirname, '../..');
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function runMain(env: Record<string, string>) {
  // dotenv never overrides a variable that is already set, so these win over any real .env.
  return spawnSync(process.execPath, [tsx, 'src/server/main.ts'], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, TL_TOKEN: '', TL_HOST: '127.0.0.1', TL_LOCAL_MODEL: 'm', ...env },
  });
}

test('main refuses to start without a long token', () => {
  const r = runMain({ TL_TOKEN: 'short' });
  expect(r.status).not.toBe(0);
  expect(r.stderr).toMatch(/TL_TOKEN must be set \(24\+ characters\)/);
});

test('main refuses to listen on all interfaces', () => {
  const r = runMain({ TL_TOKEN: 'x'.repeat(24), TL_HOST: '0.0.0.0' });
  expect(r.status).not.toBe(0);
  expect(r.stderr).toMatch(/Refusing to listen on all interfaces/);
});

test('main refuses a model host outside the house', () => {
  const r = runMain({ TL_TOKEN: 'x'.repeat(24), TL_LOCAL_BASE_URL: 'https://api.example.com/v1' });
  expect(r.status).not.toBe(0);
  expect(r.stderr).toMatch(/machine in the house/);
});

describe('buildProviders', () => {
  const config: Config = {
    host: '127.0.0.1', port: 4390, token: 'x'.repeat(24), dataDir: './data', maxChars: 24000,
    local: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'local-m' },
  };

  test('the local provider is kind local and there is no cloud by default', () => {
    const p = buildProviders(config);
    expect([p.local.kind, p.local.name, p.cloud]).toEqual(['local', 'local-m', undefined]);
  });

  test('the cloud provider is kind cloud', () => {
    const p = buildProviders({ ...config, cloud: { baseUrl: 'https://c/v1', model: 'cm', apiKey: 'k' } });
    expect([p.local.kind, p.cloud!.kind, p.cloud!.name]).toEqual(['local', 'cloud', 'cm']);
  });

  test('a fixture replaces the local provider and stays kind local', () => {
    const p = buildProviders({ ...config, fixtureAnalysisPath: 'tests/fixtures/sample-analysis.json' });
    expect([p.local.kind, p.local.name]).toEqual(['local', 'fixture']);
  });
});
