// The right column: the Logic and Thought tabs. Tasks 11 and 12 swap the pane components; nothing here needs to change.
import { useState } from 'react';
import type { PieceView } from '../../core';
import { LogicPane } from './LogicPane';
import { ThoughtPane } from './ThoughtPane';

type Tab = 'logic' | 'thought';

export function Tabs({ view }: { view: PieceView | null }) {
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
      {tab === 'logic' ? <LogicPane view={view} /> : <ThoughtPane view={view} />}
    </section>
  );
}
