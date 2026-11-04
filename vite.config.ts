import { defineConfig } from 'vite';

// Relative base so the built page works from any folder, the artifact host included.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5177 },
  preview: { port: 4177 },
});
