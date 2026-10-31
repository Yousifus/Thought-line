// The centre column for a piece that does not exist yet: title, text and privacy (Private by default), then Create. The draft lives in App.
import { useState } from 'react';
import type { Piece, Privacy } from '../../core';
import { api } from '../api';
import { ErrorNote, messageOf } from './ErrorNote';
import { PrivacyToggle } from './PrivacyToggle';

export interface NewDraft { title: string; text: string; privacy: Privacy }

export function NewPiece({ draft, onDraftChange, onCreated }: {
  draft: NewDraft;
  onDraftChange: (draft: NewDraft) => void;
  onCreated: (piece: Piece) => void;
}) {
  const { title, text, privacy } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      onCreated(await api.createPiece({ title: title.trim(), text, privacy }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="editor" aria-label="New piece">
      <h2>New piece</h2>
      <label htmlFor="new-title">Title</label>
      <input id="new-title" dir="auto" value={title} onChange={e => onDraftChange({ ...draft, title: e.target.value })} />
      <PrivacyToggle value={privacy} onChange={p => onDraftChange({ ...draft, privacy: p })} disabled={busy} />
      <label htmlFor="new-text">Text</label>
      <textarea id="new-text" dir="auto" value={text} readOnly={busy} onChange={e => onDraftChange({ ...draft, text: e.target.value })} spellCheck={false} />
      <div className="actions">
        <button type="button" className="primary" disabled={busy || title.trim() === '' || text.trim() === ''} onClick={create}>
          Create piece
        </button>
      </div>
      <ErrorNote message={error} />
    </section>
  );
}
