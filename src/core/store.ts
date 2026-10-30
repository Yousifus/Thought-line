// Storage contract for pieces, saved analysis versions and margin notes. Types only: implementations live in src/server.
import type { Analysis, Privacy } from './analysis';
import type { Anchor } from './anchors';

export interface Piece {
  id: string;
  title: string;
  privacy: Privacy;
  text: string;
  source?: { kind: 'paste' | 'import' | 'agent'; path?: string };
  createdAt: string;
  updatedAt: string;
}

export interface Version {
  id: string;
  pieceId: string;
  savedAt: string;
  text: string;
  analysis: Analysis;
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
  /** Newest first. */
  listVersions(pieceId: string): Promise<Array<Pick<Version, 'id' | 'savedAt'>>>;
  getVersion(pieceId: string, versionId: string): Promise<Version | null>;
  /** Always the head of listVersions. */
  latestVersion(pieceId: string): Promise<Version | null>;
  addNote(input: Omit<Note, 'id' | 'createdAt'>): Promise<Note>;
  /** Oldest first. */
  listNotes(pieceId: string): Promise<Note[]>;
}
