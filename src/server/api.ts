// The JSON API router: validated request bodies, safe ids, and one error mapper that never leaks a stack or a key.
import express from 'express';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AnalysisError, ProviderError } from '../core';
import { NotFoundError } from './service';
import type { Service } from './service';

/** The same shape the file store accepts. Anything else cannot be a piece, version or note id. */
const SAFE_ID = /^[a-z0-9_-]{1,128}$/;

const privacy = z.enum(['private', 'public']);
const nonEmpty = z.string().refine(s => s.trim() !== '', 'must not be empty');
const bodies = {
  createPiece: z.object({ title: nonEmpty, text: nonEmpty, privacy: privacy.optional() }),
  text: z.object({ text: z.string() }),
  privacy: z.object({ privacy }),
  note: z.object({ author: nonEmpty, body: nonEmpty, quote: z.string(), prefix: z.string().optional(), suffix: z.string().optional() }),
};

class BadRequest extends Error {}

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? issue.path.map(String).join('.') : 'body';
  throw new BadRequest(`${where}: ${issue?.message ?? 'invalid'}`);
}

/** Express 4 does not catch a rejected promise, so every async handler goes through here. */
const route = (fn: (req: Request, res: Response) => Promise<void> | void): RequestHandler =>
  (req, res, next) => {
    try {
      Promise.resolve(fn(req, res)).catch(next);
    } catch (err) {
      next(err);
    }
  };

/** A bearer token must never travel out inside an upstream error message. */
const redact = (message: string) => message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) return;
  if (err instanceof BadRequest) { res.status(400).json({ error: err.message }); return; }
  if (err instanceof NotFoundError) { res.status(404).json({ error: err.message }); return; }
  if (err instanceof AnalysisError) { res.status(422).json({ error: redact(err.message) }); return; }
  if (err instanceof ProviderError) { res.status(502).json({ error: redact(err.message) }); return; }
  // Errors from the body parser carry a `type`; say what is wrong with the request and nothing more.
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') { res.status(400).json({ error: 'Request body is not valid JSON' }); return; }
  if (type === 'entity.too.large') { res.status(413).json({ error: 'Request body is too large' }); return; }
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number' && status >= 400 && status < 500 && typeof type === 'string') {
    res.status(status).json({ error: 'Bad request' });
    return;
  }
  console.error('Unexpected error in the API:', err);
  res.status(500).json({ error: 'Internal error' });
};

export function apiRouter(service: Service): express.Router {
  const router = express.Router();

  // Any :id that is not a safe id cannot name a piece, so it is a plain 404 before anything touches the disk.
  router.param('id', (_req, res, next, id: string) => {
    if (!SAFE_ID.test(id)) {
      res.status(404).json({ error: 'Piece not found' });
      return;
    }
    next();
  });

  router.get('/pieces', route(async (_req, res) => {
    res.json(await service.listPieces());
  }));

  router.post('/pieces', route(async (req, res) => {
    const { title, text, privacy } = parse(bodies.createPiece, req.body);
    res.status(201).json(await service.createPiece({ title, text, privacy }));
  }));

  router.get('/pieces/:id', route(async (req, res) => {
    const version = req.query.version;
    if (version !== undefined && typeof version !== 'string') throw new BadRequest('version: must be a single id');
    const view = await service.readPiece(req.params.id, version);
    if (!view) throw new NotFoundError(version === undefined ? 'Piece not found' : 'Piece or version not found');
    res.json(view);
  }));

  router.put('/pieces/:id/text', route(async (req, res) => {
    const { text } = parse(bodies.text, req.body);
    res.json(await service.updateText(req.params.id, text));
  }));

  router.put('/pieces/:id/privacy', route(async (req, res) => {
    const { privacy } = parse(bodies.privacy, req.body);
    res.json(await service.setPrivacy(req.params.id, privacy));
  }));

  router.post('/pieces/:id/analyze', route(async (req, res) => {
    res.json(await service.analyze(req.params.id));
  }));

  router.get('/pieces/:id/versions', route(async (req, res) => {
    res.json(await service.listVersions(req.params.id));
  }));

  router.post('/pieces/:id/notes', route(async (req, res) => {
    const input = parse(bodies.note, req.body);
    res.status(201).json(await service.addNote({ pieceId: req.params.id, ...input }));
  }));

  router.use(errorHandler);
  return router;
}
