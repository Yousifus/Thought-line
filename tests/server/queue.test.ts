// Tests for the serial queue: jobs never overlap, run in order, and one failure does not stop the rest.
import { serialQueue } from '../../src/server/queue';

test('jobs run one at a time, in the order they were queued', async () => {
  const queue = serialQueue();
  const log: string[] = [];
  let running = 0, maxRunning = 0;
  const job = (name: string, ms: number) => queue(async () => {
    running++; maxRunning = Math.max(maxRunning, running);
    log.push(`start ${name}`);
    await new Promise(r => setTimeout(r, ms));
    log.push(`end ${name}`);
    running--;
    return name;
  });
  const results = await Promise.all([job('a', 30), job('b', 5), job('c', 1)]);
  expect(results).toEqual(['a', 'b', 'c']);
  expect(maxRunning).toBe(1);
  expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
});

test('a failing job rejects its own caller and the next job still runs', async () => {
  const queue = serialQueue();
  const bad = queue(async () => { throw new Error('boom'); });
  const good = queue(async () => 'fine');
  await expect(bad).rejects.toThrow('boom');
  await expect(good).resolves.toBe('fine');
});

test('a job that throws synchronously is still contained', async () => {
  const queue = serialQueue();
  await expect(queue((() => { throw new Error('sync'); }) as () => Promise<never>)).rejects.toThrow('sync');
  await expect(queue(async () => 1)).resolves.toBe(1);
});
