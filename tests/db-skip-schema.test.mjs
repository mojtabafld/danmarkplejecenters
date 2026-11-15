import assert from 'node:assert/strict';
import * as db from '../server/db.mjs';

let calls = 0;
const injectedPool = {
  async query(sql, params) {
    calls += 1;
    return { rows: [{ sql, params }] };
  },
  async end() {},
};

// Worker deployments bind to a provisioned database. Initializing that
// connection must not execute the app's CREATE/ALTER schema string.
await db.init({ injectedPool, skipSchema: true });
assert.equal(db.isReady(), true);
assert.equal(calls, 0, 'skipSchema must not issue DDL at initialization');

const result = await db.query('SELECT $1::text AS value', ['ok']);
assert.equal(calls, 1);
assert.equal(result.rows[0].params[0], 'ok');

await db.close();
console.log('db skip-schema test passed');
