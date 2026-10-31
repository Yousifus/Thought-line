// The application service: pieces, queued analysis, privacy routing, versions and notes that follow their passage.
import { randomUUID } from 'node:crypto';
import {
  analyzePiece, deriveStructure, findJumps, makeAnchor, providerFor, resolveAnchor,
} from '../core';
import type {
  ModelProvider, Note, NoteView, Piece, PieceSummary, PieceView, Privacy, Store, Version,
} from '../core';
import type { SerialQueue } from './queue';

export type { NoteView, PieceView } from '../core';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface Service {
  listPieces(): Promise<PieceSummary[]>;
  createPiece(input: { title: string; text: string; privacy?: Privacy; source?: Piece['source'] }): Promise<Piece>;
  updateText(pieceId: string, text: string): Promise<Piece>;
  setPrivacy(pieceId: string, privacy: Privacy): Promise<Piece>;
  /** Analyses the piece's text as it is when the job runs, saves a version. One analysis at a time. */
  analyze(pieceId: string): Promise<Version>;
  /** Latest version when `versionId` is omitted. Null when the piece (or the asked-for version) is unknown. */
  readPiece(pieceId: string, versionId?: string): Promise<PieceView | null>;
  /** Newest first. Throws NotFoundError for an unknown piece. */
  listVersions(pieceId: string): Promise<Array<Pick<Version, 'id' | 'savedAt'>>>;
  addNote(input: { pieceId: string; author: string; body: string; quote: string; prefix?: string; suffix?: string }): Promise<Note>;
}

export interface ServiceDeps {
  store: Store;
  providers: { local: ModelProvider; cloud?: ModelProvider };
  maxChars: number;
  queue: SerialQueue;
}

export function createService(deps: ServiceDeps): Service {
  const { store, providers, maxChars, queue } = deps;

  async function requirePiece(pieceId: string): Promise<Piece> {
    const piece = await store.getPiece(pieceId);
    if (!piece) throw new NotFoundError('Piece not found');
    return piece;
  }

  return {
    listPieces: () => store.listPieces(),

    async createPiece({ title, text, privacy = 'private', source }) {
      const now = new Date().toISOString();
      const piece: Piece = { id: randomUUID(), title, privacy, text, createdAt: now, updatedAt: now };
      if (source) piece.source = source;
      await store.putPiece(piece);
      return piece;
    },

    async updateText(pieceId, text) {
      const piece = { ...(await requirePiece(pieceId)), text, updatedAt: new Date().toISOString() };
      await store.putPiece(piece);
      return piece;
    },

    async setPrivacy(pieceId, privacy) {
      const piece = { ...(await requirePiece(pieceId)), privacy, updatedAt: new Date().toISOString() };
      await store.putPiece(piece);
      return piece;
    },

    async analyze(pieceId) {
      await requirePiece(pieceId);
      return queue(async () => {
        // Read inside the job: a queued analysis covers the text and privacy as they are when it actually runs.
        const piece = await requirePiece(pieceId);
        const analysis = await analyzePiece(providerFor(piece.privacy, providers), piece.text, { maxChars });
        return store.addVersion(pieceId, piece.text, analysis);
      });
    },

    async readPiece(pieceId, versionId) {
      const piece = await store.getPiece(pieceId);
      if (!piece) return null;
      const version = versionId === undefined ? await store.latestVersion(pieceId) : await store.getVersion(pieceId, versionId);
      if (versionId !== undefined && !version) return null;
      const text = version ? version.text : piece.text;
      const notes: NoteView[] = (await store.listNotes(pieceId)).map(n => ({ ...n, range: resolveAnchor(text, n.anchor) }));
      return {
        piece,
        version,
        structure: version ? deriveStructure(version.analysis) : null,
        jumps: version ? findJumps(version.analysis) : [],
        notes,
      };
    },

    async listVersions(pieceId) {
      await requirePiece(pieceId);
      return store.listVersions(pieceId);
    },

    async addNote({ pieceId, author, body, quote, prefix, suffix }) {
      const piece = await requirePiece(pieceId);
      const text = (await store.latestVersion(pieceId))?.text ?? piece.text;
      // With no context this is the first match; with a prefix or suffix, the match that agrees with it best.
      const range = resolveAnchor(text, { quote, prefix: prefix ?? '', suffix: suffix ?? '', start: 0 });
      if (!range) throw new NotFoundError('That quote is not in the piece');
      return store.addNote({ pieceId, author, body, anchor: makeAnchor(text, range) });
    },
  };
}
