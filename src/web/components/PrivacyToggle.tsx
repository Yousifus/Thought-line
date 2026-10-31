// A two-button toggle that shows whether a piece is Private (local model only) or Public. Going public asks first: it is the privacy boundary.
import type { Privacy } from '../../core';

export const CONFIRM_PUBLIC = 'Make this piece public? It may then be sent to a cloud model if one is configured.';

export function PrivacyToggle({ value, onChange, disabled }: { value: Privacy; onChange: (p: Privacy) => void; disabled?: boolean }) {
  const choose = (p: Privacy) => {
    if (p === value) return;
    if (p === 'public' && !window.confirm(CONFIRM_PUBLIC)) return;
    onChange(p);
  };

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
            onClick={() => choose(p)}
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
