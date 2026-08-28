/**
 * End-to-end exercise of the accounts API against an in-memory Postgres.
 *
 * Runs the real HTTP handler over a real socket, so cookies, status codes and
 * the session round-trip are all covered rather than mocked.
 */
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { newDb } from 'pg-mem';

import * as db from '../server/db.mjs';
import * as api from '../server/api.mjs';

const mem = newDb();
mem.public.registerFunction({ name: 'now', returns: 'timestamptz', implementation: () => new Date() });
const { Pool } = mem.adapters.createPg();
await db.init({ injectedPool: new Pool() });

const server = createServer(async (req, res) => {
  if (await api.handle(req, res, { secure: false })) return;
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json, setCookie: set };
}

let pass = 0;
const check = (name, cond) => {
  assert.ok(cond, name);
  pass += 1;
  console.log('  ok  ', name);
};

console.log('accounts API');

/* -------------------------------------------------------------- signup --- */
let r = await call('POST', '/api/auth/signup', { email: 'not-an-email', password: 'longenoughpassword' });
check('rejects an implausible address', r.status === 400 && r.body.error === 'bad_email');

r = await call('POST', '/api/auth/signup', { email: 'a@b.dk', password: 'short' });
check('rejects a short password', r.status === 400 && r.body.error === 'too_short');

r = await call('POST', '/api/auth/signup', { email: 'Anna@Example.DK', password: 'a-good-long-password' });
check('creates the account', r.status === 201 && r.body.user.email === 'Anna@Example.DK');
check('sets an HttpOnly session cookie', /HttpOnly/i.test(r.setCookie) && /SameSite=Lax/i.test(r.setCookie));
check('does not mark it Secure on plain http', !/Secure/i.test(r.setCookie));

/* ------------------------------------------------------------- session --- */
r = await call('GET', '/api/auth/me');
check('the cookie identifies the user', r.status === 200 && r.body.user.email === 'Anna@Example.DK');

/* -------------------------------------------------------------- visits --- */
r = await call('GET', '/api/visits');
check('a new account has no visits', r.status === 200 && r.body.visits.length === 0);

r = await call('PUT', '/api/visits/86bd866d-7fec-46e4-99b2-38ca86cbb59d');
check('marks a plejecenter visited', r.status === 200 && r.body.visited === true);

r = await call('PUT', '/api/visits/86bd866d-7fec-46e4-99b2-38ca86cbb59d');
check('marking twice is not an error', r.status === 200);

r = await call('GET', '/api/visits');
check('the visit is listed once', r.body.visits.length === 1);

r = await call('DELETE', '/api/visits/86bd866d-7fec-46e4-99b2-38ca86cbb59d');
check('removes it again', r.status === 200 && r.body.visited === false);
r = await call('GET', '/api/visits');
check('the list is empty again', r.body.visits.length === 0);

/* --------------------------------------------------- duplicate + signin --- */
const signedIn = cookie;
cookie = '';
r = await call('POST', '/api/auth/signup', { email: 'anna@example.dk', password: 'another-long-one' });
check('the same address cannot register twice, whatever the case', r.status === 409);

r = await call('POST', '/api/auth/signin', { email: 'anna@example.dk', password: 'wrong-password-here' });
check('a wrong password is refused', r.status === 401 && r.body.error === 'bad_credentials');

r = await call('POST', '/api/auth/signin', { email: 'unknown@example.dk', password: 'a-good-long-password' });
check('an unknown address is refused the same way', r.status === 401 && r.body.error === 'bad_credentials');

cookie = '';
r = await call('POST', '/api/auth/signin', { email: 'ANNA@example.dk', password: 'a-good-long-password' });
check('signs in, case-insensitively', r.status === 200);

/* ----------------------------------------------------- signed-out access -- */
const good = cookie;
cookie = '';
r = await call('GET', '/api/visits');
check('visits are private to a session', r.status === 401 && r.body.error === 'signed_out');
r = await call('PUT', '/api/visits/anything');
check('cannot mark a visit while signed out', r.status === 401);

cookie = 'plejekort_session=forged-token-value';
r = await call('GET', '/api/auth/me');
check('a forged token is nobody', r.status === 200 && r.body.user === null);

/* -------------------------------------------------- isolation + signout --- */
cookie = '';
await call('POST', '/api/auth/signup', { email: 'bo@example.dk', password: 'bos-long-password' });
await call('PUT', '/api/visits/other-centre');
r = await call('GET', '/api/visits');
check('a second account sees only its own visits', r.body.visits.length === 1 && r.body.visits[0] === 'other-centre');

r = await call('POST', '/api/auth/signout');
check('signing out clears the cookie', r.status === 200 && /Max-Age=0/.test(r.setCookie));
cookie = 'plejekort_session=' + good.split('=')[1];
r = await call('GET', '/api/auth/me');
check('the other session still works', r.body.user?.email === 'Anna@Example.DK');

/* ------------------------------------------------------ account removal --- */
await call('PUT', '/api/visits/to-be-deleted');
r = await call('DELETE', '/api/auth/account');
check('the account can be deleted', r.status === 200);
r = await call('GET', '/api/auth/me');
check('its session no longer resolves', r.body.user === null);
const left = await db.query('SELECT count(*)::int AS n FROM visits');
check('deleting the account took its visits with it', left.rows[0].n === 1);

/* ------------------------------------------------------------ hardening -- */
r = await fetch(base + '/api/auth/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
check('malformed JSON is a 400, not a crash', r.status === 400);

r = await fetch(base + '/api/nope', { method: 'GET' });
check('unknown API routes 404', r.status === 404);

// The bound-parameter check: an id that would break naive string concatenation.
cookie = '';
await call('POST', '/api/auth/signup', { email: 'sql@example.dk', password: 'yet-another-password' });
await call('PUT', "/api/visits/x'; DROP TABLE visits; --");
const survived = await db.query('SELECT count(*)::int AS n FROM visits');
check('an id with SQL in it is stored, not executed', survived.rows[0].n === 2);

server.close();
await db.close();
console.log(`\n${pass}/${pass} accounts API checks pass`);
