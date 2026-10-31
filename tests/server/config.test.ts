// Tests for loadConfig: required token, safe listen address, local-to-the-house model host, all-or-nothing cloud.
import { loadConfig } from '../../src/server/config';

const base = { TL_TOKEN: 'x'.repeat(24), TL_LOCAL_MODEL: 'm' };

test('refuses to listen on all interfaces', () => {
  expect(() => loadConfig({ ...base, TL_HOST: '0.0.0.0' })).toThrow(/all interfaces/);
  expect(() => loadConfig({ ...base, TL_HOST: '::' })).toThrow(/all interfaces/);
  expect(() => loadConfig({ ...base, TL_HOST: '' })).toThrow(/all interfaces/);
  expect(() => loadConfig({ ...base, TL_HOST: '[::]' })).toThrow(/all interfaces/);
});

test('needs a long token', () => {
  expect(() => loadConfig({ TL_LOCAL_MODEL: 'm', TL_TOKEN: 'short' })).toThrow(/24\+/);
  expect(() => loadConfig({ TL_LOCAL_MODEL: 'm' })).toThrow(/TL_TOKEN must be set \(24\+ characters\)/);
});

test('a half-set cloud provider is an error', () => {
  expect(() => loadConfig({ ...base, TL_CLOUD_BASE_URL: 'https://c' })).toThrow();
  expect(() => loadConfig({ ...base, TL_CLOUD_BASE_URL: 'https://c', TL_CLOUD_MODEL: 'cm' })).toThrow();
  expect(() => loadConfig({ ...base, TL_CLOUD_API_KEY: 'k' })).toThrow();
});

test('a half-set cloud error does not echo the key', () => {
  try {
    loadConfig({ ...base, TL_CLOUD_API_KEY: 'super-secret-key-123' });
    throw new Error('should have thrown');
  } catch (e) {
    expect((e as Error).message).not.toContain('super-secret-key-123');
  }
});

test('a full cloud set turns the cloud provider on, and empty values count as unset', () => {
  const c = loadConfig({ ...base, TL_CLOUD_BASE_URL: 'https://c/v1', TL_CLOUD_MODEL: 'cm', TL_CLOUD_API_KEY: 'k' });
  expect(c.cloud).toEqual({ baseUrl: 'https://c/v1', model: 'cm', apiKey: 'k' });
  const none = loadConfig({ ...base, TL_CLOUD_BASE_URL: '', TL_CLOUD_MODEL: '', TL_CLOUD_API_KEY: '' });
  expect(none.cloud).toBeUndefined();
});

test('defaults', () => {
  expect(loadConfig(base)).toEqual({
    host: '127.0.0.1',
    port: 4390,
    token: 'x'.repeat(24),
    dataDir: './data',
    maxChars: 24000,
    local: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'm' },
  });
});

test('reads port, data dir and max chars, and rejects nonsense numbers', () => {
  const c = loadConfig({ ...base, TL_PORT: '5000', TL_DATA_DIR: '/tmp/d', TL_MAX_CHARS: '1000' });
  expect([c.port, c.dataDir, c.maxChars]).toEqual([5000, '/tmp/d', 1000]);
  expect(() => loadConfig({ ...base, TL_PORT: 'abc' })).toThrow(/TL_PORT/);
  expect(() => loadConfig({ ...base, TL_PORT: '70000' })).toThrow(/TL_PORT/);
  expect(() => loadConfig({ ...base, TL_MAX_CHARS: '0' })).toThrow(/TL_MAX_CHARS/);
});

test('the local model is required unless a fixture is set', () => {
  expect(() => loadConfig({ TL_TOKEN: 'x'.repeat(24) })).toThrow(/TL_LOCAL_MODEL/);
  const c = loadConfig({ TL_TOKEN: 'x'.repeat(24), TL_FIXTURE_ANALYSIS: 'tests/fixtures/sample-analysis.json' });
  expect(c.fixtureAnalysisPath).toBe('tests/fixtures/sample-analysis.json');
  expect(loadConfig({ ...base, TL_FIXTURE_ANALYSIS: '' }).fixtureAnalysisPath).toBeUndefined();
});

describe('TL_LOCAL_BASE_URL must point at a machine in the house', () => {
  const url = (host: string) => `http://${host}:1234/v1`;
  const houseHosts = [
    '127.0.0.1', '127.1.2.3', 'localhost', '[::1]',
    '10.0.0.5', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.20',
    '100.64.0.1', '100.100.100.100', '100.127.255.255',
    'studio.local', 'echo-point.tail1234.ts.net',
  ];
  test.each(houseHosts)('accepts %s', host => {
    expect(loadConfig({ ...base, TL_LOCAL_BASE_URL: url(host) }).local.baseUrl).toBe(url(host));
  });

  const outsideHosts = [
    'api.openai.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1',
    '192.169.0.1', '11.0.0.1', 'localhost.evil.com', 'evil.com', 'notts.net', 'fake.local.evil.com',
    '2001:db8::1',
  ];
  test.each(outsideHosts)('refuses %s', host => {
    const h = host.includes(':') ? `[${host}]` : host;
    expect(() => loadConfig({ ...base, TL_LOCAL_BASE_URL: url(h) }))
      .toThrow('TL_LOCAL_BASE_URL must point at a machine in the house (loopback, LAN or Tailscale)');
  });

  test('TL_LOCAL_ALLOW_HOST lets exactly that host through', () => {
    const env = { ...base, TL_LOCAL_BASE_URL: 'https://gpu.example.com/v1' };
    expect(() => loadConfig(env)).toThrow(/machine in the house/);
    expect(loadConfig({ ...env, TL_LOCAL_ALLOW_HOST: 'gpu.example.com' }).local.baseUrl).toBe('https://gpu.example.com/v1');
    expect(() => loadConfig({ ...env, TL_LOCAL_ALLOW_HOST: 'other.example.com' })).toThrow(/machine in the house/);
    expect(() => loadConfig({ ...env, TL_LOCAL_ALLOW_HOST: '' })).toThrow(/machine in the house/);
  });

  test('a malformed URL is an error', () => {
    expect(() => loadConfig({ ...base, TL_LOCAL_BASE_URL: 'not a url' })).toThrow(/TL_LOCAL_BASE_URL/);
    expect(() => loadConfig({ ...base, TL_LOCAL_BASE_URL: 'ftp://127.0.0.1/v1' })).toThrow(/TL_LOCAL_BASE_URL/);
  });
});
