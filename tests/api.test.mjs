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
import * as mail from '../server/mail.mjs';

/** Captures messages instead of sending them, so the link can be asserted on. */
const outbox = [];
mail.setTransport({ sendMail: async (m) => { outbox.push(m); return { messageId: 'test' }; } });
const lastLink = () => (outbox.at(-1)?.text.match(/https?:\/\/\S+/) ?? [])[0];

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
// Each phase pretends to be a different client, the way real traffic is, so the
// per-address throttle does not turn a long test into a lockout.
let client = '10.0.0.1';
async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': client,
      ...(cookie ? { cookie } : {}),
    },
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
check('sign-up reports the address is pending', r.status === 201 && r.body.pending === true);
check('sign-up does NOT sign you in', !r.setCookie);
check('a verification mail was sent to that address', outbox.at(-1)?.to === 'Anna@Example.DK');
check('the mail carries a link with a token', /\/verify\?token=/.test(lastLink() ?? ''));
check('the message says its piece in all three languages',
  /Bekræft/.test(outbox.at(-1).text) && /Confirm/.test(outbox.at(-1).text) && /تأیید/.test(outbox.at(-1).text));

/* ------------------------------------------------- verification gating --- */
r = await call('POST', '/api/auth/signin', { email: 'anna@example.dk', password: 'a-good-long-password' });
check('an unverified address cannot sign in', r.status === 403 && r.body.error === 'not_verified');
check('and is told which address needs confirming', r.body.email === 'Anna@Example.DK');

const link = lastLink();
let v = await fetch(link, { redirect: 'manual' });
check('clicking the link redirects back to the app, confirmed',
  v.status === 303 && v.headers.get('location') === '/?verified=1');

v = await fetch(link, { redirect: 'manual' });
check('the same link cannot be used twice',
  v.status === 303 && v.headers.get('location') === '/?verified=0');

v = await fetch(base + '/verify?token=not-a-real-token', { redirect: 'manual' });
check('a forged token is refused', v.headers.get('location') === '/?verified=0');

r = await call('POST', '/api/auth/signin', { email: 'anna@example.dk', password: 'a-good-long-password' });
check('once confirmed, sign-in works', r.status === 200);
check('and now sets an HttpOnly session cookie',
  /HttpOnly/i.test(r.setCookie) && /SameSite=Lax/i.test(r.setCookie));
check('not marked Secure on plain http', !/Secure/i.test(r.setCookie));

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

/* ----------------------------------------------------------------- notes -- */
r = await call('GET', '/api/notes');
check('a new account has no notes', r.status === 200 && Object.keys(r.body.notes).length === 0);

r = await call('PUT', '/api/notes/86bd866d-7fec-46e4-99b2-38ca86cbb59d', { body: '  Ringede tirsdag, venteliste 4 mdr.  ' });
check('a note is saved, trimmed', r.status === 200 && r.body.note === 'Ringede tirsdag, venteliste 4 mdr.');

r = await call('GET', '/api/notes');
check('and comes back keyed by plejecenter',
  r.body.notes['86bd866d-7fec-46e4-99b2-38ca86cbb59d'] === 'Ringede tirsdag, venteliste 4 mdr.');

r = await call('PUT', '/api/notes/86bd866d-7fec-46e4-99b2-38ca86cbb59d', { body: 'Rettet' });
check('writing again replaces rather than duplicating', r.status === 200 && r.body.note === 'Rettet');
const noteRows = await db.query('SELECT count(*)::int AS n FROM notes');
check('one row, not two', noteRows.rows[0].n === 1);

// A note must survive unmarking: losing written text to an unrelated click
// would be the worst kind of surprise.
await call('PUT', '/api/visits/86bd866d-7fec-46e4-99b2-38ca86cbb59d');
await call('DELETE', '/api/visits/86bd866d-7fec-46e4-99b2-38ca86cbb59d');
r = await call('GET', '/api/notes');
check('removing it from visited keeps the note',
  r.body.notes['86bd866d-7fec-46e4-99b2-38ca86cbb59d'] === 'Rettet');

r = await call('PUT', '/api/notes/86bd866d-7fec-46e4-99b2-38ca86cbb59d', { body: '   ' });
check('an empty note deletes rather than storing a blank', r.status === 200 && r.body.note === null);
r = await call('GET', '/api/notes');
check('and it is gone', Object.keys(r.body.notes).length === 0);

r = await call('PUT', '/api/notes/x', { body: 'y'.repeat(2001) });
check('an over-long note is refused', r.status === 400 && r.body.error === 'note_too_long');

cookie = '';
r = await call('GET', '/api/notes');
check('notes are private to a session', r.status === 401);
r = await call('PUT', '/api/notes/anything', { body: 'nope' });
check('and cannot be written while signed out', r.status === 401);


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
client = '10.0.0.2';
await call('POST', '/api/auth/signup', { email: 'bo@example.dk', password: 'bos-long-password' });
await fetch(lastLink(), { redirect: 'manual' });
await call('POST', '/api/auth/signin', { email: 'bo@example.dk', password: 'bos-long-password' });
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
const notesLeft = await db.query('SELECT count(*)::int AS n FROM notes');
check('and its notes', notesLeft.rows[0].n === 0);

/* ---------------------------------------------------------------- resend -- */
cookie = '';
client = '10.0.0.3';
await call('POST', '/api/auth/signup', { email: 'carl@example.dk', password: 'carls-long-password' });
const firstLink = lastLink();
r = await call('POST', '/api/auth/resend', { email: 'carl@example.dk' });
check('resend answers ok', r.status === 200);
check('and sends a fresh link', lastLink() !== firstLink);
v = await fetch(firstLink, { redirect: 'manual' });
check('the superseded link no longer works', v.headers.get('location') === '/?verified=0');
v = await fetch(lastLink(), { redirect: 'manual' });
check('the newest link does', v.headers.get('location') === '/?verified=1');

const before = outbox.length;
r = await call('POST', '/api/auth/resend', { email: 'nobody@example.dk' });
check('resend for an unknown address answers the same and sends nothing',
  r.status === 200 && outbox.length === before);

r = await call('POST', '/api/auth/resend', { email: 'carl@example.dk' });
check('resend for an already-confirmed address sends nothing',
  r.status === 200 && outbox.length === before);

/* ------------------------------------------------------------ hardening -- */
r = await fetch(base + '/api/auth/signin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
check('malformed JSON is a 400, not a crash', r.status === 400);

r = await fetch(base + '/api/nope', { method: 'GET' });
check('unknown API routes 404', r.status === 404);

// The bound-parameter check: an id that would break naive string concatenation.
cookie = '';
client = '10.0.0.4';
await call('POST', '/api/auth/signup', { email: 'sql@example.dk', password: 'yet-another-password' });
await fetch(lastLink(), { redirect: 'manual' });
await call('POST', '/api/auth/signin', { email: 'sql@example.dk', password: 'yet-another-password' });
await call('PUT', "/api/visits/x'; DROP TABLE visits; --");
const survived = await db.query('SELECT count(*)::int AS n FROM visits');
check('an id with SQL in it is stored, not executed', survived.rows[0].n === 2);

/* ---------------------------------------------------------- ratings -- */
/*
 * The rule under test throughout: a star counts immediately, words wait for a
 * human. Everything else here follows from that.
 */
console.log('\nratings and reviews');
cookie = '';
client = '10.0.0.6';
await call('POST', '/api/auth/signup', { email: 'rater@example.dk', password: 'a-long-enough-pass' });
await fetch(lastLink());
await call('POST', '/api/auth/signin', { email: 'rater@example.dk', password: 'a-long-enough-pass' });

r = await call('PUT', '/api/reviews/plejehjem-1', { stars: 4 });
check('a rating with no words is stored', r.status === 200 && r.body.mine.stars === 4);
check('and is approved on the spot, because there is nothing to moderate',
  r.body.mine.status === 'approved');
check('and counts towards the average at once', r.body.count === 1 && r.body.average === 4);
check('and the spread puts it in the right bucket',
  JSON.stringify(r.body.spread) === JSON.stringify([0, 0, 0, 1, 0]));

r = await call('PUT', '/api/reviews/plejehjem-1', { stars: 4, body: 'Venlig modtagelse.' });
check('adding words sends the review to the queue', r.body.mine.status === 'pending');
check('and the words are not published while it waits', r.body.reviews.length === 0);
check('but the star still counts', r.body.count === 1 && r.body.average === 4);

r = await call('PUT', '/api/reviews/plejehjem-1', { stars: 2, body: 'Venlig modtagelse.' });
check('changing only the stars does not re-queue the same text',
  r.body.mine.status === 'pending' && r.body.average === 2);

r = await call('PUT', '/api/reviews/plejehjem-1', { stars: 9 });
check('a sixth star is refused', r.status === 400 && r.body.error === 'bad_stars');
r = await call('PUT', '/api/reviews/plejehjem-1', { stars: 2.5 });
check('and so is half a star', r.status === 400);

r = await call('GET', '/api/reviews/plejehjem-1');
check('the score is readable without an account', r.status === 200 && r.body.count === 1);

const savedCookie = cookie;
cookie = '';
r = await call('GET', '/api/reviews/plejehjem-1');
check('signed out, the reply carries no trace of whose review it is', r.body.mine === null);
r = await call('PUT', '/api/reviews/plejehjem-1', { stars: 5 });
check('and signing out means you cannot rate', r.status === 401);
cookie = savedCookie;

/* ------------------------------------------------------------- moderation -- */
console.log('\nmoderation and the admin panel');

r = await call('GET', '/api/auth/me');
check('an ordinary account is told it is not an administrator', r.body.user.admin === false);
r = await call('GET', '/api/admin/overview');
check('an ordinary account cannot read the admin overview', r.status === 403);
r = await call('GET', '/api/admin/users');
check('nor the user list', r.status === 403);
r = await call('POST', '/api/admin/reviews/1', { decision: 'approve' });
check('nor decide a review', r.status === 403);
r = await call('GET', '/api/admin/places');
check('nor read the full list of what people opened', r.status === 403);

const pending = await db.query("SELECT id FROM reviews WHERE status = 'pending'");
const reviewId = pending.rows[0].id;

process.env.ADMIN_EMAILS = 'chief@example.dk';
r = await call('GET', '/api/admin/overview');
check('naming somebody else as the administrator does not promote this account',
  r.status === 403);

cookie = '';
client = '10.0.0.7';
await call('POST', '/api/auth/signup', { email: 'chief@example.dk', password: 'a-long-enough-pass' });
const chiefLink = lastLink();
r = await call('GET', '/api/admin/overview');
check('a listed administrator who has not confirmed their address is still refused',
  r.status === 403);

await fetch(chiefLink);
await call('POST', '/api/auth/signin', { email: 'chief@example.dk', password: 'a-long-enough-pass' });
r = await call('GET', '/api/admin/overview');
check('a listed, verified administrator gets the overview', r.status === 200);
check('which counts the accounts', r.body.users.total >= 2);
check('and knows one comment is waiting', r.body.reviews.pending === 1);

r = await call('GET', '/api/auth/me');
check('and an administrator is told that it is one', r.body.user.admin === true);

r = await call('GET', '/api/admin/users');
check('the user list is readable', r.status === 200 && r.body.users.length >= 2);
check('and says nothing about passwords',
  !JSON.stringify(r.body).includes('password') && !JSON.stringify(r.body).includes('hash'));

r = await call('GET', '/api/admin/places');
check('the full ranked list is admin-only and readable', r.status === 200 && Array.isArray(r.body.places));

r = await call('GET', '/api/admin/reviews?status=pending');
check('the queue holds the waiting comment',
  r.status === 200 && r.body.reviews.length === 1 && r.body.reviews[0].body === 'Venlig modtagelse.');
r = await call('GET', '/api/admin/reviews?status=nonsense');
check('an invented status is refused rather than guessed at', r.status === 400);

r = await call('POST', `/api/admin/reviews/${reviewId}`, { decision: 'sideways' });
check('an invented decision is refused', r.status === 400);
r = await call('POST', '/api/admin/reviews/not-a-number', { decision: 'approve' });
check('and so is an id that is not one', r.status === 400);

r = await call('POST', `/api/admin/reviews/${reviewId}`, { decision: 'approve' });
check('approving works', r.status === 200);
r = await call('POST', `/api/admin/reviews/${reviewId}`, { decision: 'reject' });
check('and cannot be quietly undone by a second decision', r.status === 409);

cookie = '';
r = await call('GET', '/api/reviews/plejehjem-1');
check('the approved comment is now public', r.body.reviews.length === 1);
check('and carries no author', !JSON.stringify(r.body.reviews[0]).includes('@'));

/* ---------------------------------------------------------------- traffic -- */
console.log('\ncounting');
client = '10.0.0.8';
r = await call('POST', '/api/track', { event: 'view', locale: 'da' });
check('the beacon answers 204 and nothing else', r.status === 204 && r.body === null);
await call('POST', '/api/track', { event: 'view', locale: 'da' });
await call('POST', '/api/track', { event: 'place', id: 'plejehjem-1' });
await call('POST', '/api/track', { event: 'place', id: '../../etc/passwd' });
await call('POST', '/api/track', { event: 'nonsense' });

const views = await db.query("SELECT n FROM counters WHERE metric = 'view'");
check('two views from one visitor are two views', Number(views.rows[0].n) === 2);
const uniques = await db.query('SELECT count(*)::int AS n FROM visitor_days');
check('but one visitor', uniques.rows[0].n === 1);
const places = await db.query("SELECT metric FROM counters WHERE metric LIKE 'place:%'");
check('a place id that is not one is not counted',
  places.rows.length === 1 && places.rows[0].metric === 'place:plejehjem-1');
const cols = await db.query('SELECT * FROM visitor_days');
check('and nothing in the visitor table resembles an address',
  !JSON.stringify(cols.rows).includes('10.0.0.8'));

/* --------------------------------------------------- mail not configured -- */
mail.setTransport(null);
cookie = '';
client = '10.0.0.5';
r = await call('POST', '/api/auth/signup', { email: 'nomail@example.dk', password: 'a-long-enough-pass' });
check('with no mail configured, sign-up refuses rather than stranding an account',
  r.status === 409 && r.body.error === 'mail_unavailable');
check('and refuses in the 4xx range, because the platform eats a 5xx',
  r.status >= 400 && r.status < 500);
const stranded = await db.query("SELECT count(*)::int AS n FROM users WHERE email_key = 'nomail@example.dk'");
check('and creates nothing', stranded.rows[0].n === 0);

server.close();
await db.close();
console.log(`\n${pass}/${pass} accounts API checks pass`);
