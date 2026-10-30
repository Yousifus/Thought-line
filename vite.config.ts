// Placeholder Vite config (react + tailwind, root src/web); Task 10 fills in the dev proxy and build options.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  plugins: [react(), tailwindcss()],
});
