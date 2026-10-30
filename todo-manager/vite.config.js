import { defineConfig } from 'vite';

/** Used only when the Todo Manager is served on its own (`vite todo-manager`). */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
