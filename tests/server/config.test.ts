// Tests for loadConfig: required token, safe listen address, local-to-the-house model host, all-or-nothing cloud.
import fs from 'node:fs';
import path from 'node:path';
import { isWildcardAddress, loadConfig, repoDataDirIsNotIgnored } from '../../src/server/config';

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

describe('a token that is not a real secret is refused', () => {
  const env = (TL_TOKEN: string) => ({ TL_LOCAL_MODEL: 'm', TL_TOKEN });

  test('the placeholder from .env.example', () => {
    expect(() => loadConfig(env('replace-with-a-long-random-string'))).toThrow(/TL_TOKEN.*placeholder/);
  });

  test('whatever TL_TOKEN .env.example actually ships with', () => {
    const example = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
    const shipped = /^TL_TOKEN=(.*)$/m.exec(example)![1].trim();
    expect(shipped.length).toBeGreaterThanOrEqual(24); // long enough to pass the length check, so only the placeholder rule can stop it
    expect(() => loadConfig(env(shipped))).toThrow(/TL_TOKEN/);
  });

  test('blank tokens', () => {
    expect(() => loadConfig(env(' '.repeat(24)))).toThrow(/TL_TOKEN must be set \(24\+ characters\)/);
    expect(() => loadConfig(env('\t'.repeat(30)))).toThrow(/TL_TOKEN must be set/);
    expect(() => loadConfig(env('\n'.repeat(30)))).toThrow(/TL_TOKEN must be set/);
  });

  test('tokens containing whitespace', () => {
    expect(() => loadConfig(env('abcdefghijkl abcdefghijkl'))).toThrow(/TL_TOKEN must not contain whitespace/);
    expect(() => loadConfig(env(' ' + 'x'.repeat(30)))).toThrow(/whitespace/);
    expect(() => loadConfig(env('x'.repeat(30) + '\n'))).toThrow(/whitespace/);
  });

  test('a good random token passes', () => {
    expect(loadConfig(env('k3J9-vQ2x_Lm8Zp0aW4tR7yB5nC1dFhG')).token).toBe('k3J9-vQ2x_Lm8Zp0aW4tR7yB5nC1dFhG');
  });
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
    'studio.local',
  ];
  test.each(houseHosts)('accepts %s', host => {
    expect(loadConfig({ ...base, TL_LOCAL_BASE_URL: url(host) }).local.baseUrl).toBe(url(host));
  });

  const outsideHosts = [
    'api.openai.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1',
    '192.169.0.1', '11.0.0.1', 'localhost.evil.com', 'evil.com', 'notts.net', 'echo-point.tail1234.ts.net', 'someone-elses-funnel.ts.net', 'fake.local.evil.com',
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

  test('a MagicDNS name works only through TL_LOCAL_ALLOW_HOST', () => {
    const env = { ...base, TL_LOCAL_BASE_URL: 'http://echo-point.tail1234.ts.net:1234/v1' };
    expect(() => loadConfig(env)).toThrow(/machine in the house/);
    expect(loadConfig({ ...env, TL_LOCAL_ALLOW_HOST: 'echo-point.tail1234.ts.net' }).local.baseUrl).toBe(env.TL_LOCAL_BASE_URL);
  });

  test('a model URL with a username, password or query string is refused (they would leak into error messages)', () => {
    for (const u of [
      'http://user@127.0.0.1:1234/v1', 'http://user:pw@127.0.0.1:1234/v1', 'http://:pw@127.0.0.1:1234/v1',
      'http://127.0.0.1:1234/v1?key=secret', 'http://127.0.0.1:1234/v1?',
    ]) {
      expect(() => loadConfig({ ...base, TL_LOCAL_BASE_URL: u }), u).toThrow(/TL_LOCAL_BASE_URL must not contain a username, password or query string/);
    }
    const cloud = { TL_CLOUD_MODEL: 'cm', TL_CLOUD_API_KEY: 'k' };
    expect(() => loadConfig({ ...base, ...cloud, TL_CLOUD_BASE_URL: 'https://u:p@c/v1' })).toThrow(/TL_CLOUD_BASE_URL must not contain/);
    expect(() => loadConfig({ ...base, ...cloud, TL_CLOUD_BASE_URL: 'https://c/v1?api_key=abc' })).toThrow(/TL_CLOUD_BASE_URL must not contain/);
  });

  test('the error for a credentialed URL does not echo the credentials', () => {
    try {
      loadConfig({ ...base, TL_LOCAL_BASE_URL: 'http://user:hunter2@127.0.0.1:1234/v1' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain('hunter2');
    }
  });

  test('a malformed URL is an error', () => {
    expect(() => loadConfig({ ...base, TL_LOCAL_BASE_URL: 'not a url' })).toThrow(/TL_LOCAL_BASE_URL/);
    expect(() => loadConfig({ ...base, TL_LOCAL_BASE_URL: 'ftp://127.0.0.1/v1' })).toThrow(/TL_LOCAL_BASE_URL/);
  });
});

test('isWildcardAddress recognises an all-interfaces bind and nothing else', () => {
  for (const a of ['0.0.0.0', '::', '::ffff:0.0.0.0']) expect(isWildcardAddress(a), a).toBe(true);
  for (const a of ['127.0.0.1', '::1', '100.101.102.103', '192.168.1.5', '']) expect(isWildcardAddress(a), a).toBe(false);
});

describe('TL_HOST: loopback and Tailscale only, anything else needs TL_ALLOW_BIND naming that exact address', () => {
  const allowed = [
    '127.0.0.1', '127.5.6.7', 'localhost', 'LOCALHOST', '::1', '[::1]',
    '100.64.0.1', '100.101.102.103', '100.127.255.255',
    'fd7a:115c:a1e0::1', 'fd7a:115c:a1e0:ab12:4843:cd96:625b:1234', 'FD7A:115C:A1E0::5',
  ];
  test.each(allowed)('accepts %s by default', host => {
    expect(loadConfig({ ...base, TL_HOST: host }).host).toBe(host);
  });

  const refused = [
    '192.168.1.20', '10.0.0.5', '172.16.0.9', '8.8.8.8', '100.63.255.255', '100.128.0.1', '128.0.0.1',
    'fd7a:115c:a1e1::1', 'fd7b:115c:a1e0::1', 'fe80::1', '2001:db8::1', '::ffff:192.168.1.5',
    'example.com', 'box.tailnet.ts.net', '0127.0.0.1', '127.0.0.1.evil.com',
  ];
  test.each(refused)('refuses %s unless TL_ALLOW_BIND names it', host => {
    expect(() => loadConfig({ ...base, TL_HOST: host })).toThrow(/TL_ALLOW_BIND/);
    expect(loadConfig({ ...base, TL_HOST: host, TL_ALLOW_BIND: host }).host).toBe(host);
  });

  test('TL_ALLOW_BIND allows exactly that address, and an empty value allows nothing', () => {
    const env = { ...base, TL_HOST: '192.168.1.20' };
    expect(() => loadConfig({ ...env, TL_ALLOW_BIND: '192.168.1.21' })).toThrow(/TL_ALLOW_BIND/);
    expect(() => loadConfig({ ...env, TL_ALLOW_BIND: '' })).toThrow(/TL_ALLOW_BIND/);
    expect(() => loadConfig({ ...env, TL_ALLOW_BIND: '192.168.1' })).toThrow(/TL_ALLOW_BIND/);
  });

  test('TL_ALLOW_BIND never opens a wildcard', () => {
    for (const w of ['0.0.0.0', '::', '[::]']) {
      expect(() => loadConfig({ ...base, TL_HOST: w, TL_ALLOW_BIND: w })).toThrow(/all interfaces/);
    }
  });

  test('the error says plainly why', () => {
    expect(() => loadConfig({ ...base, TL_HOST: '192.168.1.20' })).toThrow(/loopback.*Tailscale|Tailscale.*loopback/);
  });
});

describe('the cloud model must be reached over https', () => {
  const cloud = { TL_CLOUD_MODEL: 'cm', TL_CLOUD_API_KEY: 'k' };
  test('http is refused, whatever the host', () => {
    for (const u of ['http://c.example.com/v1', 'http://127.0.0.1:9000/v1']) {
      expect(() => loadConfig({ ...base, ...cloud, TL_CLOUD_BASE_URL: u }), u).toThrow(/TL_CLOUD_BASE_URL must use https/);
    }
  });
  test('https passes', () => {
    expect(loadConfig({ ...base, ...cloud, TL_CLOUD_BASE_URL: 'https://c.example.com/v1' }).cloud?.baseUrl).toBe('https://c.example.com/v1');
  });
  test('the error does not echo the key', () => {
    try {
      loadConfig({ ...base, TL_CLOUD_MODEL: 'cm', TL_CLOUD_API_KEY: 'sk-secret-999', TL_CLOUD_BASE_URL: 'http://c/v1' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain('sk-secret-999');
    }
  });
});

describe('repoDataDirIsNotIgnored: a data folder inside the repo but outside data/ is not gitignored', () => {
  const repo = path.resolve('/work/thought-line');
  test.each([
    ['notes', true], ['./notes/private', true], ['.', true], ['', true], ['src/data', true], ['dataset', true], ['data-old', true],
    ['data', false], ['./data', false], ['data/2026', false],
  ])('%s -> %s', (dir, expected) => {
    expect(repoDataDirIsNotIgnored(path.resolve(repo, dir), repo)).toBe(expected);
  });
  test('a folder outside the repo is not flagged', () => {
    expect(repoDataDirIsNotIgnored(path.resolve('/elsewhere/tl-data'), repo)).toBe(false);
    expect(repoDataDirIsNotIgnored(path.resolve('/work/thought-line-private'), repo)).toBe(false);
    expect(repoDataDirIsNotIgnored(path.resolve('/work'), repo)).toBe(false);
  });
});
