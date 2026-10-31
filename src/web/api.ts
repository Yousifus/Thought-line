// The browser's client for the Thought-line HTTP API: the stored token, one request function that adds it, and typed calls.
import type { Note, Piece, PieceSummary, PieceView, Privacy, Version } from '../core';

const TOKEN_KEY = 'tl.token';
/** Fired on `window` when the server rejects the token, so the app can return to the token gate. */
export const UNAUTHORIZED_EVENT = 'tl:unauthorized';

// Used when localStorage is unavailable (a private window, blocked site data): the token then lasts until the page closes.
let memoryToken: string | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(t: string): void {
  memoryToken = t;
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* keep the in-memory copy */ }
}

export function clearToken(): void {
  memoryToken = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing stored */ }
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${getToken() ?? ''}` };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('Could not reach the Thought-line server. Is it running?', 0);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === 'string' && data.error !== '') message = data.error;
    } catch { /* not JSON; keep the generic message */ }
    if (res.status === 401) {
      clearToken();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

const piecePath = (id: string) => `/pieces/${encodeURIComponent(id)}`;

export const api = {
  listPieces: () => request<PieceSummary[]>('GET', '/pieces'),
  createPiece: (b: { title: string; text: string; privacy?: Privacy }) => request<Piece>('POST', '/pieces', b),
  readPiece: (id: string, versionId?: string) =>
    request<PieceView>('GET', `${piecePath(id)}${versionId === undefined ? '' : `?version=${encodeURIComponent(versionId)}`}`),
  updateText: (id: string, text: string) => request<Piece>('PUT', `${piecePath(id)}/text`, { text }),
  setPrivacy: (id: string, privacy: Privacy) => request<Piece>('PUT', `${piecePath(id)}/privacy`, { privacy }),
  analyze: (id: string) => request<Version>('POST', `${piecePath(id)}/analyze`),
  addNote: (id: string, b: { body: string; quote: string; prefix?: string; suffix?: string }) =>
    request<Note>('POST', `${piecePath(id)}/notes`, { author: 'yousef', ...b }),
};
