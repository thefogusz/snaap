import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {localDatabase} from './postgres.js';
import {migrate} from '../src/data/db.js';
import {buildApp, hash} from '../src/api.js';
import {buildPreset} from '../dist/preset-catalog.js';
import {strategySchema} from '../src/domain/engine.js';

// Isolated fixtures only: no provider calls, notifications or production data.
const postgres = await localDatabase();
const admin = new pg.Pool({connectionString: postgres.url});
const schema = `conversation_performance_${Date.now()}`;
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({connectionString: postgres.url, options: `-c search_path=${schema}`});
const serve = process.argv.includes('--serve');
const origin = 'http://127.0.0.1:4186';
const owner = '00000000-0000-4000-8000-000000000001', other = randomUUID();
const space = randomUUID(), secondSpace = randomUUID(), token = randomUUID(), otherToken = randomUUID();
const conversation = randomUUID(), foreign = randomUUID(), second = randomUUID();
const draft = strategySchema.parse(buildPreset('rebound', {exchange: 'Binance', market: 'Spot', side: 'SPOT', pair: 'BTC/USDT', timeframe: '1h'}));
await migrate(db);
const {app} = await buildApp(db, {local: true, developerPro: true, origin,
  presetInstruments: async () => ({at: Date.now(), items: [{symbol: 'BTC/USDT', supported: true}]}),
  validateMarket: async () => {},
});
if (serve) app.addHook('preHandler', async (req, reply) => {
  if (req.url.startsWith('/api/v1/instruments')) return reply.send({items: [{symbol: 'BTC/USDT', supported: true}]});
  if (req.url === '/api/v1/preview') return reply.code(503).send({message: 'ข้อมูลตลาดไม่ได้เปิดในชุดทดสอบ'});
});
const headers: Record<string, string> = {host: '127.0.0.1:4186', cookie: `snaap_session=${token}`, 'x-snaap-client': 'web', 'x-snaap-workspace': space};
async function get(path: string, expected = 200, auth = headers) {
  const response = await app.inject({url: `/api/v1${path}`, headers: auth});
  assert.equal(response.statusCode, expected, `${path}: ${response.body}`);
  return response;
}
async function cleanup() {
  await app.close(); await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); await postgres.stop();
}
try {
  await db.query('INSERT INTO users(id,email) VALUES($1,$2),($3,$4)', [owner, 'local@snaap.invalid', other, 'other@snaap.invalid']);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')", [hash(token), owner, hash(otherToken), other]);
  await db.query("INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$2,'ทดสอบบทสนทนา',true),($3,$2,'พื้นที่ที่สอง',false)", [space, owner, secondSpace]);
  await db.query("INSERT INTO conversations(id,owner_id,workspace_id,title,draft,draft_revision,setup_saved_at) VALUES($1,$2,$3,'เซ็ตอัพใหม่',$4,3,now()),($5,$6,NULL,'บัญชีอื่น',$4,1,NULL),($7,$2,$8,'พื้นที่ที่สอง',$4,2,NULL)",
    [conversation, owner, space, JSON.stringify({...draft, name: 'แผน BTC ที่บันทึก'}), foreign, other, second, secondSpace]);
  await db.query("INSERT INTO messages(id,conversation_id,role,content) VALUES($1,$2,'user','ช่วยวิเคราะห์ BTC'),($3,$2,'assistant','บทสนทนาทดสอบจากฐานข้อมูลแยก')", [randomUUID(), conversation, randomUUID()]);
  await db.query("INSERT INTO conversations(id,owner_id,workspace_id,title,draft,created_at) SELECT gen_random_uuid(),$1,$2,'บทสนทนาทดสอบ '||n,$3::jsonb,now()-n*interval '1 minute' FROM generate_series(1,104) n", [owner, space, JSON.stringify(draft)]);
  const legacy = await get('/conversations');
  const summary = await get('/conversations?view=summary');
  const fullRows = legacy.json(), rows = summary.json();
  assert.equal(rows.length, 100);
  assert.ok(rows.every((row: any) => row.workspace_id === space && !('draft' in row) && !('owner_id' in row)));
  assert.deepEqual(rows.map((row: any) => row.id), fullRows.map((row: any) => row.id));
  assert.equal(rows.find((row: any) => row.id === conversation).title, 'แผน BTC ที่บันทึก');
  assert.equal(rows.find((row: any) => row.id === conversation).has_messages, true);
  assert.match(String(summary.headers['server-timing']), /^db;dur=\d/);
  const detail = (await get(`/conversations/${conversation}`)).json();
  assert.equal(detail.draft_revision, 3); assert.equal(detail.draft.name, 'แผน BTC ที่บันทึก');
  assert.equal(detail.title, 'แผน BTC ที่บันทึก');
  assert.ok(fullRows.every((row: any) => 'draft' in row), 'legacy list remains compatible');
  await get(`/conversations/${foreign}`, 404);
  await get(`/conversations/${second}`, 404);
  await get(`/conversations/${randomUUID()}`, 404);
  await get('/conversations/not-a-uuid', 400);
  await get('/conversations?view=unknown', 400);
  await get(`/conversations/${conversation}`, 404, {...headers, cookie: `snaap_session=${otherToken}`, 'x-snaap-workspace': ''});
  await get(`/conversations/${conversation}`, 401, {...headers, cookie: ''});
  const otherRows = (await get('/conversations?view=summary', 200, {...headers, cookie: `snaap_session=${otherToken}`, 'x-snaap-workspace': ''})).json();
  assert.deepEqual(otherRows.map((row: any) => row.id), [foreign]);
  const secondRows = (await get('/conversations?view=summary', 200, {...headers, 'x-snaap-workspace': secondSpace})).json();
  assert.deepEqual(secondRows.map((row: any) => row.id), [second]);
  const allRows = (await get('/conversations?view=summary', 200, {...headers, 'x-snaap-workspace': ''})).json();
  assert.ok(allRows.every((row: any) => row.id !== foreign));
  console.log(JSON.stringify({check: 'PASS', rows: rows.length, legacyBytes: Buffer.byteLength(legacy.body), summaryBytes: Buffer.byteLength(summary.body), isolation: 'owner/workspace/unauthenticated', fixture: true}));
  if (serve) {
    await app.listen({host: '127.0.0.1', port: 4186});
    console.log(`Conversation fixture ${origin} · checkout ${process.cwd()}`);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void cleanup().then(() => process.exit(0)));
  } else await cleanup();
} catch (error) { await cleanup(); throw error; }
