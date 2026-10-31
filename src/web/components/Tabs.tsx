// The right column: the Logic and Thought tabs, and under them the notes margin. Passes the view, note counts and the editor's current text through to the panes.
import { useState } from 'react';
import type { PieceView, Range } from '../../core';
import { STALE_NOTE } from '../editorSelection';
import { useReveal } from '../useReveal';
import { LogicPane } from './LogicPane';
import { NotesMargin } from './NotesMargin';
import { ThoughtPane } from './ThoughtPane';

type Tab = 'logic' | 'thought';

export function Tabs({ view, noteCounts, editorText, onReveal }: {
  view: PieceView | null;
  noteCounts?: Record<string, number>;
  editorText?: string;
  onReveal?: (range: Range) => void;
}) {
  const [tab, setTab] = useState<Tab>('logic');
  return (
    <section className="maps" aria-label="Maps">
      <div className="tabs" role="tablist">
        {(['logic', 'thought'] as const).map(t => (
          <button key={t} type="button" role="tab" className={tab === t ? 'tab on' : 'tab'} aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'logic' ? 'Logic' : 'Thought'}
          </button>
        ))}
      </div>
      {tab === 'logic'
        ? <LogicPane view={view} noteCounts={noteCounts} editorText={editorText} onReveal={onReveal} />
        : <ThoughtPane view={view} editorText={editorText} onReveal={onReveal} />}
      {view ? <Notes view={view} editorText={editorText} onReveal={onReveal} /> : null}
    </section>
  );
}

/** The margin for the shown piece. Note ranges are measured against the version's text (or the piece's own text before any analysis). */
function Notes({ view, editorText, onReveal }: { view: PieceView; editorText?: string; onReveal?: (range: Range) => void }) {
  const base = view.version?.text ?? view.piece.text;
  const { select, stale } = useReveal(base, editorText ?? base, onReveal, view.version?.id ?? view.piece.id);
  return (
    <>
      <NotesMargin notes={view.notes} onSelectRange={select} />
      {stale ? <p className="stale-note" role="status">{STALE_NOTE}</p> : null}
    </>
  );
}
