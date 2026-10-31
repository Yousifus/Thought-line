// Bearer-token gate for every /api request: constant-time comparison, 401 with a plain JSON body otherwise.
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function requireToken(token: string): RequestHandler {
  const expected = Buffer.from(token, 'utf8');
  return (req, res, next) => {
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer (.+)$/i.exec(header) : null;
    if (match) {
      const given = Buffer.from(match[1], 'utf8');
      if (given.length === expected.length && timingSafeEqual(given, expected)) {
        next();
        return;
      }
    }
    res.status(401).json({ error: 'unauthorized' });
  };
}
