// The left column: every piece as a stop on a line, with a privacy badge and a New piece button.
import type { PieceSummary } from '../../core';

export function PieceList({ pieces, selectedId, onSelect, onNew }: {
  pieces: PieceSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <nav className="pieces" aria-label="Pieces">
      <button type="button" className="primary" onClick={onNew}>New piece</button>
      {pieces.length === 0 ? <p className="hint">No pieces yet.</p> : null}
      <ol>
        {pieces.map(p => (
          <li key={p.id}>
            <button
              type="button"
              className={p.id === selectedId ? 'stop current' : 'stop'}
              aria-current={p.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(p.id)}
            >
              <span className="title" dir="auto">{p.title}</span>
              <span className={`badge ${p.privacy}`}>{p.privacy === 'private' ? 'Private' : 'Public'}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
