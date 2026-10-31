// Vitest config: bare test/expect globals, jsdom available for web component tests; generous timeouts and capped workers so the suite passes unattended.
import os from 'node:os';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    // Some tests spawn the server through tsx or hit the disk; on a busy laptop 5s is not enough.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Half the cores (at least 2): the process-spawning and file-locking tests slow down badly when every core is busy.
    maxWorkers: Math.max(2, Math.floor(os.cpus().length / 2)),
  },
});
