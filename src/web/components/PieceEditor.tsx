// The centre column for an existing piece: title, text, privacy, and "Save and analyse", which saves the text and then runs the analysis.
// Selecting text offers "Add note", when the editor shows exactly the text notes attach to.
import { useState } from 'react';
import type { FormEvent, Ref } from 'react';
import type { Piece, Privacy } from '../../core';
import { api } from '../api';
import { ErrorNote, messageOf } from './ErrorNote';
import { PrivacyToggle } from './PrivacyToggle';

type Phase = 'idle' | 'saving' | 'analysing';

/** How much text on each side of a note's quote is stored with it, so a repeated quote resolves to the right place. */
const CONTEXT = 32;
const NOTE_NEEDS_TEXT = 'A note needs some text.';
const NOTE_NEEDS_SAVE = 'Notes attach to saved text. Save and analyse, then select the passage again.';

export function PieceEditor({ piece, draft, textareaRef, noteText, onNoteAdded, onDraftChange, onSaved, onAnalyzed }: {
  piece: Piece;
  /** Unsaved text kept above this component, so it survives switching pieces and the token gate. */
  draft?: string;
  /** Lets the Logic map select a passage in the box. */
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** The text notes attach to (the analysed text, or the saved text before any analysis). Without it, notes cannot be added here. */
  noteText?: string;
  /** Called after a note was stored, so the view can be read again. */
  onNoteAdded?: () => void;
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

  // What is selected in the box, kept when focus moves to the note field. Cleared by an edit or a collapsed selection.
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);

  const edit = (next: string) => {
    setText(next);
    setSel(null);
    onDraftChange?.(next === piece.text ? null : next);
  };

  const readSelection = (el: HTMLTextAreaElement) => {
    const { selectionStart: start, selectionEnd: end } = el;
    // Spaces alone are not a passage.
    const next = start < end && el.value.slice(start, end).trim() !== '' ? { start, end } : null;
    setSel(prev => (prev?.start === next?.start && prev?.end === next?.end ? prev : next));
    if (next === null) setNoteError(null);
  };

  const canNote = noteText !== undefined && text === noteText;
  const quote = sel ? text.slice(sel.start, sel.end) : '';

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!sel) return;
    const body = noteBody.trim();
    if (body === '') { setNoteError(NOTE_NEEDS_TEXT); return; }
    setNoteError(null);
    setNoteBusy(true);
    try {
      await api.addNote(piece.id, {
        body,
        quote,
        prefix: text.slice(Math.max(0, sel.start - CONTEXT), sel.start),
        suffix: text.slice(sel.end, sel.end + CONTEXT),
      });
      setNoteBody('');
      setSel(null);
      onNoteAdded?.();
    } catch (err) {
      // The note text stays so it is not lost.
      setNoteError(messageOf(err));
    } finally {
      setNoteBusy(false);
    }
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
      <textarea
        id="piece-text"
        ref={textareaRef}
        dir="auto"
        value={text}
        readOnly={busy}
        onChange={e => edit(e.target.value)}
        onSelect={e => readSelection(e.currentTarget)}
        onMouseUp={e => readSelection(e.currentTarget)}
        onKeyUp={e => readSelection(e.currentTarget)}
        spellCheck={false}
      />
      <div className="actions">
        <button type="button" className="primary" disabled={busy || text.trim() === ''} onClick={saveAndAnalyse}>
          {phase === 'saving' ? 'Saving' : phase === 'analysing' ? 'Analysing' : 'Save and analyse'}
        </button>
        {dirty && !busy ? <span className="unsaved">Unsaved changes</span> : null}
        {phase === 'analysing' ? <span className="hint">The model is reading. This can take a minute.</span> : null}
      </div>
      <ErrorNote message={error} />
      {sel && noteText !== undefined ? (
        canNote ? (
          <form className="add-note" aria-label="Add note" onSubmit={addNote}>
            <p className="add-note-quote-label">Note on this passage</p>
            <blockquote dir="auto">{quote.length > 160 ? `${Array.from(quote).slice(0, 160).join('')}…` : quote}</blockquote>
            <label htmlFor="note-body">Note</label>
            <textarea id="note-body" className="note-input" dir="auto" value={noteBody} onChange={e => setNoteBody(e.target.value)} />
            <div className="actions">
              <button type="submit" className="primary" disabled={noteBusy}>Add note</button>
            </div>
            <ErrorNote message={noteError} />
          </form>
        ) : (
          <p className="stale-note" role="status">{NOTE_NEEDS_SAVE}</p>
        )
      ) : null}
    </section>
  );
}
