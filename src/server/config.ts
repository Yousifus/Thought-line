// Reads and checks the server's settings from the environment, refusing anything unsafe before a socket is opened.
import net from 'node:net';
import path from 'node:path';
export interface Config {
  host: string;
  port: number;
  token: string;
  dataDir: string;
  maxChars: number;
  local: { baseUrl: string; model: string };
  cloud?: { baseUrl: string; model: string; apiKey: string };
  fixtureAnalysisPath?: string;
}

type Env = Record<string, string | undefined>;

const ALL_INTERFACES = new Set(['', '0', '0.0.0.0', '::', '[::]', '::0', '0:0:0:0:0:0:0:0']);
/** The value `.env.example` ships with. It is public, so it is never a secret. */
const PLACEHOLDER_TOKEN = 'replace-with-a-long-random-string';
const NOT_IN_THE_HOUSE = 'TL_LOCAL_BASE_URL must point at a machine in the house (loopback, LAN or Tailscale)';

/** An env value, with an empty string counting as unset (a copied .env.example has empty lines). */
const get = (env: Env, key: string): string | undefined => {
  const v = env[key];
  return v === undefined || v.trim() === '' ? undefined : v.trim();
};

/** True for an address a socket reports when it is bound to every interface (used by main.ts as a backstop). */
export function isWildcardAddress(address: string): boolean {
  return address === '0.0.0.0' || address === '::' || address === '::ffff:0.0.0.0';
}

function positiveInt(env: Env, key: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = get(env, key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 1 || n > max) throw new Error(`${key} must be a whole number from 1 to ${max}`);
  return n;
}

function ipv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every(p => p <= 255) ? (parts as [number, number, number, number]) : null;
}

/**
 * Loopback, RFC1918, Tailscale CGNAT (100.64.0.0/10) and `.local`. `hostname` is as `URL` reports it.
 * Not `.ts.net`: that also covers public Tailscale Funnel hosts on other people's tailnets, so a MagicDNS name
 * has to be named in TL_LOCAL_ALLOW_HOST.
 */
function isInTheHouse(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '[::1]') return true;
  const ip = ipv4(host);
  if (ip) {
    const [a, b] = ip;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return host.endsWith('.local');
}

/** The eight 16-bit groups of an IPv6 address, or null when it is not one (an embedded IPv4 tail counts as two groups). */
function ipv6Groups(address: string): number[] | null {
  if (!net.isIPv6(address)) return null;
  let text = address.toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (tail) {
    const [a, b, c, d] = tail.split('.').map(Number);
    text = text.slice(0, -tail.length) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head, rest] = text.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = rest === undefined || rest === '' ? [] : rest.split(':');
  const fill = rest === undefined ? [] : Array<string>(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map(g => parseInt(g, 16));
}

/**
 * Where the server may listen without being told otherwise: this machine (127.0.0.0/8, ::1, localhost) or the
 * tailnet (100.64.0.0/10, and fd7a:115c:a1e0::/48 for Tailscale IPv6). Not the open LAN: the token and the
 * private text travel over plain HTTP, so only a private overlay network is acceptable.
 */
function isLoopbackOrTailscale(host: string): boolean {
  const bare = host.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (bare === 'localhost') return true;
  if (net.isIPv4(bare)) {
    const [a, b] = bare.split('.').map(Number);
    return a === 127 || (a === 100 && b >= 64 && b <= 127);
  }
  const groups = ipv6Groups(bare);
  if (!groups) return false;
  if (groups.slice(0, 7).every(g => g === 0) && groups[7] === 1) return true;
  return groups[0] === 0xfd7a && groups[1] === 0x115c && groups[2] === 0xa1e0;
}

function parseUrl(raw: string, key: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${key} is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${key} must start with http:// or https://`);
  // These would be copied into error messages that reach API responses.
  if (url.username || url.password || url.search || raw.includes('?')) {
    throw new Error(`${key} must not contain a username, password or query string`);
  }
  return url;
}

export function loadConfig(env: Env): Config {
  const token = env.TL_TOKEN ?? '';
  if (token.trim().length < 24) throw new Error('TL_TOKEN must be set (24+ characters)');
  if (token === PLACEHOLDER_TOKEN) {
    throw new Error('TL_TOKEN is still the placeholder from .env.example; set your own long random token (24+ characters)');
  }
  if (/\s/.test(token)) throw new Error('TL_TOKEN must not contain whitespace');

  const host = env.TL_HOST === undefined ? '127.0.0.1' : env.TL_HOST.trim();
  if (ALL_INTERFACES.has(host.toLowerCase())) {
    throw new Error('Refusing to listen on all interfaces; set TL_HOST to the Tailscale address or 127.0.0.1');
  }
  // The token and the private text cross this socket in plain HTTP, so the default is loopback or the tailnet only.
  if (!isLoopbackOrTailscale(host) && get(env, 'TL_ALLOW_BIND')?.toLowerCase() !== host.toLowerCase()) {
    throw new Error(
      `Refusing to listen on ${host}: it is not loopback or a Tailscale address, and this server speaks plain HTTP. ` +
      'Set TL_HOST to 127.0.0.1 or your Tailscale address, or set TL_ALLOW_BIND to exactly that address to say so on purpose',
    );
  }

  const port = positiveInt(env, 'TL_PORT', 4390, 65535);
  const maxChars = positiveInt(env, 'TL_MAX_CHARS', 24000);
  const dataDir = get(env, 'TL_DATA_DIR') ?? './data';

  const fixtureAnalysisPath = get(env, 'TL_FIXTURE_ANALYSIS');
  const localModel = get(env, 'TL_LOCAL_MODEL');
  if (!localModel && !fixtureAnalysisPath) throw new Error('TL_LOCAL_MODEL must be set (or TL_FIXTURE_ANALYSIS for dev)');

  // Private writing goes to this endpoint, so it has to be a machine in the house unless he says otherwise.
  const localBaseUrl = get(env, 'TL_LOCAL_BASE_URL') ?? 'http://127.0.0.1:1234/v1';
  const localUrl = parseUrl(localBaseUrl, 'TL_LOCAL_BASE_URL');
  if (!isInTheHouse(localUrl.hostname) && get(env, 'TL_LOCAL_ALLOW_HOST')?.toLowerCase() !== localUrl.hostname.toLowerCase()) {
    throw new Error(NOT_IN_THE_HOUSE);
  }

  const cloudBase = get(env, 'TL_CLOUD_BASE_URL');
  const cloudModel = get(env, 'TL_CLOUD_MODEL');
  const cloudKey = get(env, 'TL_CLOUD_API_KEY');
  const cloudSet = [cloudBase, cloudModel, cloudKey].filter(v => v !== undefined).length;
  if (cloudSet > 0 && cloudSet < 3) {
    throw new Error('The cloud model needs TL_CLOUD_BASE_URL, TL_CLOUD_MODEL and TL_CLOUD_API_KEY all set, or none of them');
  }

  const config: Config = {
    host,
    port,
    token,
    dataDir,
    maxChars,
    local: { baseUrl: localBaseUrl, model: localModel ?? 'fixture' },
  };
  if (cloudBase && cloudModel && cloudKey) {
    // The API key goes in a header on every request, so it must not travel in the clear.
    if (parseUrl(cloudBase, 'TL_CLOUD_BASE_URL').protocol !== 'https:') {
      throw new Error('TL_CLOUD_BASE_URL must use https:// (the API key would otherwise travel in the clear)');
    }
    config.cloud = { baseUrl: cloudBase, model: cloudModel, apiKey: cloudKey };
  }
  if (fixtureAnalysisPath) config.fixtureAnalysisPath = fixtureAnalysisPath;
  return config;
}

/**
 * True when `dataDir` sits inside the repository checkout but not under its `data/` folder, the only place
 * .gitignore covers. Both arguments are absolute. The repository is public, so main.ts warns on this.
 */
export function repoDataDirIsNotIgnored(dataDir: string, repoRoot: string): boolean {
  const outside = (rel: string) => rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  if (outside(path.relative(repoRoot, dataDir))) return false;
  return outside(path.relative(path.join(repoRoot, 'data'), dataDir));
}
