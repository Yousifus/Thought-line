// Dev-only model provider that returns a canned analysis file, so the UI can be built without a GPU.
import fs from 'node:fs/promises';
import type { ModelProvider } from '../core';

/** Kind 'local' (so private pieces may use it), name 'fixture'. The file is read on every call, so edits show at once. */
export function fixtureProvider(path: string): ModelProvider {
  return {
    name: 'fixture',
    kind: 'local',
    async complete(): Promise<string> {
      return fs.readFile(path, 'utf8');
    },
  };
}
