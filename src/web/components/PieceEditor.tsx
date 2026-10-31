// The centre column for an existing piece: title, text, privacy, and "Save and analyse", which saves the text and then runs the analysis.
import { useState } from 'react';
import type { Piece, Privacy } from '../../core';
import { api } from '../api';
import { ErrorNote, messageOf } from './ErrorNote';
import { PrivacyToggle } from './PrivacyToggle';

type Phase = 'idle' | 'saving' | 'analysing';

export function PieceEditor({ piece, draft, onDraftChange, onSaved, onAnalyzed }: {
  piece: Piece;
  /** Unsaved text kept above this component, so it survives switching pieces and the token gate. */
  draft?: string;
  /** Called on each edit with the new text, or null when the text is back to the saved text. */
  onDraftChange?: (text: string | null) => void;
  /** Called with the stored piece after the text or privacy was saved. */
  onSaved: (piece: Piece) => void;
  /** Called once an analysis finished and a new version exists. */
  onAnalyzed: () => void;
}) {
  const [text, setText] = useState(draft ?? piece.text);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== 'idle';
  const dirty = text !== piece.text;

  const edit = (next: string) => {
    setText(next);
    onDraftChange?.(next === piece.text ? null : next);
  };

  const saveAndAnalyse = async () => {
    setError(null);
    try {
      if (dirty) {
        setPhase('saving');
        onSaved(await api.updateText(piece.id, text));
      }
      setPhase('analysing');
      await api.analyze(piece.id);
      onAnalyzed();
    } catch (err) {
      // The text stays exactly as typed; only the message appears.
      setError(messageOf(err));
    } finally {
      setPhase('idle');
    }
  };

  const changePrivacy = async (privacy: Privacy) => {
    setError(null);
    try {
      onSaved(await api.setPrivacy(piece.id, privacy));
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="editor" aria-label="Editor">
      <h2 dir="auto">{piece.title}</h2>
      <PrivacyToggle value={piece.privacy} onChange={changePrivacy} disabled={busy} />
      <label htmlFor="piece-text">Text</label>
      <textarea id="piece-text" dir="auto" value={text} readOnly={busy} onChange={e => edit(e.target.value)} spellCheck={false} />
      <div className="actions">
        <button type="button" className="primary" disabled={busy || text.trim() === ''} onClick={saveAndAnalyse}>
          {phase === 'saving' ? 'Saving' : phase === 'analysing' ? 'Analysing' : 'Save and analyse'}
        </button>
        {dirty && !busy ? <span className="unsaved">Unsaved changes</span> : null}
        {phase === 'analysing' ? <span className="hint">The model is reading. This can take a minute.</span> : null}
      </div>
      <ErrorNote message={error} />
    </section>
  );
}
