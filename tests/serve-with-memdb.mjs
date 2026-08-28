/**
 * The real server, with the in-memory Postgres swapped in. Used by the browser
 * test so the whole feature can be exercised without a database server.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';

import * as db from '../server/db.mjs';
import * as api from '../server/api.mjs';

const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 8150;

const mem = newDb();
mem.public.registerFunction({ name: 'now', returns: 'timestamptz', implementation: () => new Date() });
const { Pool } = mem.adapters.createPg();
await db.init({ injectedPool: new Pool() });

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2',
}));

const server = createServer(async (req, res) => {
  if (await api.handle(req, res, { secure: false })) return;
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const target = resolve(join(ROOT, normalize(path)));
  const inside = target === ROOT || target.startsWith(ROOT + sep);
  let file = inside ? target : join(ROOT, 'index.html');
  try {
    if (!(await stat(file)).isFile()) file = join(ROOT, 'index.html');
  } catch {
    file = join(ROOT, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES.get(extname(file)) ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
server.listen(PORT, '127.0.0.1', () => console.log(`memdb server on ${PORT}`));
