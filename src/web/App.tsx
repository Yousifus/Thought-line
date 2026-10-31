// The app shell: token gate, then three columns (piece list, editor, Logic and Thought tabs). Holds the piece list and the current PieceView.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Piece, PieceSummary, PieceView } from '../core';
import { UNAUTHORIZED_EVENT, api, getToken, setToken } from './api';
import { ErrorNote, messageOf } from './components/ErrorNote';
import { NewPiece } from './components/NewPiece';
import { PieceEditor } from './components/PieceEditor';
import { PieceList } from './components/PieceList';
import { Tabs } from './components/Tabs';
import { TokenGate } from './components/TokenGate';

const REJECTED = 'The server did not accept that token. Enter it again.';

export function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [gateMessage, setGateMessage] = useState<string | null>(null);

  // Any 401 clears the stored token inside api.ts; this brings the page back to the gate.
  useEffect(() => {
    const onUnauthorized = () => { setTokenState(null); setGateMessage(REJECTED); };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (!token) {
    return <TokenGate message={gateMessage} onToken={t => { setToken(t); setGateMessage(null); setTokenState(t); }} />;
  }
  return <Workspace />;
}

function Workspace() {
  const [pieces, setPieces] = useState<PieceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<PieceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the latest read may set the view, so a slow response for an earlier piece cannot overwrite a newer choice.
  const latestRead = useRef(0);

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
      if (seq === latestRead.current) setView(next);
    } catch (err) {
      if (seq === latestRead.current) setError(messageOf(err));
    }
  }, []);

  useEffect(() => { void refreshList(); }, [refreshList]);

  const select = (id: string) => {
    setError(null);
    setCreating(false);
    setSelectedId(id);
    setView(null);
    void loadView(id);
  };

  const startNew = () => {
    setError(null);
    setCreating(true);
    setSelectedId(null);
    setView(null);
    latestRead.current++;
  };

  const created = (piece: Piece) => {
    void refreshList();
    select(piece.id);
  };

  const saved = (piece: Piece) => {
    setView(v => (v && v.piece.id === piece.id ? { ...v, piece } : v));
    void refreshList();
  };

  const analysed = () => {
    void refreshList();
    if (selectedId) void loadView(selectedId);
  };

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
        <PieceList pieces={pieces} selectedId={selectedId} onSelect={select} onNew={startNew} />
        <div className="centre">
          {creating ? (
            <NewPiece onCreated={created} />
          ) : view ? (
            <PieceEditor key={view.piece.id} piece={view.piece} onSaved={saved} onAnalyzed={analysed} />
          ) : (
            <p className="placeholder">{selectedId ? 'Loading.' : 'Choose a piece, or start a new one.'}</p>
          )}
        </div>
        <Tabs view={view} />
      </div>
    </div>
  );
}
