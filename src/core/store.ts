// Storage contract for pieces, saved analysis versions and margin notes. Types only, plus the one identity helper the
// reader needs to tell one reading from the next: implementations live in src/server.
import type { Analysis, Privacy } from './analysis';
import type { Anchor } from './anchors';

/**
 * What a selection is tied to. A version id is no longer unique to one reading: re-reading unchanged text replaces
 * the map under the same id, so ids like `s1` can point at a different claim afterwards. The moment of the reading
 * changes whenever the map does, so it is what a highlight or a quote must be keyed on.
 */
export const readingKey = (version: Pick<Version, 'id' | 'savedAt'>): string => `${version.id}@${version.savedAt}`;

export interface Piece {
  id: string;
  title: string;
  privacy: Privacy;
  text: string;
  /** For an import, `importedHash` is the sha256 of the normalized text as last imported, so a re-import can tell whether the app has edited it since. */
  source?: { kind: 'paste' | 'import' | 'agent'; path?: string; importedHash?: string };
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  id: string;
  pieceId: string;
  savedAt: string;
  text: string;
  analysis: Analysis;
  /**
   * sha256 of `text`, the version's identity. Two readings of the same text share it, which is how a re-analysis
   * replaces its map in place instead of minting a second version. Missing on versions saved before it existed.
   */
  textSha256?: string;
}

export interface Note {
  id: string;
  pieceId: string;
  author: string;
  body: string;
  anchor: Anchor;
  createdAt: string;
}

export interface PieceSummary {
  id: string;
  title: string;
  privacy: Privacy;
  updatedAt: string;
  versionCount: number;
}

export interface Store {
  /** Newest updatedAt first. */
  listPieces(): Promise<PieceSummary[]>;
  getPiece(id: string): Promise<Piece | null>;
  findPieceBySourcePath(path: string): Promise<Piece | null>;
  putPiece(piece: Piece): Promise<void>;
  /** Throws if the piece is unknown. Concurrent saves each get their own version. */
  addVersion(pieceId: string, text: string, analysis: Analysis): Promise<Version>;
  /**
   * Re-read an existing version, keeping its id and its text. Used when the piece's current text already has a
   * version: one text has one map, so a new reading replaces the old one rather than minting a second version of the
   * same words. The version becomes the newest one, so the reading of the text on screen is the one that opens.
   */
  replaceVersion(pieceId: string, versionId: string, analysis: Analysis): Promise<Version>;
  /** Newest first. */
  listVersions(pieceId: string): Promise<Array<Pick<Version, 'id' | 'savedAt'>>>;
  getVersion(pieceId: string, versionId: string): Promise<Version | null>;
  /** Always the head of listVersions. */
  latestVersion(pieceId: string): Promise<Version | null>;
  addNote(input: Omit<Note, 'id' | 'createdAt'>): Promise<Note>;
  /** Oldest first. */
  listNotes(pieceId: string): Promise<Note[]>;
}
