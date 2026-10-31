// @vitest-environment jsdom
// Tests for the web API client: the token header, error mapping, and the 401 reset.
import { afterEach, beforeEach, vi } from 'vitest';
import { ApiError, UNAUTHORIZED_EVENT, api, getToken, setToken } from '../../src/web/api';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

test('every call carries the token', async () => {
  setToken('t');
  const fetchMock = vi.fn(async () => json([]));
  vi.stubGlobal('fetch', fetchMock);

  await api.listPieces();
  await api.readPiece('p1', 'v 1');
  await api.updateText('p1', 'hello');

  const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
  expect(calls).toHaveLength(3);
  for (const [, init] of calls) {
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
  }
  expect(calls[1]![0]).toBe('/api/pieces/p1?version=v%201');
  expect(calls[2]![1].method).toBe('PUT');
  expect(JSON.parse(calls[2]![1].body as string)).toEqual({ text: 'hello' });
});

test('addNote sends yousef as the author', async () => {
  setToken('t');
  const fetchMock = vi.fn(async () => json({}, 201));
  vi.stubGlobal('fetch', fetchMock);
  await api.addNote('p1', { body: 'why?', quote: 'a passage' });
  const [url, init] = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0]!;
  expect(url).toBe('/api/pieces/p1/notes');
  expect(JSON.parse(init.body as string)).toEqual({ author: 'yousef', body: 'why?', quote: 'a passage' });
});

test('an error response keeps the server message and status', async () => {
  setToken('t');
  vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Model at http://127.0.0.1:1234/v1 unreachable' }, 502)));
  const err = await api.analyze('p1').catch(e => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(502);
  expect(err.message).toContain('127.0.0.1:1234');
});

test('a 401 clears the stored token and announces it', async () => {
  setToken('stale');
  const heard = vi.fn();
  window.addEventListener(UNAUTHORIZED_EVENT, heard);
  vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Unauthorized' }, 401)));
  const err = await api.listPieces().catch(e => e);
  window.removeEventListener(UNAUTHORIZED_EVENT, heard);
  expect(err.status).toBe(401);
  expect(getToken()).toBeNull();
  expect(heard).toHaveBeenCalledTimes(1);
});

test('a server that cannot be reached becomes an ApiError with status 0', async () => {
  setToken('t');
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  const err = await api.listPieces().catch(e => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(0);
  expect(err.message).toMatch(/reach/i);
});
