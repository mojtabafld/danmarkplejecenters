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
        // Content-hashed, and this is not cosmetic. With fixed names a browser
        // can pair a freshly fetched index.html with an app.js it cached from
        // the previous deploy. The two disagree about the DOM, the script dies
        // on the first element that moved, and the page renders as structure
        // with no text, no icons and no map. A hash in the name makes that
        // pairing impossible: new HTML can only ask for files that exist.
        entryFileNames: 'assets/app-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: { port: 5173, open: true },
});
