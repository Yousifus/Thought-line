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
  /** `importedHash` is for the importer: it is written into the piece's import source together with the new text. */
  updateText(pieceId: string, text: string, opts?: { importedHash?: string }): Promise<Piece>;
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

/** One spelling of a line end. A textarea reports offsets as if every line ended in a single LF, so notes and highlights only line up with text stored that way. */
const lf = (text: string) => text.replace(/\r\n?/g, '\n');

export function createService(deps: ServiceDeps): Service {
  const { store, providers, maxChars, queue } = deps;

  /**
   * One chain per piece: every read-modify-write of a piece's record runs after the previous one has finished, so
   * each sees the latest state and changes only its own field. Without it, a privacy toggle and an autosave
   * landing together could write each other's stale copy back (and turn a private piece public again).
   */
  const chains = new Map<string, Promise<unknown>>();
  function withPiece<T>(pieceId: string, job: () => Promise<T>): Promise<T> {
    const prev = chains.get(pieceId) ?? Promise.resolve();
    const run = prev.then(job, job);
    const tail = run.then(() => {}, () => {});
    chains.set(pieceId, tail);
    // Forget a finished chain so the map does not grow with every piece ever edited.
    void tail.then(() => { if (chains.get(pieceId) === tail) chains.delete(pieceId); });
    return run;
  }

  async function requirePiece(pieceId: string): Promise<Piece> {
    const piece = await store.getPiece(pieceId);
    if (!piece) throw new NotFoundError('Piece not found');
    return piece;
  }

  return {
    listPieces: () => store.listPieces(),

    async createPiece({ title, text, privacy = 'private', source }) {
      const now = new Date().toISOString();
      const piece: Piece = { id: randomUUID(), title, privacy, text: lf(text), createdAt: now, updatedAt: now };
      if (source) piece.source = source;
      await store.putPiece(piece);
      return piece;
    },

    updateText: (pieceId, text, opts) => withPiece(pieceId, async () => {
      const current = await requirePiece(pieceId);
      const piece: Piece = { ...current, text: lf(text), updatedAt: new Date().toISOString() };
      if (opts?.importedHash !== undefined && current.source) piece.source = { ...current.source, importedHash: opts.importedHash };
      await store.putPiece(piece);
      return piece;
    }),

    setPrivacy: (pieceId, privacy) => withPiece(pieceId, async () => {
      const piece: Piece = { ...(await requirePiece(pieceId)), privacy, updatedAt: new Date().toISOString() };
      await store.putPiece(piece);
      return piece;
    }),

    // Takes its place in the queue synchronously, so analyses run in the order they were requested. Checking that
    // the piece exists first (an async disk read of uneven length) would let a later call overtake an earlier one.
    analyze(pieceId) {
      return queue(async () => {
        // Read inside the job, after any edit already in flight: a queued analysis covers the text and privacy
        // as they are when it actually runs, and the provider is chosen from that same read. An unknown piece is
        // refused here, before any provider is called.
        const piece = await withPiece(pieceId, () => requirePiece(pieceId));
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
