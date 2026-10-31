// The Thought tab's pane. Placeholder until Task 12 draws the path through images here; it already receives the current PieceView.
import type { PieceView } from '../../core';

export function ThoughtPane({ view }: { view: PieceView | null }) {
  const analysis = view?.version?.analysis;
  return (
    <div className="pane" role="tabpanel" aria-label="Thought">
      <p className="placeholder">
        {analysis
          ? `The thought map will appear here. ${analysis.motifs.length} images found.`
          : view
            ? 'Not analysed yet. Use Save and analyse.'
            : 'Choose or create a piece.'}
      </p>
    </div>
  );
}
