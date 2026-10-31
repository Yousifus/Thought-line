// Tests for the HTTP API through supertest: token gate, validation, error mapping, and the privacy default.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { ProviderError } from '../../src/core';
import { buildApp } from '../../src/server/app';
import type { Config } from '../../src/server/config';
import { fileStore } from '../../src/server/fileStore';
import { serialQueue } from '../../src/server/queue';
import { createService } from '../../src/server/service';
import type { Service } from '../../src/server/service';
import { fakeProvider } from '../helpers/fakeProvider';

const fixtures = path.resolve(__dirname, '../fixtures');
const TEXT = fs.readFileSync(path.join(fixtures, 'sample-piece.txt'), 'utf8');
const ok = () => fs.readFileSync(path.join(fixtures, 'sample-analysis.json'), 'utf8');

const TOKEN = 'a-long-throwaway-token-for-tests-0123456789';
const auth = { Authorization: `Bearer ${TOKEN}` };
const config: Config = {
  host: '127.0.0.1', port: 0, token: TOKEN, dataDir: '', maxChars: 24000,
  local: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'm' },
};

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-api-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

function appWith(providers: Parameters<typeof createService>[0]['providers'], maxChars = 24000) {
  const service = createService({ store: fileStore(dir), providers, maxChars, queue: serialQueue() });
  return { app: buildApp({ ...config, maxChars }, service), service };
}

async function created(app: ReturnType<typeof buildApp>, body: object = { title: 't', text: TEXT }) {
  const res = await request(app).post('/api/pieces').set(auth).send(body).expect(201);
  return res.body as { id: string; privacy: string };
}

describe('the token gate', () => {
  test('no token, no data', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    await request(app).get('/api/pieces').expect(401, { error: 'unauthorized' });
  });

  test('a wrong token, a wrong scheme and a token of another length are all 401', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    await request(app).get('/api/pieces').set('Authorization', `Bearer ${'x'.repeat(TOKEN.length)}`).expect(401);
    await request(app).get('/api/pieces').set('Authorization', 'Bearer short').expect(401);
    await request(app).get('/api/pieces').set('Authorization', `Basic ${TOKEN}`).expect(401);
    await request(app).get('/api/pieces').set('Authorization', TOKEN).expect(401);
    await request(app).get('/api/pieces').set('Authorization', 'Bearer ').expect(401);
  });

  test('every route is gated, including unknown ones and writes', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    await request(app).post('/api/pieces').send({ title: 't', text: TEXT }).expect(401);
    await request(app).put('/api/pieces/abc/text').send({ text: 'x' }).expect(401);
    await request(app).get('/api/nothing-here').expect(401);
  });

  test('an unauthenticated request with an invalid body is 401, not a parse error', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    await request(app).post('/api/pieces').set('Content-Type', 'application/json').send('{not json').expect(401);
  });

  test('the right token gets in; an unknown api path is a JSON 404', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    await request(app).get('/api/pieces').set(auth).expect(200, []);
    await request(app).get('/api/nothing-here').set(auth).expect(404, { error: 'Not found' });
  });

  test('the page itself is served without a token and holds no data', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    const res = await request(app).get('/');
    expect([200, 404]).toContain(res.status); // 404 until the web app is built
  });
});

describe('pieces', () => {
  test('create defaults to private, and a bad privacy is 400', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    expect((await created(app)).privacy).toBe('private');
    expect((await created(app, { title: 't', text: TEXT, privacy: 'public' })).privacy).toBe('public');
    for (const privacy of ['Private', 'secret', '', null, 1, true]) {
      const res = await request(app).post('/api/pieces').set(auth).send({ title: 't', text: TEXT, privacy }).expect(400);
      expect(typeof res.body.error).toBe('string');
    }
  });

  test('create validates title and text, and ignores fields it does not know', async () => {
    const { app, service } = appWith({ local: fakeProvider([]) });
    await request(app).post('/api/pieces').set(auth).send({ text: TEXT }).expect(400);
    await request(app).post('/api/pieces').set(auth).send({ title: 't' }).expect(400);
    await request(app).post('/api/pieces').set(auth).send({ title: '', text: TEXT }).expect(400);
    await request(app).post('/api/pieces').set(auth).send({ title: 't', text: 5 }).expect(400);
    await request(app).post('/api/pieces').set(auth).send([]).expect(400);
    await request(app).post('/api/pieces').set(auth).expect(400);
    const sneaky = await created(app, { title: 't', text: TEXT, id: 'chosen', source: { kind: 'import', path: 'C:/x' } });
    expect(sneaky.id).not.toBe('chosen');
    expect((await service.listPieces())).toHaveLength(1);
    expect((await service.readPiece(sneaky.id))!.piece.source).toBeUndefined();
  });

  test('list shows created pieces', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    const p = await created(app);
    const res = await request(app).get('/api/pieces').set(auth).expect(200);
    expect(res.body).toEqual([expect.objectContaining({ id: p.id, title: 't', privacy: 'private', versionCount: 0 })]);
  });

  test('unknown piece is 404', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    await request(app).get('/api/pieces/nope').set(auth).expect(404);
    await request(app).put('/api/pieces/nope/text').set(auth).send({ text: 'x' }).expect(404);
    await request(app).put('/api/pieces/nope/privacy').set(auth).send({ privacy: 'public' }).expect(404);
    await request(app).post('/api/pieces/nope/analyze').set(auth).expect(404);
    await request(app).get('/api/pieces/nope/versions').set(auth).expect(404);
    const note = await request(app).post('/api/pieces/nope/notes').set(auth).send({ author: 'a', body: 'b', quote: 'q' }).expect(404);
    expect(typeof note.body.error).toBe('string');
  });

  test('an id that is not a safe id is 404 with a clean body, never a 500', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    for (const id of ['ABC', 'a%20b', '..%2Fsecret', '%2e%2e', 'a'.repeat(129), 'caf%C3%A9', '%00']) {
      const res = await request(app).get(`/api/pieces/${id}`).set(auth);
      expect(res.status, id).toBe(404);
      expect(typeof res.body.error).toBe('string');
      await request(app).post(`/api/pieces/${id}/analyze`).set(auth).expect(404);
      await request(app).get(`/api/pieces/${id}/versions`).set(auth).expect(404);
    }
  });

  test('a malformed or unknown version is 404', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    const p = await created(app);
    await request(app).get(`/api/pieces/${p.id}?version=nope`).set(auth).expect(404);
    await request(app).get(`/api/pieces/${p.id}?version=..%2Fx`).set(auth).expect(404);
    await request(app).get(`/api/pieces/${p.id}?version[]=a`).set(auth).expect(400);
  });

  test('text and privacy updates', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    const p = await created(app);
    const t = await request(app).put(`/api/pieces/${p.id}/text`).set(auth).send({ text: 'new text' }).expect(200);
    expect(t.body.text).toBe('new text');
    const pr = await request(app).put(`/api/pieces/${p.id}/privacy`).set(auth).send({ privacy: 'public' }).expect(200);
    expect(pr.body.privacy).toBe('public');
    await request(app).put(`/api/pieces/${p.id}/privacy`).set(auth).send({ privacy: 'maybe' }).expect(400);
    await request(app).put(`/api/pieces/${p.id}/privacy`).set(auth).send({}).expect(400);
    await request(app).put(`/api/pieces/${p.id}/text`).set(auth).send({ text: 3 }).expect(400);
    await request(app).put(`/api/pieces/${p.id}/text`).set(auth).send({}).expect(400);
  });

  test('analyze, read with structure and jumps, list versions, read an old version', async () => {
    const { app } = appWith({ local: fakeProvider([ok(), ok()]) });
    const p = await created(app);
    const v1 = (await request(app).post(`/api/pieces/${p.id}/analyze`).set(auth).expect(200)).body;
    expect(v1.analysis.stations).toHaveLength(4);
    const view = (await request(app).get(`/api/pieces/${p.id}`).set(auth).expect(200)).body;
    expect(view.version.id).toBe(v1.id);
    expect(view.structure.deadEnds).toEqual(['s4']);
    expect(view.jumps.map((j: { stationId: string }) => j.stationId)).toEqual(['s3']);
    const v2 = (await request(app).post(`/api/pieces/${p.id}/analyze`).set(auth).expect(200)).body;
    const versions = (await request(app).get(`/api/pieces/${p.id}/versions`).set(auth).expect(200)).body;
    expect(versions.map((v: { id: string }) => v.id)).toEqual([v2.id, v1.id]);
    const old = (await request(app).get(`/api/pieces/${p.id}?version=${v1.id}`).set(auth).expect(200)).body;
    expect(old.version.id).toBe(v1.id);
  });

  test('notes: add, see the range, refuse a missing quote, validate the body', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    const p = await created(app);
    const quote = 'the tide tables';
    const n = await request(app).post(`/api/pieces/${p.id}/notes`).set(auth).send({ author: 'me', body: 'check', quote }).expect(201);
    expect(n.body.anchor.quote).toBe(quote);
    const view = (await request(app).get(`/api/pieces/${p.id}`).set(auth).expect(200)).body;
    expect(view.notes[0].range).toEqual({ start: TEXT.indexOf(quote), end: TEXT.indexOf(quote) + quote.length });
    const missing = await request(app).post(`/api/pieces/${p.id}/notes`).set(auth).send({ author: 'me', body: 'b', quote: 'absent words' }).expect(404);
    expect(missing.body.error).toBe('That quote is not in the piece');
    await request(app).post(`/api/pieces/${p.id}/notes`).set(auth).send({ author: 'me', body: 'b' }).expect(400);
    await request(app).post(`/api/pieces/${p.id}/notes`).set(auth).send({ author: '', body: 'b', quote }).expect(400);
    await request(app).post(`/api/pieces/${p.id}/notes`).set(auth).send({ author: 'me', body: 'b', quote, prefix: 4 }).expect(400);
  });

  test('a private piece never reaches the cloud through the API', async () => {
    const local = fakeProvider([ok()], 'local'), cloud = fakeProvider([ok()], 'cloud');
    const { app } = appWith({ local, cloud });
    const p = await created(app);
    await request(app).post(`/api/pieces/${p.id}/analyze`).set(auth).expect(200);
    expect([local.calls.length, cloud.calls.length]).toEqual([1, 0]);
  });
});

describe('error mapping', () => {
  test('a dead model gives 502 naming the address', async () => {
    const dead = fakeProvider([new ProviderError('Model at http://127.0.0.1:1234/v1 unreachable: connect ECONNREFUSED')]);
    const { app } = appWith({ local: dead });
    const p = await created(app);
    const res = await request(app).post(`/api/pieces/${p.id}/analyze`).set(auth).expect(502);
    expect(res.body.error).toMatch(/127\.0\.0\.1:1234/);
  });

  test('a model that never answers sensibly gives 422', async () => {
    const { app } = appWith({ local: fakeProvider(['not json', 'still not json']) });
    const p = await created(app);
    const res = await request(app).post(`/api/pieces/${p.id}/analyze`).set(auth).expect(422);
    expect(res.body.error).toMatch(/could not be read/);
  });

  test('a piece over the limit gives 422', async () => {
    const { app } = appWith({ local: fakeProvider([ok()]) }, 10);
    const p = await created(app);
    const res = await request(app).post(`/api/pieces/${p.id}/analyze`).set(auth).expect(422);
    expect(res.body.error).toMatch(/limit is 10/);
  });

  test('a provider error never carries a bearer token out', async () => {
    const leaky = fakeProvider([new ProviderError('upstream said: Bearer sk-live-SECRET123 is invalid')]);
    const { app } = appWith({ local: leaky });
    const p = await created(app);
    const res = await request(app).post(`/api/pieces/${p.id}/analyze`).set(auth).expect(502);
    expect(JSON.stringify(res.body)).not.toContain('sk-live-SECRET123');
  });

  test('an unexpected error is a plain 500, logged server-side, with no stack and no secret in the body', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom: Service = {
      listPieces: async () => { throw new Error('disk exploded at C:\\Users\\x\\data with key sk-SECRET-999'); },
    } as unknown as Service;
    const app = buildApp(config, boom);
    const res = await request(app).get('/api/pieces').set(auth).expect(500);
    expect(res.body).toEqual({ error: 'Internal error' });
    expect(res.text).not.toMatch(/sk-SECRET-999|exploded|at .*\.ts|node_modules/);
    expect(spy).toHaveBeenCalled();
  });

  test('a synchronous throw in a handler is the same plain 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = { listPieces: () => { throw new Error('sync boom'); } } as unknown as Service;
    const res = await request(buildApp(config, boom)).get('/api/pieces').set(auth).expect(500);
    expect(res.body).toEqual({ error: 'Internal error' });
    expect(spy).toHaveBeenCalled();
  });

  test('malformed JSON is 400 and an oversized body is 413, both as { error }', async () => {
    const { app } = appWith({ local: fakeProvider([]) });
    const bad = await request(app).post('/api/pieces').set(auth).set('Content-Type', 'application/json').send('{oops').expect(400);
    expect(typeof bad.body.error).toBe('string');
    const big = await request(app).post('/api/pieces').set(auth).send({ title: 't', text: 'x'.repeat(2.1 * 1024 * 1024) }).expect(413);
    expect(typeof big.body.error).toBe('string');
  });
});
