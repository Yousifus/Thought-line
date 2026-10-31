// The app shell: token gate, then three columns (piece list, editor, Logic and Thought tabs). Holds the piece list and the current PieceView.
// Selection and unsaved drafts live in App, above the token gate, so neither is lost by switching pieces or by a 401 at save time.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Piece, PieceSummary, PieceView, Privacy, Range } from '../core';
import { UNAUTHORIZED_EVENT, api, getToken, setToken } from './api';
import { revealRange } from './editorSelection';
import { ErrorNote, messageOf } from './components/ErrorNote';
import { NewPiece } from './components/NewPiece';
import type { NewDraft } from './components/NewPiece';
import { PieceEditor } from './components/PieceEditor';
import { PieceList } from './components/PieceList';
import { Tabs } from './components/Tabs';
import { TokenGate } from './components/TokenGate';

const REJECTED = 'The server did not accept that token. Enter it again.';
// Task 12 computes real counts; until then no station shows a note badge.
const NO_NOTES: Record<string, number> = {};
const EMPTY_NEW: NewDraft = { title: '', text: '', privacy: 'private' satisfies Privacy };

interface Session {
  selectedId: string | null;
  creating: boolean;
  /** Unsaved text per piece id; an entry exists only while it differs from the saved text. */
  drafts: Record<string, string>;
  newDraft: NewDraft;
}
type Update = (fn: (s: Session) => Session) => void;

export function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [gateMessage, setGateMessage] = useState<string | null>(null);
  const [session, setSession] = useState<Session>({ selectedId: null, creating: false, drafts: {}, newDraft: EMPTY_NEW });

  // Any 401 clears the stored token inside api.ts; this brings the page back to the gate.
  useEffect(() => {
    const onUnauthorized = () => { setTokenState(null); setGateMessage(REJECTED); };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!token) {
    return <TokenGate message={gateMessage} onToken={t => { setToken(t); setGateMessage(null); setTokenState(t); }} />;
  }
  return <Workspace session={session} update={setSession} />;
}

function Workspace({ session, update }: { session: Session; update: Update }) {
  const { selectedId, creating, drafts, newDraft } = session;
  const [pieces, setPieces] = useState<PieceSummary[]>([]);
  const [view, setView] = useState<PieceView | null>(null);
  const [viewFailed, setViewFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the latest read may set the view, so a slow response for an earlier piece cannot overwrite a newer choice.
  const latestRead = useRef(0);
  // What is selected right now, readable from callbacks of an editor that has since unmounted.
  const selectedRef = useRef(selectedId);
  // The editor's textarea, so a station on the Logic map can select its passage there.
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const refreshList = useCallback(async () => {
    try {
      setPieces(await api.listPieces());
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  const loadView = useCallback(async (id: string) => {
    const seq = ++latestRead.current;
    try {
      const next = await api.readPiece(id);
      if (seq === latestRead.current) { setView(next); setViewFailed(false); }
    } catch (err) {
      if (seq === latestRead.current) { setError(messageOf(err)); setViewFailed(true); }
    }
  }, []);

  // On first load, and again when the token gate brought this component back, show the piece that was selected.
  useEffect(() => {
    void refreshList();
    if (selectedRef.current) void loadView(selectedRef.current);
  }, [refreshList, loadView]);

  const select = (id: string) => {
    selectedRef.current = id;
    setError(null);
    setViewFailed(false);
    setView(null);
    update(s => ({ ...s, selectedId: id, creating: false }));
    void loadView(id);
  };

  const startNew = () => {
    selectedRef.current = null;
    latestRead.current++;
    setError(null);
    setViewFailed(false);
    setView(null);
    update(s => ({ ...s, selectedId: null, creating: true }));
  };

  const created = (piece: Piece) => {
    update(s => ({ ...s, newDraft: EMPTY_NEW }));
    void refreshList();
    select(piece.id);
  };

  const withDraft = (drafts: Record<string, string>, id: string, text: string | null) => {
    const next = { ...drafts };
    if (text === null) delete next[id]; else next[id] = text;
    return next;
  };

  const setDraft = (id: string, text: string | null) => update(s => ({ ...s, drafts: withDraft(s.drafts, id, text) }));

  const saved = (piece: Piece) => {
    setView(v => (v && v.piece.id === piece.id ? { ...v, piece } : v));
    update(s => (s.drafts[piece.id] === piece.text ? { ...s, drafts: withDraft(s.drafts, piece.id, null) } : s));
    void refreshList();
  };

  // An analysis can finish after another piece was selected (or New piece opened). Then only the list changes:
  // reloading would replace the piece on screen with the one he left.
  const analysed = (id: string) => {
    void refreshList();
    if (selectedRef.current === id) void loadView(id);
  };

  // What the editor shows: the unsaved draft if there is one, else the saved text.
  const editorText = view ? (drafts[view.piece.id] ?? view.piece.text) : '';
  const reveal = (range: Range) => { if (editorRef.current) revealRange(editorRef.current, range); };

  return (
    <div className="app">
      <header className="top">
        <svg className="mark" width="44" height="14" viewBox="0 0 44 14" aria-hidden="true">
          <path d="M5 7h34" stroke="var(--line-blue)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="5" cy="7" r="4" fill="var(--surface)" stroke="var(--line-blue)" strokeWidth="3" />
          <circle cx="22" cy="7" r="4" fill="var(--surface)" stroke="var(--line-green)" strokeWidth="3" />
          <circle cx="39" cy="7" r="4" fill="var(--surface)" stroke="var(--line-orange)" strokeWidth="3" />
        </svg>
        <h1>Thought-line</h1>
      </header>
      <ErrorNote message={error} />
      <div className="columns">
        <PieceList pieces={pieces} selectedId={selectedId} unsavedIds={Object.keys(drafts)} onSelect={select} onNew={startNew} />
        <div className="centre">
          {creating ? (
            <NewPiece draft={newDraft} onDraftChange={d => update(s => ({ ...s, newDraft: d }))} onCreated={created} />
          ) : view ? (
            <PieceEditor
              key={view.piece.id}
              piece={view.piece}
              draft={drafts[view.piece.id]}
              textareaRef={editorRef}
              onDraftChange={text => setDraft(view.piece.id, text)}
              onSaved={saved}
              onAnalyzed={() => analysed(view.piece.id)}
            />
          ) : (
            <p className="placeholder">
              {!selectedId ? 'Choose a piece, or start a new one.' : viewFailed ? 'This piece could not be opened.' : 'Loading.'}
            </p>
          )}
        </div>
        <Tabs view={view} noteCounts={NO_NOTES} editorText={editorText} onReveal={reveal} />
      </div>
    </div>
  );
}
