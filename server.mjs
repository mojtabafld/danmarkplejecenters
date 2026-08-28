/**
 * A static file server for `dist/`, with no dependencies.
 *
 * The right way to host this app is as a Static Site: it is four files and a
 * CDN serves them faster and cheaper than any process can. This exists for the
 * case where the platform is running it as a Web Service instead, which builds
 * the same bundle but then expects something listening on $PORT. Without a
 * process to run, the container exits the moment it starts and the platform
 * reports it as terminated.
 *
 *   npm start            serves ./dist on $PORT (default 8080)
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
// 0.0.0.0, not localhost: a container's health check reaches it from outside.
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
  }),
);

/**
 * Resolve a URL path to a file inside ROOT, or null.
 *
 * The containment check is the point: `normalize` collapses `..` segments, and
 * comparing the resolved path against ROOT afterwards is what stops a crafted
 * URL reading files outside the served directory.
 */
function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const target = resolve(join(ROOT, normalize(decoded)));
  return target === ROOT || target.startsWith(ROOT + sep) ? target : null;
}

async function fileFor(urlPath) {
  const target = safePath(urlPath);
  if (!target) return null;
  try {
    const info = await stat(target);
    if (info.isFile()) return target;
    if (info.isDirectory()) {
      const index = join(target, 'index.html');
      if ((await stat(index)).isFile()) return index;
    }
  } catch {
    /* not there: the caller falls back to the catchall */
  }
  return null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }

  // Any unknown path serves the app, so a refresh or a shared deep link lands
  // on it rather than a 404.
  const file = (await fileFor(req.url ?? '/')) ?? join(ROOT, 'index.html');
  const type = TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream';

  // Filenames are not content-hashed, so the document must revalidate or a
  // deploy would keep serving the previous one from cache.
  const cache = file.endsWith('.html')
    ? 'no-cache'
    : 'public, max-age=3600, must-revalidate';

  try {
    const { size } = await stat(file);
    res.writeHead(200, {
      'content-type': type,
      'content-length': size,
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('The build output is missing. Run `npm run build` first.');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`serving ${ROOT} on http://${HOST}:${PORT}`);
});

// The platform sends SIGTERM on redeploy; finish in-flight responses first.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
