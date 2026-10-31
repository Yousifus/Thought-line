// The notes margin: every note on the piece with its author, body and the passage it was left on, oldest first so the newest is last.
// Clicking a note selects its passage; a note whose passage was edited away says "Passage gone".
import type { NoteView, Range } from '../../core';

/** A long quote is cut for the list; the margin is for finding the place, and clicking the note shows all of it. */
const QUOTE_CHARS = 240;

function clip(s: string): string {
  const chars = Array.from(s);
  return chars.length <= QUOTE_CHARS ? s : `${chars.slice(0, QUOTE_CHARS).join('')}…`;
}

export function NotesMargin({ notes, onSelectRange }: { notes: NoteView[]; onSelectRange(r: Range | null): void }) {
  // Oldest first; notes made in the same instant keep the order they came in.
  const ordered = notes
    .map((note, i) => ({ note, i }))
    .sort((a, b) => (a.note.createdAt < b.note.createdAt ? -1 : a.note.createdAt > b.note.createdAt ? 1 : a.i - b.i))
    .map(x => x.note);

  return (
    <section className="notes-margin" aria-label="Notes">
      <h3>Notes</h3>
      {ordered.length === 0 ? (
        <p className="placeholder">No notes yet. Select text in the editor to add one.</p>
      ) : (
        <ol>
          {ordered.map(n => {
            const range = n.range;
            return (
              // The whole card is clickable for a pointer; the button inside is the way in for a keyboard, and its click reaches the card.
              <li key={n.id} className={range ? 'note' : 'note gone'} onClick={range ? () => onSelectRange(range) : undefined}>
                <p className="note-head"><strong>{n.author}</strong></p>
                <p className="note-body" dir="auto">{n.body}</p>
                <blockquote dir="auto">{clip(n.anchor.quote)}</blockquote>
                {range ? (
                  <button type="button" className="note-show" aria-label={`Show the passage for the note by ${n.author} in the text`}>Show in text</button>
                ) : (
                  <p className="note-gone">Passage gone</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
