import { defineConfig } from 'vite';

/**
 * Root config: serves the three-tab shell (index.html -> src/main.js) which
 * mounts every application. Each app can also be served on its own with
 * `vite expense-tracker` / `vite todo-manager` / `vite ads-campaign-manager`
 * (see package.json scripts).
 */
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
    include: [
      'tests/**/*.test.js', // shell (tabs + routing)
      'expense-tracker/tests/**/*.test.js',
      'todo-manager/tests/**/*.test.js',
      'ads-campaign-manager/tests/**/*.test.js',
    ],
    setupFiles: ['expense-tracker/tests/setup.js', 'todo-manager/tests/setup.js', 'ads-campaign-manager/tests/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'expense-tracker/src/**', 'todo-manager/src/**', 'ads-campaign-manager/src/**'],
      exclude: ['**/main.js'], // bootstrap files: one line each, exercised by the dev server
      reporter: ['text-summary', 'html'],
    },
  },
});
