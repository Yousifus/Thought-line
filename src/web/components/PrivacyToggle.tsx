// A two-button toggle that shows whether a piece is Private (local model only) or Public.
import type { Privacy } from '../../core';

export function PrivacyToggle({ value, onChange, disabled }: { value: Privacy; onChange: (p: Privacy) => void; disabled?: boolean }) {
  return (
    <div className="privacy">
      <div className="segmented" role="group" aria-label="Privacy">
        {(['private', 'public'] as const).map(p => (
          <button
            key={p}
            type="button"
            className={value === p ? `seg on ${p}` : 'seg'}
            aria-pressed={value === p}
            disabled={disabled}
            onClick={() => { if (value !== p) onChange(p); }}
          >
            {p === 'private' ? 'Private' : 'Public'}
          </button>
        ))}
      </div>
      <p className="hint">
        {value === 'private'
          ? 'Only the local model reads this piece.'
          : 'A cloud model may read this piece if one is configured.'}
      </p>
    </div>
  );
}
