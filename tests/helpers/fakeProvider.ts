// Scripted ModelProvider for tests: returns queued responses in order, throws queued Errors, records every request.
import type { CompletionRequest, ModelProvider } from '../../src/core/provider';

export function fakeProvider(
  responses: Array<string | Error>,
  kind: 'local' | 'cloud' = 'local',
  name = 'fake',
): ModelProvider & { calls: CompletionRequest[] } {
  const queue = [...responses];
  const calls: CompletionRequest[] = [];
  return {
    name,
    kind,
    calls,
    async complete(req: CompletionRequest): Promise<string> {
      calls.push(req);
      const next = queue.shift();
      if (next === undefined) throw new Error('fakeProvider: no response queued');
      if (next instanceof Error) throw next;
      return next;
    },
  };
}
