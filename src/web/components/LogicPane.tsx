// The Logic tab's pane: the claim map for the current version, plus the rule for selecting a passage in the editor.
// A passage is selected only while the editor shows exactly the analysed text; otherwise a short note says why not.
import type { PieceView, Range } from '../../core';
import { STALE_NOTE } from '../editorSelection';
import { NO_NOTES } from '../layout/notes';
import { useReveal } from '../useReveal';
import { LogicMap } from './LogicMap';

export function LogicPane({ view, noteCounts = NO_NOTES, editorText, onReveal }: {
  view: PieceView | null;
  /** Notes per station id. */
  noteCounts?: Record<string, number>;
  /** What the editor shows right now (draft or saved text). Defaults to the analysed text, so nothing is stale. */
  editorText?: string;
  /** Asked to select this range (in the analysed text) in the editor. Only called when the editor shows that text. */
  onReveal?: (range: Range) => void;
}) {
  const version = view?.version ?? null;
  const shown = editorText ?? version?.text ?? '';
  const { select, stale } = useReveal(version?.text ?? '', shown, onReveal, version?.id ?? '');

  if (!view || !version) {
    return (
      <div className="pane" role="tabpanel" aria-label="Logic">
        <p className="placeholder">{view ? 'Not analysed yet. Use Save and analyse.' : 'Choose or create a piece.'}</p>
      </div>
    );
  }

  return (
    <div className="pane" role="tabpanel" aria-label="Logic">
      <LogicMap view={view} noteCounts={noteCounts} onSelectRange={select} />
      {stale ? <p className="stale-note" role="status">{STALE_NOTE}</p> : null}
    </div>
  );
}
