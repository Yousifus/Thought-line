// The right column: the Logic and Thought tabs. Passes the view, note counts and the editor's current text through to the panes.
import { useState } from 'react';
import type { PieceView, Range } from '../../core';
import { LogicPane } from './LogicPane';
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
      {tab === 'logic' ? <LogicPane view={view} noteCounts={noteCounts} editorText={editorText} onReveal={onReveal} /> : <ThoughtPane view={view} />}
    </section>
  );
}
