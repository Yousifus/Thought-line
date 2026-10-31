// MCP server (Streamable HTTP, stateless) so AI readers can list, read, analyse and leave margin notes on pieces.
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AnalysisError, ProviderError } from '../core';
import type { Link, MotifMention, PieceView, Privacy, Role, Grounding } from '../core';
import { redact } from './api';
import { NotFoundError } from './service';
import type { Service } from './service';

export interface ReadingStation {
  id: string;
  claim: string;
  passage: string;
  role: Role;
  expressed: number;
  grounding: Grounding;
  /** How far the claim is stated above what supports it, or null when it is not a jump. */
  jump: number | null;
  flags: { interchange: boolean; deadEnd: boolean; inLoop: boolean; unanchored: boolean };
}

export interface ReadingNote { id: string; author: string; body: string; quote: string; createdAt: string; gone: boolean }

/** A piece flattened for an agent to read: one object, no cross-references to look up. */
export interface Reading {
  pieceId: string;
  title: string;
  privacy: Privacy;
  /** Null until the piece has been analysed. */
  versionId: string | null;
  /** The text the stations and notes refer to: the shown version's text, or the piece's own text before any analysis. */
  text: string;
  /** True when the piece has been edited since this version was analysed. */
  stale: boolean;
  language: 'ar' | 'en' | 'mixed' | null;
  stations: ReadingStation[];
  links: Link[];
  motifs: MotifMention[];
  notes: ReadingNote[];
}

/** The one place a PieceView becomes the shape agents read; read_piece, analyze_piece and analyze_text all use it. */
export function toReading(view: PieceView): Reading {
  const { piece, version, structure, jumps, notes } = view;
  const interchanges = new Set(structure?.interchanges ?? []);
  const deadEnds = new Set(structure?.deadEnds ?? []);
  const inLoop = new Set((structure?.loops ?? []).flat());
  const excess = new Map(jumps.map(j => [j.stationId, j.excess]));
  const analysis = version?.analysis;
  return {
    pieceId: piece.id,
    title: piece.title,
    privacy: piece.privacy,
    versionId: version?.id ?? null,
    text: version ? version.text : piece.text,
    stale: version ? version.text !== piece.text : false,
    language: analysis?.language ?? null,
    stations: (analysis?.stations ?? []).map(s => ({
      id: s.id,
      claim: s.claim,
      passage: s.passage,
      role: s.role,
      expressed: s.expressed,
      grounding: s.grounding,
      jump: excess.get(s.id) ?? null,
      flags: { interchange: interchanges.has(s.id), deadEnd: deadEnds.has(s.id), inLoop: inLoop.has(s.id), unanchored: s.unanchored === true },
    })),
    links: analysis?.links ?? [],
    motifs: [...(analysis?.motifs ?? [])].sort((a, b) => a.order - b.order),
    notes: notes.map(n => ({ id: n.id, author: n.author, body: n.body, quote: n.anchor.quote, createdAt: n.createdAt, gone: n.range === null })),
  };
}

const nonBlank = (s: string) => s.trim() !== '';
const id = z.string().min(1).max(128);

const QUOTE_ADVICE = 'Copy the quote exactly as it appears in the piece text, in its own language and spelling; never translate or paraphrase it.';

const tools = {
  list_pieces: {
    description: 'List every piece in the library, newest first: id, title, privacy, last update and how many analysed versions it has. Start here to find a piece id.',
    inputSchema: {},
    readOnly: true,
  },
  read_piece: {
    description: 'Read one piece: its text, its stations (claims, each with the passage it rests on, how sure it sounds, how well it is grounded, a jump value when it sounds surer than its support allows, and flags for interchange, deadEnd, inLoop and unanchored), the links between them, the motifs in order, and the margin notes left so far (notes are marked gone when their passage has since been edited away). Reads the latest analysed version unless versionId is given.',
    inputSchema: { pieceId: id, versionId: id.optional() },
    readOnly: true,
  },
  analyze_piece: {
    description: 'Analyse the current text of an existing piece with the configured model and save the result as a new version. This can take a while, and one analysis runs at a time. Returns the same shape as read_piece, for the new version. A private piece is only ever analysed by the local model.',
    inputSchema: { pieceId: id },
    readOnly: false,
    openWorld: true,
  },
  analyze_text: {
    description: 'Analyse a draft of your own: files it as a new piece from an agent (privacy defaults to private, which keeps it on the local model), analyses it, and returns the same shape as read_piece. Use it for your own drafts; to read what Yousef wrote, use list_pieces and read_piece.',
    inputSchema: {
      title: z.string().refine(nonBlank, 'must not be empty').max(200),
      text: z.string().refine(nonBlank, 'must not be empty'),
      privacy: z.enum(['private', 'public']).optional(),
    },
    readOnly: false,
    openWorld: true,
  },
  add_note: {
    description: `Leave a margin note on a passage of a piece. ${QUOTE_ADVICE} If the quote is not in the piece you get an error, so quote a shorter stretch. Add prefix or suffix (the words just before or after) only when the quote appears more than once. author is your own name, for example claude-qalam or claude-echo. Notes are read by Yousef, so write the body for him: say what you noticed and why, plainly.`,
    inputSchema: {
      pieceId: id,
      author: z.string().trim().min(1).max(64),
      body: z.string().min(1).max(4000).refine(nonBlank, 'must not be empty'),
      quote: z.string().min(1).max(2000),
      prefix: z.string().max(2000).optional(),
      suffix: z.string().max(2000).optional(),
    },
    readOnly: false,
  },
} as const;

/** Carries an already-described message through run(), which would otherwise hide it as an internal error. */
class SavedPieceError extends Error {}

type ToolResult = { content: [{ type: 'text'; text: string }]; isError?: true };

const ok = (value: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: 'text', text: message }], isError: true });

/** What an agent may be told about a failure: known errors say what went wrong, anything else is logged and hidden. */
function describe(err: unknown): string {
  if (err instanceof SavedPieceError || err instanceof NotFoundError) return err.message;
  if (err instanceof AnalysisError || err instanceof ProviderError) return redact(err.message);
  console.error('Unexpected error in an MCP tool:', err);
  return 'Internal error';
}

async function run(job: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await job());
  } catch (err) {
    return fail(describe(err));
  }
}

/**
 * The SDK is loaded on the first MCP request, not at startup: it is heavy, and the pages and /api do not need it.
 * One shared promise; a failed load is forgotten so the next request tries again.
 */
let sdkLoad: Promise<[typeof import('@modelcontextprotocol/sdk/server/mcp.js'), typeof import('@modelcontextprotocol/sdk/server/streamableHttp.js')]> | undefined;
function sdk() {
  sdkLoad ??= Promise.all([
    import('@modelcontextprotocol/sdk/server/mcp.js'),
    import('@modelcontextprotocol/sdk/server/streamableHttp.js'),
  ]).catch(err => { sdkLoad = undefined; throw err; });
  return sdkLoad;
}

async function buildMcpServer(service: Service, maxChars: number): Promise<McpServer> {
  const { McpServer } = (await sdk())[0];
  const server = new McpServer({ name: 'thought-line', version: '2.0.0' });
  const meta = (t: { description: string; readOnly: boolean; openWorld?: boolean }) => ({
    description: t.description,
    annotations: {
      readOnlyHint: t.readOnly,
      // Only the tools that write say so: they add notes or versions and never remove or overwrite anything.
      ...(t.readOnly ? {} : { destructiveHint: false }),
      // A public piece can be sent to a remote provider; everything else stays inside the library.
      openWorldHint: t.openWorld === true,
    },
  });

  server.registerTool('list_pieces', { ...meta(tools.list_pieces), inputSchema: tools.list_pieces.inputSchema }, () =>
    run(() => service.listPieces()));

  server.registerTool('read_piece', { ...meta(tools.read_piece), inputSchema: tools.read_piece.inputSchema }, ({ pieceId, versionId }) =>
    run(async () => {
      const view = await service.readPiece(pieceId, versionId);
      if (!view) throw new NotFoundError(versionId === undefined ? 'Piece not found' : 'Piece or version not found');
      return toReading(view);
    }));

  server.registerTool('analyze_piece', { ...meta(tools.analyze_piece), inputSchema: tools.analyze_piece.inputSchema }, ({ pieceId }) =>
    run(async () => {
      const version = await service.analyze(pieceId);
      const view = await service.readPiece(pieceId, version.id);
      if (!view) throw new NotFoundError('Piece not found');
      return toReading(view);
    }));

  server.registerTool('analyze_text', { ...meta(tools.analyze_text), inputSchema: tools.analyze_text.inputSchema }, ({ title, text, privacy }) =>
    run(async () => {
      // A text that cannot be analysed creates nothing, so retrying it adds no drafts to the library.
      if (text.length > maxChars) {
        throw new AnalysisError(`This piece is ${text.length} characters; the limit is ${maxChars}. Split it or raise TL_MAX_CHARS.`);
      }
      const piece = await service.createPiece({ title, text, privacy: privacy ?? 'private', source: { kind: 'agent' } });
      try {
        const version = await service.analyze(piece.id);
        const view = await service.readPiece(piece.id, version.id);
        if (!view) throw new NotFoundError('Piece not found');
        return toReading(view);
      } catch (err) {
        // The piece exists now; say so, or each retry would add another draft the agent cannot see.
        throw new SavedPieceError(`${describe(err)} (saved as piece ${piece.id}; retry with analyze_piece)`);
      }
    }));

  server.registerTool('add_note', { ...meta(tools.add_note), inputSchema: tools.add_note.inputSchema }, input =>
    run(() => service.addNote(input)));

  return server;
}

const rpcError = (code: number, message: string) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

const bodyErrors: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') { res.status(400).json(rpcError(-32700, 'Parse error')); return; }
  if (type === 'entity.too.large') { res.status(413).json(rpcError(-32600, 'Request body is too large')); return; }
  console.error('Unexpected error in the MCP endpoint:', err);
  res.status(500).json(rpcError(-32603, 'Internal error'));
};

/**
 * Mounts POST /mcp. Stateless: a new server and transport per request, so nothing is kept between calls and GET and
 * DELETE (which only make sense with sessions) answer 405. The caller must have put the token check on `/mcp`
 * BEFORE calling this; routes registered here run after it, so body parsing never sees an unauthenticated caller.
 */
export function mountMcp(app: express.Express, service: Service, opts: { maxChars: number }): void {
  const router = express.Router();

  router.post('/', express.json({ limit: '2mb' }), async (req, res) => {
    try {
      const server = await buildMcpServer(service, opts.maxChars);
      const { StreamableHTTPServerTransport } = (await sdk())[1];
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('Unexpected error in the MCP endpoint:', err);
      if (!res.headersSent) res.status(500).json(rpcError(-32603, 'Internal error'));
    }
  });

  router.all('/', (_req, res) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json(rpcError(-32000, 'Method not allowed'));
  });
  router.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  router.use(bodyErrors);

  app.use('/mcp', router);
}
