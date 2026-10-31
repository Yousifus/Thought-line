// The Thought tab's pane: the path through the piece's images for the current version, plus the rule for selecting a passage in the editor.
// A passage is selected only while the editor shows exactly the analysed text; otherwise a short note says why not.
import type { PieceView, Range } from '../../core';
import { STALE_NOTE } from '../editorSelection';
import { useReveal } from '../useReveal';
import { ThoughtPath } from './ThoughtPath';

export function ThoughtPane({ view, editorText, onReveal }: {
  view: PieceView | null;
  /** What the editor shows right now (draft or saved text). Defaults to the analysed text, so nothing is stale. */
  editorText?: string;
  /** Asked to select this range (in the analysed text) in the editor. Only called when the editor shows that text. */
  onReveal?: (range: Range) => void;
}) {
  const version = view?.version ?? null;
  const { select, stale } = useReveal(version?.text ?? '', editorText ?? version?.text ?? '', onReveal, version?.id ?? '');

  return (
    <div className="pane" role="tabpanel" aria-label="Thought">
      {view && version ? (
        <>
          <ThoughtPath view={view} onSelectRange={select} />
          {stale ? <p className="stale-note" role="status">{STALE_NOTE}</p> : null}
        </>
      ) : (
        <p className="placeholder">{view ? 'Not analysed yet. Use Save and analyse.' : 'Choose or create a piece.'}</p>
      )}
    </div>
  );
}
