// Builds the Express app: the token-gated /api and /mcp behind a 2mb JSON limit, and the built web page served without a token.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { apiRouter, errorHandler } from './api';
import { requireToken } from './auth';
import type { Config } from './config';
import { mountMcp } from './mcp';
import type { Service } from './service';

const WEB_DIR = fileURLToPath(new URL('../../dist/web', import.meta.url));

export function buildApp(config: Config, service: Service): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // The token check comes first, so an unauthenticated caller never gets as far as body parsing.
  app.use('/api',
    requireToken(config.token),
    (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); },
    express.json({ limit: '2mb' }),
    apiRouter(service),
    (_req, res) => { res.status(404).json({ error: 'Not found' }); },
  );
  // Errors from the token-gated chain (such as a body that is not JSON) are mapped by the same handler.
  app.use('/api', errorHandler);

  // Same order for /mcp: token first, so the MCP transport and its body parsing never see an unauthenticated caller.
  app.use('/mcp', requireToken(config.token), (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  mountMcp(app, service, { maxChars: config.maxChars });

  // The page holds no data; the token gates the data.
  app.use(express.static(path.resolve(WEB_DIR)));
  return app;
}
