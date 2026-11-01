// File-backed Store: one JSON file per piece, version and note list, written atomically and serialized per file.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Analysis } from '../core/analysis';
import type { Note, Piece, PieceSummary, Store, Version } from '../core/store';

/** A version as stored on disk: `seq` is a per-piece counter that breaks ties between equal `savedAt` values. */
type StoredVersion = Version & { seq: number };

/** Lowercase only: Windows (and macOS) folders are case-insensitive, so `ABC` and `abc` would be one file. */
const SAFE_ID = /^[a-z0-9_-]{1,128}$/;
const RENAME_ATTEMPTS = 6;
const RENAME_DELAY_MS = 25;
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);

type Rename = (from: string, to: string) => Promise<void>;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const errCode = (e: unknown) => (e as NodeJS.ErrnoException | undefined)?.code;

/**
 * Write to a temp file in the same folder, flush it, then rename over the target. On Windows the rename can fail
 * briefly (antivirus, indexer), so transient errors are retried. The temp file never outlives a failed write.
 */
export async function writeFileAtomic(file: string, content: string, rename: Rename = fs.rename): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(tmp, 'wx');
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    for (let attempt = 1; ; attempt++) {
      try {
        await rename(tmp, file);
        return;
      } catch (e) {
        if (!TRANSIENT.has(errCode(e) ?? '') || attempt >= RENAME_ATTEMPTS) throw e;
        await sleep(RENAME_DELAY_MS * attempt);
      }
    }
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

/** Per-key promise chains, shared by every store in this process so two stores over one folder cannot interleave. */
const chains = new Map<string, Promise<void>>();

/** One file, one key: resolved and lowercased, because the same file can be spelled with different case on Windows. */
const lockKey = (p: string) => path.resolve(p).toLowerCase();

function serialize<T>(target: string, job: () => Promise<T>): Promise<T> {
  const key = lockKey(target);
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.then(job);
  const tail = run.then(() => {}, () => {});
  chains.set(key, tail);
  void tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
  return run;
}

function checkId(id: string): void {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid id: ${JSON.stringify(id)}`);
}

/** The file exists but its content is unusable. Distinct from I/O errors (EBUSY, EPERM, ...), which are never swallowed. */
class CorruptFileError extends Error {
  constructor(file: string, why: string) {
    super(`Could not use ${file}: ${why}. The file was left untouched.`);
    this.name = 'CorruptFileError';
  }
}

async function readJson<T>(file: string, valid: (v: unknown) => boolean = () => true): Promise<T | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (e) {
    if (errCode(e) === 'ENOENT') return null;
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    throw new CorruptFileError(file, 'the file is not valid JSON');
  }
  if (!valid(parsed)) throw new CorruptFileError(file, 'the JSON has an unexpected shape');
  return parsed as T;
}

const isObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** In list views a corrupt file is skipped (and named in a warning); any other error is rethrown. */
async function readOrSkip<T>(file: string): Promise<T | null> {
  try {
    return await readJson<T>(file, isObject);
  } catch (e) {
    if (!(e instanceof CorruptFileError)) throw e;
    console.warn(`[fileStore] skipped ${file}: ${e.message}`);
    return null;
  }
}

async function jsonNames(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter(n => n.endsWith('.json'));
  } catch (e) {
    if (errCode(e) === 'ENOENT') return [];
    throw e;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeFileAtomic(file, JSON.stringify(value, null, 2));
}

/** A version's identity is the text it read, not when it was read. */
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const stripSeq = ({ seq: _seq, ...version }: StoredVersion): Version => version;

/** Newest first: higher seq wins; savedAt then id only matter for files written before `seq` existed. */
function newestFirst(a: StoredVersion, b: StoredVersion): number {
  return (b.seq ?? 0) - (a.seq ?? 0)
    || (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0)
    || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

export function fileStore(dataDir: string): Store {
  const root = path.resolve(dataDir);
  const pieceFile = (id: string) => path.join(root, 'pieces', `${id}.json`);
  const versionsDir = (pieceId: string) => path.join(root, 'versions', pieceId);
  const notesFile = (pieceId: string) => path.join(root, 'notes', `${pieceId}.json`);

  /** Every usable version of a piece. A corrupt file is skipped with a warning so it cannot hide the rest; other errors throw. */
  async function readVersions(pieceId: string): Promise<StoredVersion[]> {
    const dir = versionsDir(pieceId);
    const found: StoredVersion[] = [];
    for (const name of await jsonNames(dir)) {
      const v = await readOrSkip<StoredVersion>(path.join(dir, name));
      if (v) found.push(v);
    }
    return found.sort(newestFirst);
  }

  async function getPiece(id: string): Promise<Piece | null> {
    if (!SAFE_ID.test(id)) return null;
    return readJson<Piece>(pieceFile(id), isObject);
  }

  async function readPieces(): Promise<Piece[]> {
    const pieces: Piece[] = [];
    for (const name of await jsonNames(path.join(root, 'pieces'))) {
      const p = await readOrSkip<Piece>(path.join(root, 'pieces', name));
      if (p) pieces.push(p);
    }
    return pieces;
  }

  return {
    async listPieces(): Promise<PieceSummary[]> {
      const pieces = await readPieces();
      const summaries = await Promise.all(pieces.map(async p => ({
        id: p.id,
        title: p.title,
        privacy: p.privacy,
        updatedAt: p.updatedAt,
        versionCount: (await readVersions(p.id)).length,
      })));
      return summaries.sort((a, b) =>
        (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0) || (a.id < b.id ? -1 : 1));
    },

    getPiece,

    async findPieceBySourcePath(sourcePath: string): Promise<Piece | null> {
      const hit = (await readPieces()).find(p => p.source?.path === sourcePath);
      return hit ?? null;
    },

    async putPiece(piece: Piece): Promise<void> {
      checkId(piece.id);
      const file = pieceFile(piece.id);
      await serialize(file, () => writeJson(file, piece));
    },

    async addVersion(pieceId: string, text: string, analysis: Analysis): Promise<Version> {
      checkId(pieceId);
      // The lock is taken before anything else so concurrent callers are numbered in call order.
      return serialize(versionsDir(pieceId), async () => {
        if (!(await getPiece(pieceId))) throw new Error(`Unknown piece: ${pieceId}`);
        const existing = await readVersions(pieceId);
        // Never below the number of version files on disk, so a corrupt (unreadable) file's seq is not reused.
        const onDisk = (await jsonNames(versionsDir(pieceId))).length;
        const seq = Math.max(existing.reduce((m, v) => Math.max(m, v.seq ?? 0), 0), onDisk) + 1;
        const stored: StoredVersion = {
          id: randomUUID(), pieceId, savedAt: new Date().toISOString(), text, analysis, seq,
          textSha256: sha256(text),
        };
        await writeJson(path.join(versionsDir(pieceId), `${stored.id}.json`), stored);
        return stripSeq(stored);
      });
    },

    async replaceVersion(pieceId: string, versionId: string, analysis: Analysis): Promise<Version> {
      checkId(pieceId);
      if (!SAFE_ID.test(versionId)) throw new Error(`Unknown version: ${versionId}`);
      return serialize(versionsDir(pieceId), async () => {
        const file = path.join(versionsDir(pieceId), `${versionId}.json`);
        const current = await readJson<StoredVersion>(file, isObject);
        if (!current) throw new Error(`Unknown version: ${versionId}`);
        // Same id and same text: only the reading and the moment it was drawn change. The version moves to the top if
        // it was not already there, because this piece's current text is what the reader opens on, whatever the edit
        // history did in between (an edit and a revert must not leave a stale map in front of a fresh one).
        const versions = await readVersions(pieceId);
        const newestSeq = versions.reduce((m, v) => Math.max(m, v.seq ?? 0), 0);
        const seq = current.seq >= newestSeq ? current.seq : newestSeq + 1;
        const stored: StoredVersion = {
          ...current, analysis, savedAt: new Date().toISOString(), textSha256: sha256(current.text), seq,
        };
        await writeJson(file, stored);
        return stripSeq(stored);
      });
    },

    async listVersions(pieceId: string): Promise<Array<Pick<Version, 'id' | 'savedAt'>>> {
      if (!SAFE_ID.test(pieceId)) return [];
      return (await readVersions(pieceId)).map(v => ({ id: v.id, savedAt: v.savedAt }));
    },

    async getVersion(pieceId: string, versionId: string): Promise<Version | null> {
      if (!SAFE_ID.test(pieceId) || !SAFE_ID.test(versionId)) return null;
      const v = await readJson<StoredVersion>(path.join(versionsDir(pieceId), `${versionId}.json`), isObject);
      return v ? stripSeq(v) : null;
    },

    async latestVersion(pieceId: string): Promise<Version | null> {
      if (!SAFE_ID.test(pieceId)) return null;
      const [head] = await readVersions(pieceId);
      return head ? stripSeq(head) : null;
    },

    async addNote(input: Omit<Note, 'id' | 'createdAt'>): Promise<Note> {
      checkId(input.pieceId);
      const file = notesFile(input.pieceId);
      return serialize(file, async () => {
        const notes = (await readJson<Note[]>(file, Array.isArray)) ?? [];
        const note: Note = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
        await writeJson(file, [...notes, note]);
        return note;
      });
    },

    async listNotes(pieceId: string): Promise<Note[]> {
      if (!SAFE_ID.test(pieceId)) return [];
      return (await readJson<Note[]>(notesFile(pieceId), Array.isArray)) ?? [];
    },
  };
}
