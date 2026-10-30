import { defineConfig } from 'vite';

/** Used only when the Ads Campaign Manager is served on its own (`vite ads-campaign-manager`). */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
