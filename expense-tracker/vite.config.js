import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built app works from any sub-path or straight from disk.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
  },
});
