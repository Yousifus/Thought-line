// Decides whether a passage of the analysed text may be selected in the editor, and does the selecting.
// Ranges are measured against the analysed text, so they mean something in the editor only while it shows exactly that text.
import type { Range } from '../core';

export const STALE_NOTE = 'The text changed since this map was made. Save and analyse to update it.';

export type SelectionPlan =
  | { kind: 'select'; range: Range }
  | { kind: 'stale' }
  | { kind: 'none' };

export function planSelection(versionText: string, editorText: string, range: Range | null): SelectionPlan {
  if (!range) return { kind: 'none' };
  if (editorText !== versionText) return { kind: 'stale' };
  return { kind: 'select', range };
}

/** Selects the range, focuses the textarea and scrolls the passage into view, a third of the way down. */
export function revealRange(textarea: HTMLTextAreaElement, range: Range): void {
  textarea.focus({ preventScroll: true });
  // A textarea has no scroll-to-selection. Measure the height of the text before the passage by briefly
  // holding only that text, then put the full text back; no input event fires, so React sees no change.
  const full = textarea.value;
  let top = 0;
  if (textarea.scrollHeight > textarea.clientHeight) {
    textarea.value = full.slice(0, range.start);
    const before = textarea.scrollHeight;
    // Text that ends within the first screenful is already in view.
    if (before > textarea.clientHeight) top = before - textarea.clientHeight / 3;
    textarea.value = full;
  }
  textarea.setSelectionRange(range.start, range.end);
  textarea.scrollTop = top;
}
