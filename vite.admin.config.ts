import { defineConfig } from 'vite';

/**
 * The admin panel's own build.
 *
 * A second Vite run rather than a second entry in the first one, and the
 * reason is in the main config: that build is `format: 'iife'` with
 * `inlineDynamicImports`, which Rollup only allows for a single input. Adding
 * an entry there would force ES modules on the map as well, and the map's
 * bundle has to keep opening over file:// for the design-system gates.
 *
 * Two runs, two self-contained bundles, and the map never carries a byte of
 * the back office.
 */
export default defineConfig({
  root: 'admin',
  /*
   * Absolute, unlike the map's relative base, and it has to be. The page is
   * served from /admin, and a browser resolves "./assets/x.js" on a URL with
   * no trailing slash against the parent -- so the script was requested from
   * /assets/, which is the map's directory, and the page rendered as an empty
   * div. This page never opens over file://, so it can name its own path.
   */
  base: '/admin/',
  build: {
    target: 'es2022',
    outDir: '../dist/admin',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        // Content-hashed for the same reason the map's are: a cached script
        // from the previous deploy must never be able to pair with fresh HTML.
        entryFileNames: 'assets/admin-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
