import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localDatabase } from './postgres.js';
import { database, migrate } from '../src/data/db.js';
import { buildApp, hash } from '../src/api.js';

// Isolated fixtures, no market or notification providers.
const postgres = await localDatabase();
const db = database(postgres.url);
await migrate(db);
const { app } = await buildApp(db);
const owner = randomUUID(), other = randomUUID(), token = randomUUID();
const workspace = randomUUID(), secondWorkspace = randomUUID();
const rule = randomUUID(), secondRule = randomUUID();
try {
  await db.query('INSERT INTO users(id) VALUES($1),($2)', [owner, other]);
  await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [hash(token), owner]);
  await db.query('INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,$3),($4,$2,$5)', [workspace, owner, 'Unread QA', secondWorkspace, 'Other workspace']);
  for (const [id, space] of [[rule, workspace], [secondRule, secondWorkspace]]) {
    await db.query('INSERT INTO rules(id,owner_id,spec,workspace_id) VALUES($1,$2,$3,$4)', [id, owner, {name: 'QA', timeframe: '5m'}, space]);
    await db.query('INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,1,$2)', [id, {name: 'QA', timeframe: '5m'}]);
  }
  const headers = {host: '127.0.0.1:4173', 'x-snaap-client': 'web', 'x-snaap-workspace': workspace, cookie: 'snaap_session=' + token};
  async function add(kind = 'ENTRY', targetRule = rule, targetOwner = owner, time: unknown = Date.now()) {
    const id = randomUUID();
    await db.query('INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup) VALUES($1::uuid,$2,$3,1,$4,$5,$6,$1::text)', [id, targetOwner, targetRule, 'BINANCE', 'BTC/USDT', {kind, time, referencePrice: 100}]);
    return id;
  }
  async function summary(customHeaders = headers) {
    const response = await app.inject({url: '/api/v1/signals/unread', headers: customHeaders});
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  }
  assert.equal((await summary()).count, 0);
  for (let i = 0; i < 105; i++) await add(i % 2 ? 'EXIT' : 'ENTRY');
  await add('EXPIRED');
  await add('ENTRY', rule, owner, 'invalid');
  await add('ENTRY', secondRule);
  const foreign = await add('ENTRY', secondRule, other);
  const snapshot = await summary();
  assert.equal(snapshot.count, 105, 'Count signals beyond the first page, excluding status and invalid rows');
  const newer = await add();
  const read = await app.inject({method: 'POST', url: '/api/v1/signals/read', headers, payload: {through: snapshot.latestId}});
  assert.equal(read.statusCode, 200, read.body);
  assert.deepEqual(await summary(), {count: 1, latestId: newer});
  assert.equal((await summary({...headers, 'x-snaap-workspace': secondWorkspace})).count, 1);
  const otherSnapshot = await summary({...headers, 'x-snaap-workspace': secondWorkspace});
  await app.inject({method: 'POST', url: '/api/v1/signals/read', headers, payload: {through: otherSnapshot.latestId}});
  assert.equal((await summary()).count, 1, 'Cannot acknowledge through another workspace');
  await app.inject({method: 'POST', url: '/api/v1/signals/read', headers, payload: {through: foreign}});
  assert.equal((await summary()).count, 1, 'Cannot acknowledge through another owner');
  await app.inject({method: 'POST', url: '/api/v1/signals/read', headers, payload: {through: newer}});
  assert.equal((await summary()).count, 0);
  await app.inject({method: 'POST', url: '/api/v1/signals/read', headers, payload: {through: snapshot.latestId}});
  assert.equal((await summary()).count, 0, 'Old acknowledgements cannot restore unread');
  console.log('Unread signal API checks passed');
} finally {
  await app.close();
  await db.query('DELETE FROM signals WHERE owner_id=ANY($1::uuid[])', [[owner, other]]);
  await db.query('DELETE FROM rule_revisions WHERE rule_id=ANY($1::uuid[])', [[rule, secondRule]]);
  await db.query('DELETE FROM rules WHERE owner_id=$1', [owner]);
  await db.query('DELETE FROM workspaces WHERE owner_id=$1', [owner]);
  await db.query('DELETE FROM sessions WHERE user_id=$1', [owner]);
  await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[owner, other]]);
  await db.end();
  await postgres.stop();
}
