import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so `dist/index.html` also opens straight off the disk
  // (file://) — which is how the design-system gates render and measure it.
  base: './',
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // One classic bundle instead of ES modules: file:// blocks module
        // loading, and the gates need a page they can open without a server.
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  server: { port: 5173, open: true },
});
