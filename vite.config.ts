import { defineConfig, type Plugin } from 'vite';

/**
 * Tell the browser about the map chunk in the markup, not in the app's code.
 *
 * The chunk is loaded by a dynamic import, so nothing asks for it until the app
 * bundle has been fetched, compiled and run -- measured at 540ms on a
 * 4x-throttled CPU, with the basemap's style.json trailing at 2039ms, later
 * than the old single bundle managed. A modulepreload in the head starts the
 * download alongside the app's own, at about 45ms, and lets the browser compile
 * it off the critical path.
 *
 * The filename is content-hashed, so it cannot be written by hand; it is read
 * out of the bundle Rollup just produced. If the chunk is ever not there the
 * link is simply not written -- a missing preload is a slower page, and a
 * preload pointing at nothing is a console error on every visit.
 */
function preloadMapChunk(): Plugin {
  return {
    name: 'preload-map-chunk',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const name = Object.keys(ctx.bundle ?? {}).find((f) => /maplibre-gl-.*\.js$/.test(f));
        if (!name) return;
        return [
          {
            tag: 'link',
            attrs: { rel: 'modulepreload', href: `./${name}` },
            injectTo: 'head',
          },
        ];
      },
    },
  };
}

export default defineConfig({
  plugins: [preloadMapChunk()],
  // Relative asset URLs, so `dist/index.html` also opens straight off the disk
  // (file://) — which is how the design-system gates render and measure it.
  base: './',
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        /*
         * Split, so the map library is not compiled before the app can show
         * anything.
         *
         * This was one classic IIFE with inlineDynamicImports, on the grounds
         * that file:// blocks module loading and the gates need a page they can
         * open without a server. That reason had gone stale: the gates open
         * verification/harness.html, panel.html, states.html and intro.html --
         * self-contained files built by verification/build-harness.mjs, whose
         * own header says the app bundle is unsuitable for them because it
         * "needs an HTTP origin and a live tile CDN". Nothing points a gate at
         * dist/index.html, so nothing was relying on this.
         *
         * What it cost: maplibre-gl could not be split out, so a 1.44MB bundle
         * had to be parsed and compiled before the first frame. Measured on a
         * 4x-throttled CPU, that was 1964ms inside V8 with no application
         * function on the stack -- 41.5% of the startup profile.
         */
        // Content-hashed, and this is not cosmetic. With fixed names a browser
        // can pair a freshly fetched index.html with an app.js it cached from
        // the previous deploy. The two disagree about the DOM, the script dies
        // on the first element that moved, and the page renders as structure
        // with no text, no icons and no map. A hash in the name makes that
        // pairing impossible: new HTML can only ask for files that exist.
        entryFileNames: 'assets/app-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: { port: 5173, open: true },
});
