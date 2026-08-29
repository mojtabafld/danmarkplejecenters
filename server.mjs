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

import * as api from './server/api.mjs';
import * as db from './server/db.mjs';
import * as mail from './server/mail.mjs';

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

/*
 * Behind App Platform the process speaks plain http and the platform terminates
 * TLS, so req.socket.encrypted is false even though the visitor is on https.
 * The session cookie still has to be marked Secure in that case, and must NOT
 * be on a plain-http localhost or the browser drops it silently.
 */
const secureCookies = (req) =>
  req.headers['x-forwarded-proto'] === 'https' || process.env.FORCE_SECURE_COOKIES === '1';

const server = createServer(async (req, res) => {
  if (await api.handle(req, res, { secure: secureCookies(req) })) return;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }

  // Any unknown path serves the app, so a refresh or a shared deep link lands
  // on it rather than a 404.
  const file = (await fileFor(req.url ?? '/')) ?? join(ROOT, 'index.html');
  const type = TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream';

  // The document must always revalidate: it is the thing that names which
  // build to load. Everything under assets/ carries a content hash, so its
  // name changes whenever its bytes do and it can be cached indefinitely.
  // Anything else unhashed is treated like the document, cautiously.
  const rel = file.slice(ROOT.length + 1);
  const cache =
    rel.startsWith('assets' + sep) && /-[A-Za-z0-9_-]{8,}\./.test(rel)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';

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

/*
 * The database is optional on purpose. Without it the map, the search and the
 * detail cards all still work; only accounts and the visited list are
 * unavailable, and the API says so with a 503 rather than the whole site
 * failing to start because an environment variable is missing.
 */
if (db.connectionString()) {
  try {
    await db.init();
  } catch (err) {
    console.error('database init failed:', err.message);
  }
  // One line that says exactly which state accounts are in, so a broken
  // deployment is visible in the runtime log rather than found by whoever
  // tries to register first.
  console.log('database status:', JSON.stringify(db.status()));
} else {
  console.log('no DATABASE_URL, accounts disabled');
}

// Said at start-up, so a missing or wrong mail configuration is visible in the
// deploy log rather than discovered by the first person who tries to register.
console.log(await mail.check());

server.listen(PORT, HOST, () => {
  console.log(`serving ${ROOT} on http://${HOST}:${PORT}`);
});

// The platform sends SIGTERM on redeploy; finish in-flight responses first.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
