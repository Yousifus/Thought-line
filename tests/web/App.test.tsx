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

// Notes and the Thought tab, end to end through the app.
const withMotifsAndNote = (): PieceView => {
  const view = analysed();
  const text = view.piece.text;
  const start = text.indexOf('plan around');
  (view.version!.analysis as { motifs: unknown }).motifs = [
    { motif: 'moon', label: 'moon', passage: 'follow the moon', order: 0 },
    { motif: 'tide', label: 'tide', passage: 'around the tides', order: 1 },
  ];
  view.notes = [{
    id: 'n1', pieceId: 'c', author: 'claude-test', body: 'Plans follow the water.', createdAt: stamp,
    anchor: { quote: 'plan around', prefix: 'Fishermen ', suffix: ' the tides.', start },
    range: { start, end: start + 'plan around'.length },
  }];
  return view;
};
const openGamma = async (view: PieceView) => {
  byId.c = view.piece;
  addGamma();
  (api.readPiece as ReturnType<typeof vi.fn>).mockImplementation(async id => (id === 'c' ? view : viewOf(byId[id]!)));
  render(<App />);
  await pick(/^Gamma piece/);
  await screen.findByRole('heading', { name: 'Gamma piece' });
};

test('a note badges the station it sits on and is listed in the margin with its author', async () => {
  await openGamma(withMotifsAndNote());
  expect(await screen.findByText('1 note')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Fishermen plan around the tides.*1 note/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Tides follow the moon/ }).getAttribute('aria-label')).not.toContain('note');
  const margin = screen.getByRole('region', { name: 'Notes' });
  expect(margin.textContent).toContain('claude-test');
  expect(margin.textContent).toContain('Plans follow the water.');
});

test('clicking a note selects its passage in the editor', async () => {
  await openGamma(withMotifsAndNote());
  fireEvent.click(await screen.findByRole('button', { name: /Show .* in the text/ }));
  const box = textbox();
  expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe('plan around');
});

test('clicking an image on the Thought tab selects its first passage in the editor', async () => {
  await openGamma(withMotifsAndNote());
  fireEvent.click(screen.getByRole('tab', { name: 'Thought' }));
  fireEvent.click(await screen.findByRole('button', { name: /^tide/ }));
  const box = textbox();
  expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe('around the tides');
});

test('adding a note from the editor posts it and reloads the piece', async () => {
  const view = withMotifsAndNote();
  await openGamma(view);
  const add = vi.spyOn(api, 'addNote').mockResolvedValue({} as never);
  const reads = (api.readPiece as ReturnType<typeof vi.fn>).mock.calls.length;
  const box = textbox();
  box.focus();
  box.setSelectionRange(0, 'Tides follow the moon.'.length);
  fireEvent.mouseUp(box);
  fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'An opening.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
  await waitFor(() => expect((api.readPiece as ReturnType<typeof vi.fn>).mock.calls.length).toBe(reads + 1));
  expect(add).toHaveBeenCalledWith('c', expect.objectContaining({ body: 'An opening.', quote: 'Tides follow the moon.' }));
});

test('with an unsaved draft, a click on a note says the text changed and selects nothing', async () => {
  const view = withMotifsAndNote();
  await openGamma(view);
  fireEvent.change(textbox(), { target: { value: `${view.piece.text} More.` } });
  fireEvent.click(await screen.findByRole('button', { name: /Show .* in the text/ }));
  expect(screen.getByRole('status').textContent).toBe('The text changed since this map was made. Save and analyse to update it.');
});

describe('leaving the page with unsaved writing asks first', () => {
  /** Fires beforeunload the way the browser does and reports whether a handler asked to stop the page closing. */
  const leaveIsGuarded = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  test('no guard while everything is saved', async () => {
    render(<App />);
    expect(leaveIsGuarded()).toBe(false);
    await pick(/^Alpha piece/);
    await screen.findByRole('heading', { name: 'Alpha piece' });
    expect(leaveIsGuarded()).toBe(false);
  });

  test('a guard while a piece has unsaved text, gone again when the text is back to the saved text', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(<App />);
    await pick(/^Alpha piece/);
    await screen.findByRole('heading', { name: 'Alpha piece' });

    fireEvent.change(textbox(), { target: { value: 'Alpha, half rewritten' } });
    expect(add.mock.calls.some(c => c[0] === 'beforeunload')).toBe(true);
    expect(leaveIsGuarded()).toBe(true);

    // The draft belongs to the piece, not to the screen: it still guards after switching away.
    await pick(/^Beta piece/);
    await screen.findByRole('heading', { name: 'Beta piece' });
    expect(leaveIsGuarded()).toBe(true);

    await pick(/^Alpha piece/);
    await screen.findByRole('heading', { name: 'Alpha piece' });
    fireEvent.change(textbox(), { target: { value: 'Alpha saved text.' } });
    expect(leaveIsGuarded()).toBe(false);
  });

  test('a guard while the new-piece form has anything in it, gone when it is emptied', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New piece' }));
    expect(leaveIsGuarded()).toBe(false);
    fireEvent.change(textbox(), { target: { value: 'Draft body' } });
    expect(leaveIsGuarded()).toBe(true);
    fireEvent.change(textbox(), { target: { value: '' } });
    expect(leaveIsGuarded()).toBe(false);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Draft title' } });
    expect(leaveIsGuarded()).toBe(true);
  });

  test('the guard is removed when the app goes away', async () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'New piece' }));
    fireEvent.change(textbox(), { target: { value: 'Draft body' } });
    expect(leaveIsGuarded()).toBe(true);
    unmount();
    expect(leaveIsGuarded()).toBe(false);
  });

  test('drafts are never written to browser storage', async () => {
    render(<App />);
    await pick(/^Alpha piece/);
    await screen.findByRole('heading', { name: 'Alpha piece' });
    fireEvent.change(textbox(), { target: { value: 'Alpha, a private rewrite' } });
    fireEvent.click(screen.getByRole('button', { name: 'New piece' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A private title' } });
    fireEvent.change(textbox(), { target: { value: 'A private body' } });
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        expect(store.getItem(store.key(i)!)).not.toMatch(/private|rewrite/);
      }
    }
  });
});
