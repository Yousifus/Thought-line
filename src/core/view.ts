// What the server sends for one piece: the piece, the shown version, what is derived from it, and notes with live ranges. Types only.
import type { Jump } from './certainty';
import type { Note, Piece, Version } from './store';
import type { Structure } from './structure';
import type { Range } from './text';

/** `range` is null when the noted passage is no longer in the text ("passage gone"). */
export interface NoteView extends Note { range: Range | null }

export interface PieceView {
  piece: Piece;
  version: Version | null;
  structure: Structure | null;
  jumps: Jump[];
  notes: NoteView[];
}
