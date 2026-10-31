// @vitest-environment jsdom
// App-level tests: a late analysis must not replace the piece on screen, and unsaved writing must survive switching pieces and the token gate.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import type { Piece, PieceSummary, PieceView } from '../../src/core';
import { ApiError, api, setToken } from '../../src/web/api';
import { App } from '../../src/web/App';

const stamp = '2026-10-31T00:00:00.000Z';
const mk = (id: string, title: string, text: string): Piece => ({ id, title, privacy: 'private', text, createdAt: stamp, updatedAt: stamp });
const pieceA = mk('a', 'Alpha piece', 'Alpha saved text.');
const pieceB = mk('b', 'Beta piece', 'Beta saved text.');
const summaries: PieceSummary[] = [pieceA, pieceB].map(p => ({ id: p.id, title: p.title, privacy: p.privacy, updatedAt: stamp, versionCount: 0 }));
const viewOf = (piece: Piece): PieceView => ({ piece, version: null, structure: null, jumps: [], notes: [] });
const byId: Record<string, Piece> = { a: pieceA, b: pieceB };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const textbox = () => screen.getByRole('textbox', { name: /^text$/i }) as HTMLTextAreaElement;
// The list loads asynchronously, so wait for the button.
const pick = async (title: RegExp) => { fireEvent.click(await screen.findByRole('button', { name: title })); };

beforeEach(() => {
  localStorage.clear();
  setToken('t');
  vi.spyOn(api, 'listPieces').mockResolvedValue(summaries);
  vi.spyOn(api, 'readPiece').mockImplementation(async id => viewOf(byId[id]!));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('an analysis that finishes after switching pieces leaves the new piece on screen', async () => {
  const analysis = deferred<never>();
  vi.spyOn(api, 'analyze').mockReturnValue(analysis.promise);
  const readB = deferred<PieceView>();
  render(<App />);

  await pick(/^Alpha piece/);
  await screen.findByRole('heading', { name: 'Alpha piece' });
  fireEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));

  // While the model runs for A, B is chosen and its read is still in flight.
  (api.readPiece as ReturnType<typeof vi.fn>).mockImplementationOnce(() => readB.promise);
  await pick(/^Beta piece/);
  analysis.resolve({} as never);
  await waitFor(() => expect(api.listPieces).toHaveBeenCalledTimes(2)); // the list refresh after A's analysis
  readB.resolve(viewOf(pieceB));

  await screen.findByRole('heading', { name: 'Beta piece' });
  expect(textbox().value).toBe('Beta saved text.');
  // A was read once when chosen; the finished analysis did not reload it.
  expect((api.readPiece as ReturnType<typeof vi.fn>).mock.calls.filter(c => c[0] === 'a')).toHaveLength(1);
  expect(screen.getByRole('button', { name: /^Beta piece/ }).getAttribute('aria-current')).toBe('true');
});

test('an analysis that finishes while New piece is open does not bring the old piece back', async () => {
  const analysis = deferred<never>();
  vi.spyOn(api, 'analyze').mockReturnValue(analysis.promise);
  render(<App />);

  await pick(/^Alpha piece/);
  await screen.findByRole('heading', { name: 'Alpha piece' });
  fireEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));
  fireEvent.click(screen.getByRole('button', { name: 'New piece' }));
  analysis.resolve({} as never);
  await waitFor(() => expect(api.listPieces).toHaveBeenCalledTimes(2));

  expect(screen.getByRole('region', { name: 'New piece' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Alpha piece' })).toBeNull();
});

test('unsaved text survives switching to another piece and back, and is marked', async () => {
  render(<App />);
  await pick(/^Alpha piece/);
  await screen.findByRole('heading', { name: 'Alpha piece' });

  fireEvent.change(textbox(), { target: { value: 'Alpha, half rewritten' } });
  expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0);

  await pick(/^Beta piece/);
  await screen.findByRole('heading', { name: 'Beta piece' });
  expect(textbox().value).toBe('Beta saved text.');
  // The mark stays in the list while A's draft waits.
  expect(screen.getByRole('button', { name: /^Alpha piece.*Unsaved changes/ })).toBeTruthy();

  await pick(/^Alpha piece/);
  await screen.findByRole('heading', { name: 'Alpha piece' });
  expect(textbox().value).toBe('Alpha, half rewritten');

  // Choosing the piece that is already open keeps the draft too, and typing the saved text back clears the mark.
  await pick(/^Alpha piece/);
  await screen.findByRole('heading', { name: 'Alpha piece' });
  expect(textbox().value).toBe('Alpha, half rewritten');
  fireEvent.change(textbox(), { target: { value: 'Alpha saved text.' } });
  expect(screen.queryByText('Unsaved changes')).toBeNull();
});

test('a half-written new piece survives leaving the form and coming back', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'New piece' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Draft title' } });
  fireEvent.change(textbox(), { target: { value: 'Draft body' } });

  await pick(/^Beta piece/);
  await screen.findByRole('heading', { name: 'Beta piece' });
  fireEvent.click(screen.getByRole('button', { name: 'New piece' }));

  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Draft title');
  expect(textbox().value).toBe('Draft body');
});

test('a 401 at save time returns to the gate, and after the token is entered again the draft and the piece are still there', async () => {
  // Real api and a stubbed fetch, so the 401 goes through the same path as in the browser.
  vi.restoreAllMocks();
  let tokenAccepted = false;
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const auth = (init.headers as Record<string, string>).Authorization;
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const stale = new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    if (auth !== 'Bearer t' && auth !== 'Bearer fresh') return stale;
    if (auth === 'Bearer t' && tokenAccepted) return stale;
    if (url === '/api/pieces' && init.method === 'GET') return ok(summaries);
    if (url === '/api/pieces/a' && init.method === 'GET') return ok(viewOf(pieceA));
    if (url === '/api/pieces/a/text') {
      // The first save arrives with the expired token.
      if (auth === 'Bearer t') { tokenAccepted = true; return stale; }
      return ok({ ...pieceA, text: JSON.parse(init.body as string).text });
    }
    return new Response(JSON.stringify({ error: 'unexpected ' + url }), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(api, 'analyze').mockRejectedValue(new ApiError('stop after save', 502));

  render(<App />);
  await pick(/^Alpha piece/);
  await screen.findByRole('heading', { name: 'Alpha piece' });
  fireEvent.change(textbox(), { target: { value: 'Alpha, rewritten before the token expired' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save and analyse' }));

  const gate = await screen.findByLabelText('Access token');
  expect(screen.getByRole('alert').textContent).toMatch(/did not accept/i);

  fireEvent.change(gate, { target: { value: 'fresh' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));

  await screen.findByRole('heading', { name: 'Alpha piece' });
  expect(textbox().value).toBe('Alpha, rewritten before the token expired');
  expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0);
});

test('a failed read shows the error and not Loading', async () => {
  (api.readPiece as ReturnType<typeof vi.fn>).mockRejectedValue(new ApiError('Piece not found', 404));
  render(<App />);
  await pick(/^Alpha piece/);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Piece not found');
  expect(screen.queryByText('Loading.')).toBeNull();
});

// An analysed piece: the Logic map's stations select their passage in the editor, unless the editor no longer shows the analysed text.
const analysed = (): PieceView => {
  const text = 'Tides follow the moon. Fishermen plan around the tides.';
  const piece = mk('c', 'Gamma piece', text);
  const analysis = {
    stations: [
      { id: 's1', claim: 'Tides follow the moon', passage: 'Tides follow the moon.', role: 'premise', expressed: 0.8, grounding: 'evidence' },
      { id: 's2', claim: 'Fishermen plan around the tides', passage: 'Fishermen plan around the tides.', role: 'conclusion', expressed: 0.7, grounding: 'example' },
    ],
    links: [{ from: 's1', to: 's2', required: true }],
    motifs: [],
    language: 'en',
    model: 'fake',
    createdAt: stamp,
  } as const;
  return {
    piece,
    version: { id: 'v1', pieceId: 'c', savedAt: stamp, text, analysis: analysis as never },
    structure: { interchanges: [], loops: [], deadEnds: [] },
    jumps: [],
    notes: [],
  };
};

const addGamma = () => {
  if (!summaries.some(p => p.id === 'c')) summaries.push({ id: 'c', title: 'Gamma piece', privacy: 'private', updatedAt: stamp, versionCount: 1 });
};

test('clicking a station on the Logic map selects its passage in the editor', async () => {
  const view = analysed();
  byId.c = view.piece;
  addGamma();
  (api.readPiece as ReturnType<typeof vi.fn>).mockImplementation(async id => (id === 'c' ? view : viewOf(byId[id]!)));
  render(<App />);
  await pick(/^Gamma piece/);
  await screen.findByRole('heading', { name: 'Gamma piece' });

  fireEvent.click(await screen.findByRole('button', { name: /^Fishermen plan around the tides/ }));
  const box = textbox();
  expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe('Fishermen plan around the tides.');
  expect(document.activeElement).toBe(box);
  expect(screen.queryByRole('status')).toBeNull();
});

test('with an unsaved draft the click selects nothing and says why', async () => {
  const view = analysed();
  byId.c = view.piece;
  addGamma();
  (api.readPiece as ReturnType<typeof vi.fn>).mockImplementation(async id => (id === 'c' ? view : viewOf(byId[id]!)));
  render(<App />);
  await pick(/^Gamma piece/);
  await screen.findByRole('heading', { name: 'Gamma piece' });

  fireEvent.change(textbox(), { target: { value: `${view.piece.text} A new sentence.` } });
  const before = [textbox().selectionStart, textbox().selectionEnd];
  fireEvent.click(await screen.findByRole('button', { name: /^Tides follow the moon/ }));
  expect(screen.getByRole('status').textContent).toBe('The text changed since this map was made. Save and analyse to update it.');
  expect([textbox().selectionStart, textbox().selectionEnd]).toEqual(before);
});
