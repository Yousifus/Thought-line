// Guards that src/core stays free of Node-only imports so the web app can share it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const FORBIDDEN = /from\s+['"](node:[^'"]*|fs|path|os|child_process|express)(\/[^'"]*)?['"]|\bprocess\./;
test('src/core has no Node-only imports', () => {
  const dir = 'src/core';
  const files = readdirSync(dir).filter(f => f.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(FORBIDDEN);
});
