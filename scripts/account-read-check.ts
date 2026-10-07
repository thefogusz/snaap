import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { localDatabase } from './postgres.js';
import { migrate } from '../src/data/db.js';
import { buildApp, hash } from '../src/api.js';
import { usagePolicySchema } from '../src/usage-policy.js';

const postgres = await localDatabase();
const admin = new pg.Pool({ connectionString: postgres.url });
const schema = 'account_' + randomUUID().replaceAll('-', '');
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({ connectionString: postgres.url, max: 8, options: `-c search_path=${schema}` });
let queries = 0;
db.on('connect', client => {
  const query = client.query.bind(client);
  client.query = ((...args: any[]) => { queries++; return (query as any)(...args); }) as typeof client.query;
});
let app: Awaited<ReturnType<typeof buildApp>>['app'] | undefined;
try {
  await migrate(db);
  app = (await buildApp(db, { local: true })).app;
  await app.ready();
  const owner = randomUUID(), other = randomUUID(), token = randomUUID();
  await db.query('INSERT INTO users(id,email) VALUES($1,$3),($2,$4)', [owner, other, 'account@test.invalid', 'other@test.invalid']);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [hash(token), owner]);
  await db.query("INSERT INTO rules(id,owner_id,spec,active) VALUES($1,$3,'{}',true),($2,$4,'{}',true)", [randomUUID(), randomUUID(), owner, other]);
  await db.query(`INSERT INTO usage_ledger(id,owner_id,mode,status,created_at,quota_waived) VALUES
    (gen_random_uuid(),$1,'standard','COMPLETED',now(),false),
    (gen_random_uuid(),$1,'deep','RESERVED',now(),false),
    (gen_random_uuid(),$1,'standard','FAILED',now(),false),
    (gen_random_uuid(),$1,'standard','COMPLETED',now(),true),
    (gen_random_uuid(),$1,'standard','COMPLETED',date_trunc('month',now())-interval '1 second',false),
    (gen_random_uuid(),$2,'standard','COMPLETED',now(),false)`, [owner, other]);
  const headers = { host: '127.0.0.1:4173', cookie: 'snaap_session=' + token };
  const counts: number[] = [];
  async function me() {
    const before = queries;
    const response = await app!.inject({ url: '/api/v1/me', headers });
    counts.push(queries - before);
    assert.equal(response.statusCode, 200, response.body);
    const body = response.json();
    assert.equal(body.id, owner);
    assert.equal(body.email, 'account@test.invalid');
    assert.equal(body.isAdmin, false);
    assert.equal(body.local, false);
    assert.equal(body.limits.pairsPerSetup, 10);
    assert.deepEqual(body.usage.toSorted((a: any, b: any) => a.mode.localeCompare(b.mode)), [
      { mode: 'deep', count: 1 }, { mode: 'standard', count: 1 },
    ]);
    assert.deepEqual(Object.keys(body).toSorted(), ['id','email','role','google_sub','plan','proUntil','isAdmin','impersonating','requiresRuleSelection','limits','usage','local'].toSorted());
    return body;
  }
  let body = await me();
  assert.equal(body.plan, 'FREE');
  assert.equal(body.proUntil, null);
  assert.equal(body.limits.activeRules, null);
  assert.equal(body.requiresRuleSelection, false);
  assert.equal(body.impersonating, false);
  const defaults = usagePolicySchema.parse({});
  await db.query('UPDATE usage_policy SET policy=$1 WHERE id=1', [{ ...defaults, mode: 'plans', free: { ...defaults.free, activeRules: 0 }, pro: { ...defaults.pro, activeRules: 2 } }]);
  body = await me();
  assert.equal(body.limits.activeRules, 0);
  assert.equal(body.requiresRuleSelection, true);
  await db.query("INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '1 day')", [owner]);
  body = await me();
  assert.equal(body.plan, 'PRO');
  assert.ok(body.proUntil);
  assert.equal(body.limits.activeRules, 2);
  assert.equal(body.requiresRuleSelection, false);
  await db.query('INSERT INTO admin_impersonations(session_hash,actor_id) VALUES($1,$2)', [hash(token), other]);
  assert.equal((await me()).impersonating, true);
  await db.query("UPDATE entitlements SET pro_until=now()-interval '1 second' WHERE owner_id=$1", [owner]);
  body = await me();
  assert.equal(body.plan, 'FREE');
  assert.equal(body.proUntil, null);
  assert.equal(body.limits.activeRules, 0);
  await db.query('DELETE FROM usage_policy');
  assert.equal((await me()).limits.activeRules, null, 'missing policy uses schema defaults');
  const workspace = randomUUID(), foreignWorkspace = randomUUID();
  await db.query('INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,$5),($3,$4,$5)', [workspace, owner, foreignWorkspace, other, 'Fixture']);
  const workspaceQueries = queries;
  const scoped = await app.inject({ url: '/api/v1/me', headers: { ...headers, 'x-snaap-workspace': workspace } });
  assert.equal(scoped.statusCode, 200, scoped.body);
  assert.equal(scoped.json().id, owner);
  assert.ok(queries - workspaceQueries <= 5, 'selected workspace adds one ownership check');
  const foreign = await app.inject({ url: '/api/v1/me', headers: { ...headers, 'x-snaap-workspace': foreignWorkspace } });
  assert.equal(foreign.statusCode, 403);
  assert.equal(foreign.json().error.code, 'WORKSPACE_FORBIDDEN');
  await db.query("INSERT INTO user_restrictions(owner_id,scope) VALUES($1,'all')", [owner]);
  assert.equal((await app.inject({ url: '/api/v1/me', headers })).statusCode, 403);
  await db.query('DELETE FROM user_restrictions');
  await db.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
  assert.equal((await app.inject({ url: '/api/v1/me', headers })).statusCode, 401);
  console.log(JSON.stringify({ accountReadQueries: counts, scenarios: 'owner isolation, billing expiry, quotas, usage exclusions, impersonation, defaults, restrictions and session expiry' }));
  assert.ok(counts.every(count => count <= 4), 'account read must use at most four SQL statements including auth/access/rate-limit hooks');
  console.log('PASS: account behavior and bounded SQL round trips');
} finally {
  await app?.close();
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
