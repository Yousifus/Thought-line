// Vite config: React and Tailwind, the app rooted at src/web, built into dist/web (which the server serves), with /api proxied to the dev server.
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The repository root, with forward slashes: Vite matches the deny patterns against absolute paths.
const repo = fileURLToPath(new URL('.', import.meta.url)).replaceAll(String.fromCharCode(92), '/').replace(/\/$/, '');

export default defineConfig({
  root: 'src/web',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    // The dev server can serve any file under the workspace by its path. Keep the private data and secrets out of reach
    // (this list replaces Vite's own default, so its entries are repeated).
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', `${repo}/data/**`, `${repo}/eval/**`],
    },
    proxy: {
      '/api': 'http://127.0.0.1:4390',
    },
  },
});
