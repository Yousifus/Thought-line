// Tests for the OpenAI-compatible provider and for privacy routing (private pieces never reach the cloud).
import { TEMPERATURE, openAICompatible, providerFor, ProviderError } from '../../src/core/provider';
import { fakeProvider } from '../helpers/fakeProvider';

const req = { system: 's', user: 'u', schemaName: 'analysis', jsonSchema: {} };
const okResponse = (content = '{}') => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

test('posts an OpenAI-style request with a JSON schema and no auth header for a local model', async () => {
  const seen: any[] = [];
  const fetchImpl = async (url: any, init: any) => { seen.push({ url, init }); return okResponse(); };
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', fetchImpl: fetchImpl as any });
  expect(await p.complete({ system: 's', user: 'u', schemaName: 'analysis', jsonSchema: {} })).toBe('{}');
  expect(seen[0].url).toBe('http://x/v1/chat/completions');
  expect(JSON.parse(seen[0].init.body).response_format.type).toBe('json_schema');
  expect(seen[0].init.headers.Authorization).toBeUndefined();
});
test('the request body has the exact shape the brief fixes', async () => {
  // 0.2, not 0: reproducibility comes from the text-keyed version, not from a colder model.
  const seen: any[] = [];
  const fetchImpl = async (_url: any, init: any) => { seen.push(init); return okResponse(); };
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm1', kind: 'local', fetchImpl: fetchImpl as any });
  await p.complete({ system: 'SYS', user: 'USR', schemaName: 'analysis', jsonSchema: { type: 'object' } });
  expect(seen[0].method).toBe('POST');
  expect(JSON.parse(seen[0].body)).toEqual({
    model: 'm1',
    temperature: TEMPERATURE,
    messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USR' }],
    response_format: { type: 'json_schema', json_schema: { name: 'analysis', strict: true, schema: { type: 'object' } } },
  });
});
test('the provider is named after its model and keeps its kind', () => {
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'gemma', kind: 'cloud', fetchImpl: (async () => okResponse()) as any });
  expect(p.name).toBe('gemma');
  expect(p.kind).toBe('cloud');
});
test('sends a bearer token only when an apiKey is set, and tolerates a trailing slash on baseUrl', async () => {
  const seen: any[] = [];
  const fetchImpl = async (url: any, init: any) => { seen.push({ url, init }); return okResponse(); };
  const p = openAICompatible({ baseUrl: 'http://x/v1/', model: 'm', kind: 'cloud', apiKey: 'k', fetchImpl: fetchImpl as any });
  await p.complete(req);
  expect(seen[0].init.headers.Authorization).toBe('Bearer k');
  expect(seen[0].url).toBe('http://x/v1/chat/completions');
});
test('an unreachable model names its address', async () => {
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as any });
  await expect(p.complete({ system: '', user: '', schemaName: 'a', jsonSchema: {} })).rejects.toThrow(/http:\/\/x\/v1/);
  await expect(p.complete(req)).rejects.toBeInstanceOf(ProviderError);
});
test('a non-2xx response is a ProviderError naming the address and status', async () => {
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', fetchImpl: (async () => new Response('boom', { status: 500 })) as any });
  await expect(p.complete(req)).rejects.toThrow(/http:\/\/x\/v1 returned 500/);
});
test('a reply without message content is a ProviderError', async () => {
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', fetchImpl: (async () => new Response(JSON.stringify({ choices: [] }))) as any });
  await expect(p.complete(req)).rejects.toBeInstanceOf(ProviderError);
});
test('a request that outlives timeoutMs is aborted and reported as a timeout', async () => {
  const fetchImpl = (_url: any, init: any) => new Promise<Response>((_res, rej) => {
    init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  });
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', timeoutMs: 20, fetchImpl: fetchImpl as any });
  await expect(p.complete(req)).rejects.toThrow(/http:\/\/x\/v1 unreachable: .*timed out/);
});
test('the caller signal aborts the request too', async () => {
  const fetchImpl = (_url: any, init: any) => new Promise<Response>((_res, rej) => {
    init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
  });
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', fetchImpl: fetchImpl as any });
  const ctl = new AbortController();
  const pending = p.complete(req, ctl.signal);
  ctl.abort();
  await expect(pending).rejects.toBeInstanceOf(ProviderError);
});
test('an already-aborted caller signal never reaches the network', async () => {
  let called = false;
  const p = openAICompatible({ baseUrl: 'http://x/v1', model: 'm', kind: 'local', fetchImpl: (async () => { called = true; return okResponse(); }) as any });
  const ctl = new AbortController();
  ctl.abort();
  await expect(p.complete(req, ctl.signal)).rejects.toBeInstanceOf(ProviderError);
  expect(called).toBe(false);
});
test('private pieces never go to the cloud', () => {
  const local = fakeProvider([], 'local'), cloud = fakeProvider([], 'cloud');
  expect(providerFor('private', { local, cloud })).toBe(local);
  expect(providerFor('public', { local, cloud })).toBe(cloud);
  expect(providerFor('public', { local })).toBe(local);
});
test('a private piece is refused when the provider passed as local is really a cloud one', () => {
  const cloudAsLocal = fakeProvider([], 'cloud');
  expect(() => providerFor('private', { local: cloudAsLocal })).toThrow(ProviderError);
});
