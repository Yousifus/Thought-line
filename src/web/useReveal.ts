// The rule for selecting a passage in the editor, shared by the Logic map, the Thought path and the notes margin.
// A passage is selected only while the editor shows exactly the text its range was measured against; otherwise `stale` explains why not.
import { useState } from 'react';
import type { Range } from '../core';
import { planSelection } from './editorSelection';

/**
 * `baseText` is the text ranges refer to, `shown` is what the editor shows now, and `key` names the thing the refusal belongs to
 * (a version id), so the note goes away with it.
 */
export function useReveal(baseText: string, shown: string, onReveal: ((range: Range) => void) | undefined, key: string) {
  const [refusedFor, setRefusedFor] = useState<string | null>(null);
  const select = (range: Range | null) => {
    const plan = planSelection(baseText, shown, range);
    setRefusedFor(plan.kind === 'stale' ? key : null);
    if (plan.kind === 'select') onReveal?.(plan.range);
  };
  // Derived, so the note disappears by itself once the editor shows the analysed text again.
  return { select, stale: refusedFor === key && shown !== baseText };
}
