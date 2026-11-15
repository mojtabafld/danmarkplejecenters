import assert from 'node:assert/strict';
import * as db from '../server/db.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { memPool } from './pgmem.mjs';

const clients = [];
class Client {
  constructor({ connectionString }) { this.id = connectionString; this.calls = []; clients.push(this); }
  on() {}
  async connect() { if (this.id === 'offline') throw Object.assign(new Error('secret host'), { code: 'ECONNREFUSED' }); }
  async query(sql) {
    this.calls.push(sql);
    assert.doesNotMatch(sql, /\b(CREATE|ALTER)\b/);
    if (this.id === 'missing') throw Object.assign(new Error('private table'), { code: '42P01' });
    if (this.id === 'denied') throw Object.assign(new Error('private role'), { code: '42501' });
    return { rows: [{ id: this.id }] };
  }
  async end() { this.ended = true; }
}
const opts = { Client };
// Force two overlapping requests to resume after both contexts exist.
let release;
const gate = new Promise(resolve => { release = resolve; });
await Promise.all(['first', 'second'].map(id => db.withRequestDatabase(id, async () => {
  if (id === 'second') release();
  await gate;
  assert.equal(db.isReady(), true);
  assert.equal((await db.query('SELECT 1')).rows[0].id, id);
}, opts)));
for (const [id, reason] of [['missing', 'schema_mismatch'], ['denied', 'permission_denied'], ['offline', 'cannot_reach_database']]) {
  await db.withRequestDatabase(id, async () => {
    assert.deepEqual(db.status(), { database: 'unavailable', reason });
    assert.equal(await db.ensureSchema(), false, 'API recovery must never apply DDL');
  }, opts);
}
await db.withRequestDatabase(null, async () => {
  assert.deepEqual(db.status(), { database: 'not_configured' });
  assert.equal(await db.ensureSchema(), false);
}, opts);
await assert.rejects(db.withRequestDatabase('throw', async () => { throw new Error('handler failed'); }, opts));
assert.ok(clients.every(client => client.ended), 'all clients close even after failures');

// Validate the real schema probe and ratings query against a provisioned database.
const { Pool } = memPool();
const pool = new Pool();
await db.init({ injectedPool: pool });
class ProvisionedClient {
  on() {}
  async connect() {}
  query(sql, params) { return pool.query(sql, params); }
  async end() {}
}
await db.withRequestDatabase('test', async () => {
  assert.equal(db.isReady(), true);
  const { summaries } = await import('../server/reviews.mjs');
  assert.deepEqual(await summaries(), {});
}, { Client: ProvisionedClient });
await db.close();
const response = await onRequest({ request: new Request('https://example.test/api/ratings'), env: {} });
assert.equal(response.status, 409);
assert.deepEqual(await response.json(), { error: 'no_database' });
console.log('Request-local database lifecycle, isolation, schema, and failure tests passed');
