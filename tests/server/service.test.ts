// Tests for the service: privacy routing, versions, notes that follow their passage, and the serial queue.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzePiece, ProviderError } from '../../src/core';
import { fileStore } from '../../src/server/fileStore';
import { fixtureProvider } from '../../src/server/fixtureProvider';
import { serialQueue } from '../../src/server/queue';
import { createService, NotFoundError } from '../../src/server/service';
import { fakeProvider } from '../helpers/fakeProvider';

const fixtures = path.resolve(__dirname, '../fixtures');
const TEXT = fs.readFileSync(path.join(fixtures, 'sample-piece.txt'), 'utf8');
const ANALYSIS_PATH = path.join(fixtures, 'sample-analysis.json');
const ok = () => fs.readFileSync(ANALYSIS_PATH, 'utf8');

let dir: string;
let store: ReturnType<typeof fileStore>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-service-'));
  store = fileStore(dir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const make = (providers: Parameters<typeof createService>[0]['providers'], maxChars = 24000) =>
  createService({ store, providers, maxChars, queue: serialQueue() });

test('the sample fixture analyses cleanly: every station anchored, a jump, a dead end', async () => {
  const a = await analyzePiece(fixtureProvider(ANALYSIS_PATH), TEXT, { maxChars: 24000 });
  expect(a.stations.filter(s => s.unanchored)).toEqual([]);
  expect(a.motifs.filter(m => m.unanchored)).toEqual([]);
  const { findJumps, deriveStructure } = await import('../../src/core');
  expect(findJumps(a).length).toBeGreaterThanOrEqual(1);
  expect(deriveStructure(a).deadEnds.length).toBeGreaterThanOrEqual(1);
});

test('createPiece defaults to private and generates a safe lowercase id', async () => {
  const svc = make({ local: fakeProvider([]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  expect(p.privacy).toBe('private');
  expect(p.id).toMatch(/^[a-z0-9_-]{1,128}$/);
  expect(await store.getPiece(p.id)).toEqual(p);
  expect(p.createdAt).toBe(p.updatedAt);
});

test('a private piece is analysed locally even when a cloud key is set', async () => {
  const local = fakeProvider([ok()], 'local'), cloud = fakeProvider([ok()], 'cloud');
  const svc = make({ local, cloud });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  await svc.analyze(p.id);
  expect([local.calls.length, cloud.calls.length]).toEqual([1, 0]);
});

test('a public piece goes to the cloud provider when there is one', async () => {
  const local = fakeProvider([ok()], 'local'), cloud = fakeProvider([ok()], 'cloud');
  const svc = make({ local, cloud });
  const p = await svc.createPiece({ title: 't', text: TEXT, privacy: 'public' });
  await svc.analyze(p.id);
  expect([local.calls.length, cloud.calls.length]).toEqual([0, 1]);
});

test('switching a piece back to private stops it reaching the cloud', async () => {
  const local = fakeProvider([ok()], 'local'), cloud = fakeProvider([], 'cloud');
  const svc = make({ local, cloud });
  const p = await svc.createPiece({ title: 't', text: TEXT, privacy: 'public' });
  const back = await svc.setPrivacy(p.id, 'private');
  expect(back.privacy).toBe('private');
  await svc.analyze(p.id);
  expect(cloud.calls.length).toBe(0);
});

test('a cloud provider in the local slot is refused, not used', async () => {
  const wrong = fakeProvider([ok()], 'cloud');
  const svc = make({ local: wrong });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  await expect(svc.analyze(p.id)).rejects.toBeInstanceOf(ProviderError);
  expect(wrong.calls.length).toBe(0);
});

test('analyze saves a version of the text it analysed, and readPiece shows it with structure and jumps', async () => {
  const svc = make({ local: fakeProvider([ok()]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  const v = await svc.analyze(p.id);
  expect(v.text).toBe(TEXT);
  const view = await svc.readPiece(p.id);
  expect(view!.version!.id).toBe(v.id);
  expect(view!.structure!.deadEnds).toContain('s4');
  expect(view!.jumps.map(j => j.stationId)).toEqual(['s3']);
  expect((await svc.readPiece(p.id, v.id))!.version!.id).toBe(v.id);
});

test('readPiece before any analysis has no version, structure or jumps', async () => {
  const svc = make({ local: fakeProvider([]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  const view = await svc.readPiece(p.id);
  expect(view).toMatchObject({ version: null, structure: null, jumps: [], notes: [] });
  expect(view!.piece.id).toBe(p.id);
});

test('readPiece answers null for an unknown piece, an unknown version and a malformed id', async () => {
  const svc = make({ local: fakeProvider([ok()]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  expect(await svc.readPiece('nope')).toBeNull();
  expect(await svc.readPiece('../escape')).toBeNull();
  expect(await svc.readPiece(p.id, 'no-such-version')).toBeNull();
});

test('a note follows its passage into an edited text, and shows as gone when the passage is deleted', async () => {
  const svc = make({ local: fakeProvider([]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  const quote = 'The moon therefore rules every living thing on earth';
  const note = await svc.addNote({ pieceId: p.id, author: 'me', body: 'overstated', quote });
  const before = (await svc.readPiece(p.id))!.notes[0].range!;
  expect(TEXT.slice(before.start, before.end)).toBe(quote);

  const withLine = 'A new opening line.\n\n' + TEXT;
  await svc.updateText(p.id, withLine);
  const shifted = (await svc.readPiece(p.id))!.notes;
  expect(shifted[0].id).toBe(note.id);
  expect(shifted[0].range).toEqual({ start: before.start + 'A new opening line.\n\n'.length, end: before.end + 'A new opening line.\n\n'.length });

  await svc.updateText(p.id, withLine.replace(quote, ''));
  expect((await svc.readPiece(p.id))!.notes[0].range).toBeNull();
});

test('a note resolves against the shown version, not the edited piece', async () => {
  const svc = make({ local: fakeProvider([ok()]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  const v = await svc.analyze(p.id);
  await svc.addNote({ pieceId: p.id, author: 'me', body: 'b', quote: 'the tide tables' });
  await svc.updateText(p.id, 'Something else entirely.');
  const old = (await svc.readPiece(p.id, v.id))!;
  expect(old.notes[0].range).not.toBeNull();
  expect(old.piece.text).toBe('Something else entirely.');
});

test('a note quotes Arabic too, matching through diacritics', async () => {
  const svc = make({ local: fakeProvider([]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  const n = await svc.addNote({ pieceId: p.id, author: 'me', body: 'b', quote: 'أَظُنُّ أن البحر يتذكر' });
  expect(n.anchor.quote).toBe('أظن أن البحر يتذكر');
});

test('prefix and suffix choose between repeated quotes', async () => {
  const svc = make({ local: fakeProvider([]) });
  const text = 'first the sea was calm. later the sea was rough.';
  const p = await svc.createPiece({ title: 't', text });
  const n = await svc.addNote({ pieceId: p.id, author: 'me', body: 'b', quote: 'the sea', suffix: ' was rough' });
  expect(n.anchor.start).toBe(text.lastIndexOf('the sea'));
});

test('a note on a quote that is not in the piece is refused', async () => {
  const svc = make({ local: fakeProvider([]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  await expect(svc.addNote({ pieceId: p.id, author: 'me', body: 'b', quote: 'nowhere to be found' }))
    .rejects.toThrow(new NotFoundError('That quote is not in the piece'));
  await expect(svc.addNote({ pieceId: p.id, author: 'me', body: 'b', quote: '   ' })).rejects.toBeInstanceOf(NotFoundError);
});

test('unknown pieces are NotFoundError everywhere', async () => {
  const svc = make({ local: fakeProvider([]) });
  await expect(svc.updateText('nope', 'x')).rejects.toBeInstanceOf(NotFoundError);
  await expect(svc.setPrivacy('nope', 'public')).rejects.toBeInstanceOf(NotFoundError);
  await expect(svc.analyze('nope')).rejects.toBeInstanceOf(NotFoundError);
  await expect(svc.addNote({ pieceId: 'nope', author: 'a', body: 'b', quote: 'q' })).rejects.toBeInstanceOf(NotFoundError);
  await expect(svc.listVersions('nope')).rejects.toBeInstanceOf(NotFoundError);
  await expect(svc.analyze('../escape')).rejects.toBeInstanceOf(NotFoundError);
});

test('updateText changes the text and updatedAt but not the versions', async () => {
  const svc = make({ local: fakeProvider([ok()]) });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  const v = await svc.analyze(p.id);
  const up = await svc.updateText(p.id, 'changed');
  expect(up.text).toBe('changed');
  expect(up.updatedAt >= p.updatedAt).toBe(true);
  expect((await svc.listVersions(p.id)).map(x => x.id)).toEqual([v.id]);
});

test('two analyses at once both save, one after the other', async () => {
  const local = fakeProvider([ok(), ok()]);
  const svc = make({ local });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  await Promise.all([svc.analyze(p.id), svc.analyze(p.id)]);
  expect(await store.listVersions(p.id)).toHaveLength(2);
});

test('a failed analysis does not block the next one in the queue', async () => {
  const local = fakeProvider([new ProviderError('Model at http://127.0.0.1:1234/v1 unreachable: down'), ok()]);
  const svc = make({ local });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  const [a, b] = await Promise.allSettled([svc.analyze(p.id), svc.analyze(p.id)]);
  expect(a.status).toBe('rejected');
  expect(b.status).toBe('fulfilled');
  expect(await store.listVersions(p.id)).toHaveLength(1);
});

test('analyses run in the order they were requested, even when one piece read is slower than the other', async () => {
  // The first read of the piece is slow, the rest are instant: if analyze() did anything slow before taking its
  // place in the queue, the second call would overtake the first and take its scripted [error, ok] response.
  let reads = 0;
  const jittery: typeof store = {
    ...store,
    getPiece: async id => {
      if (reads++ === 0) await new Promise(r => setTimeout(r, 40));
      return store.getPiece(id);
    },
  };
  const local = fakeProvider([new ProviderError('Model at http://127.0.0.1:1234/v1 unreachable: down'), ok()]);
  const svc = createService({ store: jittery, providers: { local }, maxChars: 24000, queue: serialQueue() });
  const p = await svc.createPiece({ title: 't', text: TEXT });
  reads = 0;
  const [a, b] = await Promise.allSettled([svc.analyze(p.id), svc.analyze(p.id)]);
  expect([a.status, b.status]).toEqual(['rejected', 'fulfilled']);
});

test('analyze enforces maxChars', async () => {
  const svc = make({ local: fakeProvider([ok()]) }, 10);
  const p = await svc.createPiece({ title: 't', text: TEXT });
  await expect(svc.analyze(p.id)).rejects.toThrow(/limit is 10/);
});

test('listPieces shows what was created', async () => {
  const svc = make({ local: fakeProvider([]) });
  const p = await svc.createPiece({ title: 'one', text: TEXT });
  expect(await svc.listPieces()).toEqual([expect.objectContaining({ id: p.id, title: 'one', versionCount: 0 })]);
});

describe('edits at once do not undo each other', () => {
  /** A store whose piece reads and writes are slow and jittery, so unserialised read-modify-write cycles interleave. */
  function slowStore(): ReturnType<typeof fileStore> {
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    return {
      ...store,
      getPiece: async id => { await sleep(15); return store.getPiece(id); },
      putPiece: async piece => { await sleep(15); return store.putPiece(piece); },
    };
  }
  const slow = () => createService({ store: slowStore(), providers: { local: fakeProvider([]) }, maxChars: 24000, queue: serialQueue() });

  test('setPrivacy then updateText at once: ends private AND with the new text', async () => {
    const svc = slow();
    const p = await svc.createPiece({ title: 't', text: TEXT, privacy: 'public' });
    await Promise.all([svc.setPrivacy(p.id, 'private'), svc.updateText(p.id, 'the new text')]);
    const after = await store.getPiece(p.id);
    expect([after!.privacy, after!.text]).toEqual(['private', 'the new text']);
  });

  test('updateText then setPrivacy at once: ends private AND with the new text', async () => {
    const svc = slow();
    const p = await svc.createPiece({ title: 't', text: TEXT, privacy: 'public' });
    await Promise.all([svc.updateText(p.id, 'the new text'), svc.setPrivacy(p.id, 'private')]);
    const after = await store.getPiece(p.id);
    expect([after!.privacy, after!.text]).toEqual(['private', 'the new text']);
  });

  test('many edits at once keep the last of each field, in call order', async () => {
    const svc = slow();
    const p = await svc.createPiece({ title: 't', text: TEXT, privacy: 'public' });
    await Promise.all([
      svc.updateText(p.id, 'one'), svc.setPrivacy(p.id, 'private'), svc.updateText(p.id, 'two'), svc.setPrivacy(p.id, 'public'),
      svc.updateText(p.id, 'three'), svc.setPrivacy(p.id, 'private'),
    ]);
    const after = await store.getPiece(p.id);
    expect([after!.privacy, after!.text]).toEqual(['private', 'three']);
  });

  test('an analysis queued behind a switch to private is sent to the local model, not the cloud', async () => {
    const local = fakeProvider([ok()], 'local'), cloud = fakeProvider([ok()], 'cloud');
    const svc = createService({ store: slowStore(), providers: { local, cloud }, maxChars: 24000, queue: serialQueue() });
    const p = await svc.createPiece({ title: 't', text: TEXT, privacy: 'public' });
    await Promise.all([svc.setPrivacy(p.id, 'private'), svc.analyze(p.id)]);
    expect([local.calls.length, cloud.calls.length]).toEqual([1, 0]);
  });

  test('edits to different pieces do not wait for each other', async () => {
    const svc = slow();
    const a = await svc.createPiece({ title: 'a', text: 'a' });
    const b = await svc.createPiece({ title: 'b', text: 'b' });
    await Promise.all([svc.updateText(a.id, 'a2'), svc.updateText(b.id, 'b2')]);
    expect([(await store.getPiece(a.id))!.text, (await store.getPiece(b.id))!.text]).toEqual(['a2', 'b2']);
  });

  test('a failed edit does not block the next edit of that piece', async () => {
    const svc = slow();
    const p = await svc.createPiece({ title: 't', text: TEXT });
    const bad = svc.updateText('nope', 'x');
    const good = svc.updateText(p.id, 'fine');
    await expect(bad).rejects.toBeInstanceOf(NotFoundError);
    expect((await good).text).toBe('fine');
  });
});

describe('line endings are stored as LF, because a textarea counts offsets that way', () => {
  const crlf = 'First line of a neutral note.\r\nSecond line, the one we quote.\r\n\r\nThird line.\rFourth line.';
  const lf = 'First line of a neutral note.\nSecond line, the one we quote.\n\nThird line.\nFourth line.';

  test('createPiece normalizes CRLF and lone CR', async () => {
    const svc = make({ local: fakeProvider([]) });
    const p = await svc.createPiece({ title: 't', text: crlf });
    expect(p.text).toBe(lf);
    expect((await store.getPiece(p.id))!.text).toBe(lf);
  });

  test('updateText normalizes CRLF and lone CR', async () => {
    const svc = make({ local: fakeProvider([]) });
    const p = await svc.createPiece({ title: 't', text: 'x' });
    const updated = await svc.updateText(p.id, crlf);
    expect(updated.text).toBe(lf);
    expect((await store.getPiece(p.id))!.text).toBe(lf);
  });

  test('a note on a CRLF piece lands on the quoted words at the LF offset', async () => {
    const svc = make({ local: fakeProvider([]) });
    const p = await svc.createPiece({ title: 't', text: crlf });
    const quote = 'the one we quote';
    await svc.addNote({ pieceId: p.id, author: 'a', body: 'b', quote });
    const view = (await svc.readPiece(p.id))!;
    const range = view.notes[0].range!;
    expect(range.start).toBe(lf.indexOf(quote));
    expect(view.piece.text.slice(range.start, range.end)).toBe(quote);
  });

  test('analysis of a CRLF piece sees LF text, so its passages and highlights line up', async () => {
    const svc = make({ local: fakeProvider([ok()]) });
    const p = await svc.createPiece({ title: 't', text: TEXT.replace(/\n/g, '\r\n') });
    const version = await svc.analyze(p.id);
    expect(version.text).toBe(TEXT.replace(/\r\n?/g, '\n'));
    expect(version.analysis.stations.filter(s => s.unanchored)).toEqual([]);
  });
});
