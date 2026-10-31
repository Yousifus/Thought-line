// The Logic tab's pane. Placeholder until Task 11 draws the claim map here; it already receives the current PieceView.
import type { PieceView } from '../../core';

export function LogicPane({ view }: { view: PieceView | null }) {
  const analysis = view?.version?.analysis;
  return (
    <div className="pane" role="tabpanel" aria-label="Logic">
      <p className="placeholder">
        {analysis
          ? `The logic map will appear here. ${analysis.stations.length} claims found.`
          : view
            ? 'Not analysed yet. Use Save and analyse.'
            : 'Choose or create a piece.'}
      </p>
    </div>
  );
}
