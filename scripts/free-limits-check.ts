import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { monitorQuotaBlocked, usagePolicySchema } from '../src/usage-policy.js';
import { reserveLine } from '../src/line-quota.js';
import { transaction } from '../src/data/db.js';
import { deliver } from '../src/destinations.js';
import { accessBlocked } from '../src/access-controls.js';
import { evaluateTarget } from '../src/monitor.js';
const postgres = await localDatabase();
const admin = new pg.Pool({ connectionString: postgres.url });
const schema = "free_limits_" + randomUUID().replaceAll("-", "");
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({
  connectionString: postgres.url,
  options: `-c search_path=${schema}`,
});
let app: Awaited<ReturnType<typeof buildApp>>["app"] | undefined;
try {
  await migrate(db);
  const built = await buildApp(db, {
      local: true,
      monitoring: true,
      validateMarket: async () => {},
    });
  app = built.app;
  const owner = randomUUID(),
    token = randomUUID();
  await db.query("INSERT INTO users(id,email) VALUES($1,$2)", [
    owner,
    "free@test.invalid",
  ]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(token),
    owner,
  ]);
  const headers = {
    host: "127.0.0.1:4173",
    cookie: "snaap_session=" + token,
    "x-snaap-client": "web",
  };
  const me = await app.inject({ url: "/api/v1/me", headers });
  assert.equal(me.json().limits.activeRules, null);
  assert.equal(me.json().requiresRuleSelection, false);
  const workspaceCreated = await app.inject({method:'POST',url:'/api/v1/workspaces',headers,payload:{name:'Trial workspace'}});
  assert.equal(workspaceCreated.statusCode,201,workspaceCreated.body);
  await app.inject({url:'/api/v1/workspaces',headers});
  const workspaceRace = await Promise.all(Array.from({length:5},()=>app!.inject({method:'POST',url:'/api/v1/workspaces',headers,payload:{name:'Additional'}})));
  assert.equal(workspaceRace.filter(r=>r.statusCode===201).length,1);
  assert.equal(workspaceRace.filter(r=>r.statusCode===409&&r.json().error.code==='WORKSPACE_LIMIT').length,4);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM workspaces WHERE owner_id=$1',[owner])).rows[0].n,3);
  const spec = {
    schemaVersion: 2,
    name: "Free limit",
    exchange: ["Binance"],
    market: "Spot",
    pairs: Array.from({ length: 10 }, (_, i) => `PAIR${i}/USDT`),
    timeframe: "5m",
    entry: {
      kind: "COMPARE",
      op: ">",
      left: { kind: "PRICE", field: "close", timeframe: "5m" },
      right: { kind: "CONSTANT", value: 100 },
    },
    stages: [],
    cooldownBars: 0,
    destinations: [],
  };
  const invalid = await app.inject({
    method: "POST",
    url: "/api/v1/rules",
    headers,
    payload: { ...spec, pairs: [...spec.pairs, "ELEVENTH/USDT"] },
  });
  assert.equal(invalid.statusCode, 400, invalid.body);
  const ids: string[] = [];
  for (let i = 0; i < 21; i++) {
    const created: { statusCode: number; body: string; json: () => any } =
      await app.inject({
        method: "POST",
        url: "/api/v1/rules",
        headers,
        payload: { ...spec, name: `Free ${i}` },
      });
    assert.equal(created.statusCode, 201, created.body);
    ids.push(created.json().id);
    const activated: { statusCode: number; body: string; json: () => any } =
      await app.inject({
        method: "POST",
        url: `/api/v1/rules/${ids[i]}/activation`,
        headers,
        payload: {
          active: true,
          expectedRevision: 1,
          confirmation: "ACTIVATE",
        },
      });
    assert.equal(activated.statusCode, 200, activated.body);

  }
  const active = await db.query(
    "SELECT count(*) AS n FROM rules WHERE owner_id=$1 AND active",
    [owner],
  );
  assert.equal(Number(active.rows[0].n), 21);
  const secondOwner = randomUUID(),
    secondToken = randomUUID(),
    workspace = randomUUID();
  await db.query("INSERT INTO users(id) VALUES($1)", [secondOwner]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(secondToken),
    secondOwner,
  ]);
  await db.query(
    "INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,'Other workspace')",
    [workspace, secondOwner],
  );
  const parallelIds = Array.from({ length: 21 }, () => randomUUID());
  await db.query(
    "INSERT INTO rules(id,owner_id,spec,workspace_id) SELECT unnest($1::uuid[]),$2,$3,$4",
    [parallelIds, secondOwner, spec, workspace],
  );
  const parallel = await Promise.all(
    parallelIds.map((id) =>
      app!.inject({
        method: "POST",
        url: `/api/v1/rules/${id}/activation`,
        headers: { ...headers, cookie: "snaap_session=" + secondToken },
        payload: {
          active: true,
          expectedRevision: 1,
          confirmation: "ACTIVATE",
        },
      }),
    ),
  );
  assert.equal(
    parallel.filter((result) => result.statusCode === 200).length,
    21,
  );
  assert.equal(
    parallel.filter(
      (result) =>
        result.statusCode === 409 && result.json().error.code === "RULE_LIMIT",
    ).length,
    0,
  );
  // The real admin API controls both independent plan profiles and the unified profile.
  await db.query("UPDATE users SET email='kirdssadee@gmail.com',google_sub='verified-fixture' WHERE id=$1",[owner]);
  const policy = usagePolicySchema.parse({});
  const getPolicy = () => app!.inject({url:'/api/v1/admin/usage-policy',headers});
  assert.equal((await getPolicy()).json().mode,'unified');
  const outsider={...headers,cookie:'snaap_session='+secondToken};
  assert.equal((await app.inject({url:'/api/v1/admin/usage-policy',headers:outsider})).statusCode,403);
  assert.equal((await app.inject({url:`/api/v1/admin/users/${owner}/usage`,headers:outsider})).statusCode,403);
  const savePolicy=(value:any,revision:number,auth=headers)=>app!.inject({method:'POST',url:'/api/v1/admin/usage-policy',headers:auth,payload:{policy:value,expectedRevision:revision}});
  assert.equal((await savePolicy(policy,0,outsider)).statusCode,403);
  assert.equal((await savePolicy({...policy,unified:{...policy.unified,workspaces:0}},0)).statusCode,400);
  policy.mode='plans';policy.free.activeRules=1;policy.pro.activeRules=30;policy.free.standard=2;policy.pro.standard=200;
  assert.equal((await savePolicy(policy,0)).statusCode,200);
  assert.equal((await app.inject({url:'/api/v1/me',headers})).json().limits.standard,2);
  assert.equal(await monitorQuotaBlocked(db,owner),true);
  await db.query("INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '1 day')",[owner]);
  assert.equal((await app.inject({url:'/api/v1/me',headers})).json().limits.standard,200);
  assert.equal(await monitorQuotaBlocked(db,owner),false);
  policy.mode='unified';policy.unified.standard=7;
  const competing=await Promise.all([savePolicy(policy,1),savePolicy(policy,1)]);
  assert.deepEqual(competing.map(r=>r.statusCode).sort(),[200,409]);
  assert.equal((await app.inject({url:'/api/v1/me',headers})).json().limits.standard,7,'unified uses its own values even for Pro');
  assert.equal(await monitorQuotaBlocked(db,owner),false);
  assert.equal((await app.inject({url:'/api/v1/rules',headers})).json().every((r:any)=>r.quota_blocked===false),true);
  assert.equal(await transaction(db,c=>reserveLine(c,owner,randomUUID())),true,'unified LINE has no quota');
  const sig=randomUUID(),expired=randomUUID(),dest=randomUUID();
  await db.query("INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup) VALUES($1::uuid,$3,$4,1,'Binance','BTC/USDT','{\"kind\":\"ENTRY\"}',$1::uuid::text),($2::uuid,$3,$4,1,'Binance','BTC/USDT','{\"kind\":\"EXPIRED\"}',$2::uuid::text)",[sig,expired,owner,ids[0]]);
  await db.query("INSERT INTO destinations(id,owner_id,kind,name,config,verified) VALUES($1,$2,'TELEGRAM','fixture','{}',true)",[dest,owner]);
  await db.query("INSERT INTO deliveries(id,signal_id,destination_id,status) VALUES($1,$2,$3,'SENT')",[randomUUID(),sig,dest]);
  await db.query("INSERT INTO usage_ledger(id,owner_id,mode,status,input_tokens,output_tokens,estimated_usd,quota_waived) VALUES($1,$3,'standard','COMPLETED',100,50,0.01,true),($2,$3,'standard','REFUNDED',20,0,0.002,false)",[randomUUID(),randomUUID(),owner]);
  const report=(await app.inject({url:`/api/v1/admin/users/${owner}/usage`,headers})).json();
  assert.equal(report.totals.ai_completed,1);assert.equal(report.totals.ai_failed,1);assert.equal(report.totals.input_tokens,120);assert.equal(report.totals.output_tokens,50);
  assert.equal(report.totals.estimated_usd,0.012);assert.equal(report.totals.notifications_sent,1);assert.equal(report.totals.signals,1);assert.equal(report.totals.active_setups,21);assert.equal(report.totals.workspaces,3);
  assert.equal(report.setups.length,20);assert.ok(report.nextCursor);
  const next=(await app.inject({url:`/api/v1/admin/users/${owner}/usage?before=${report.nextCursor}`,headers})).json();
  assert.equal(next.setups.length,1);assert.equal(next.nextCursor,null);
  const matching=[...report.setups,...next.setups].find(r=>r.id===ids[0]);assert.equal(matching.signals,1);assert.equal(matching.notifications_sent,1);
  const listed=(await app.inject({url:'/api/v1/admin/users',headers})).json().users.find((u:any)=>u.id===owner);
  assert.equal(listed.ai_standard_used,1,'waived calls remain tracked');assert.equal(Number(listed.ai_input_tokens),120);
  policy.unified.standard=null;
  assert.equal((await savePolicy(policy,2)).statusCode,200);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM admin_audit WHERE action='usage-policy.update'")).rows[0].n,3);
  policy.unified.notifications=1;
  assert.equal((await savePolicy(policy,3)).statusCode,200);
  const pendingSignal=randomUUID(),pendingDelivery=randomUUID();
  await db.query("INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup) VALUES($1::uuid,$2,$3,1,'Binance','BTC/USDT','{\"kind\":\"ENTRY\"}',$1::uuid::text)",[pendingSignal,owner,ids[0]]);
  await db.query("INSERT INTO deliveries(id,signal_id,destination_id,status) VALUES($1,$2,$3,'PENDING')",[pendingDelivery,pendingSignal,dest]);
  await deliver(db,pendingDelivery);
  const pending=(await db.query('SELECT status,attempts,usage_retry_at FROM deliveries WHERE id=$1',[pendingDelivery])).rows[0];
  assert.equal(pending.status,'USAGE_LIMIT');assert.equal(pending.attempts,0,'quota rejection makes no provider attempt');
  assert.ok(pending.usage_retry_at > new Date(),'blocked deliveries back off instead of occupying every scan');
  const waiting=(await app.inject({url:`/api/v1/admin/users/${owner}/usage`,headers})).json();
  assert.equal(waiting.totals.notifications_sent,1);assert.equal(waiting.totals.notifications_pending,1);
  policy.unified.notifications=null;
  assert.equal((await savePolicy(policy,4)).statusCode,200);
  assert.equal((await db.query('SELECT usage_retry_at FROM deliveries WHERE id=$1',[pendingDelivery])).rows[0].usage_retry_at,null,'admin changes immediately release blocked deliveries for rechecking');
  // Abuse controls apply independently of FREE/PRO and unified quotas.
  const restricted=randomUUID(),restrictedToken=randomUUID(),restrictedRule=randomUUID(),restrictedSignal=randomUUID(),restrictedDest=randomUUID(),restrictedDelivery=randomUUID();
  await db.query('INSERT INTO users(id,email) VALUES($1,$2)',[restricted,'restricted@test.invalid']);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",[hash(restrictedToken),restricted]);
  const restrictedAuth={...headers,cookie:'snaap_session='+restrictedToken};
  const endpoint=`/api/v1/admin/users/${restricted}/restriction`;
  const restrict=(scope:string,revision:number,auth=headers,reason='Repeated automated requests')=>app!.inject({method:'POST',url:endpoint,headers:auth,payload:{scope,durationMinutes:60,reason,expectedRevision:revision}});
  assert.equal((await app.inject({url:endpoint,headers:outsider})).statusCode,403);
  assert.equal((await restrict('all',0,outsider)).statusCode,403);
  assert.equal((await restrict('invalid',0)).statusCode,400);
  assert.equal((await restrict('ai',0,headers,'')).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:`/api/v1/admin/users/${owner}/restriction`,headers,payload:{scope:'all',durationMinutes:null,reason:'Do not lock out admin',expectedRevision:0}})).statusCode,409);
  assert.equal((await restrict('ai',0)).statusCode,200);
  assert.equal((await app.inject({url:'/api/v1/me',headers:restrictedAuth})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:`/api/v1/conversations/${randomUUID()}/turns`,headers:restrictedAuth,payload:{}})).json().error.code,'ACCOUNT_RESTRICTED');
  assert.equal(await accessBlocked(db,restricted,'automation'),null,'AI-only suspension does not suspend monitoring');
  assert.equal((await restrict('all',0)).statusCode,409,'stale admin writes cannot replace restrictions');
  await db.query("UPDATE user_restrictions SET until_at=now()-interval '1 second' WHERE owner_id=$1",[restricted]);
  assert.equal(await accessBlocked(db,restricted,'ai'),null,'expiry restores access without deleting history');
  await db.query("INSERT INTO rules(id,owner_id,revision,spec,active,activated_at) VALUES($1,$2,1,$3,true,now())",[restrictedRule,restricted,spec]);
  assert.equal((await restrict('automation',1)).statusCode,200);
  let fetches=0;
  await evaluateTarget(db,{ruleId:restrictedRule,revision:1,exchange:'Binance',pair:'PAIR0/USDT'},async()=>{fetches++;return {};});
  assert.equal(fetches,0,'suspended monitoring performs no market fetch');
  assert.equal((await db.query('SELECT status FROM monitor_status WHERE rule_id=$1',[restrictedRule])).rows[0].status,'ADMIN_PAUSED');
  assert.equal((await restrict('notifications',2)).statusCode,200);
  await db.query("INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup) VALUES($1::uuid,$2,$3,1,'Binance','PAIR0/USDT','{\"kind\":\"ENTRY\"}',$1::uuid::text)",[restrictedSignal,restricted,restrictedRule]);
  await db.query("INSERT INTO destinations(id,owner_id,kind,name,config,verified) VALUES($1,$2,'TELEGRAM','fixture','{}',true)",[restrictedDest,restricted]);
  await db.query("INSERT INTO deliveries(id,signal_id,destination_id,status) VALUES($1,$2,$3,'PENDING')",[restrictedDelivery,restrictedSignal,restrictedDest]);
  await deliver(db,restrictedDelivery);
  const held=(await db.query('SELECT status,attempts FROM deliveries WHERE id=$1',[restrictedDelivery])).rows[0];
  assert.equal(held.status,'ADMIN_PAUSED');assert.equal(held.attempts,0,'suspended delivery makes no provider attempt');
  assert.equal((await restrict('all',3)).statusCode,200);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id=$1',[restricted])).rows[0].n,0);
  assert.equal((await app.inject({url:'/api/v1/me',headers:restrictedAuth})).statusCode,401);
  await assert.rejects(built.session(restricted,{setCookie(){}}),{code:'ACCOUNT_RESTRICTED'},'blocked accounts cannot create new sessions');
  assert.equal((await restrict('none',4)).statusCode,200);
  assert.ok((await db.query('SELECT usage_retry_at FROM deliveries WHERE id=$1',[restrictedDelivery])).rows[0].usage_retry_at,'held delivery remains scheduled for bounded rechecking');
  const freshSession=await built.session(restricted,{setCookie(){}});
  await deliver(db,restrictedDelivery);
  assert.equal((await db.query('SELECT status FROM deliveries WHERE id=$1',[restrictedDelivery])).rows[0].status,'CANCELLED_ADMIN','lifting suspension never sends stale held trading alerts');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM admin_audit WHERE action='user.restriction.update'")).rows[0].n,5);
  policy.services={ai:false,automation:false,notifications:false};
  assert.equal((await savePolicy(policy,5)).statusCode,200);
  assert.equal((await accessBlocked(db,restricted,'ai'))?.code,'SERVICE_PAUSED');
  assert.equal((await accessBlocked(db,restricted,'automation'))?.code,'SERVICE_PAUSED');
  await db.query("UPDATE deliveries SET status='PENDING' WHERE id=$1",[restrictedDelivery]);
  await deliver(db,restrictedDelivery);
  assert.equal((await db.query('SELECT status FROM deliveries WHERE id=$1',[restrictedDelivery])).rows[0].status,'ADMIN_PAUSED');
  assert.equal((await getPolicy()).statusCode,200,'emergency switches never lock out the admin');
  policy.requestsPerMinute=30;
  assert.equal((await savePolicy(policy,6)).statusCode,200);
  const throttled=[];
  for(let i=0;i<35;i++)throttled.push(await app.inject({url:'/api/v1/me',headers:{...headers,cookie:'snaap_session='+freshSession}}));
  assert.ok(throttled.some(r=>r.statusCode===200));
  assert.ok(throttled.some(r=>r.statusCode===429 && r.json().error.code==='RATE_LIMITED'),'admin request-rate setting actually limits bursts');
  console.log('PASS: scoped/expiring suspensions, session revocation, blocked login, worker and delivery guards, admin protection, conflict handling, audit history and global emergency switches');
  console.log('PASS: workspace cap includes primary and concurrent creation; independent FREE/PRO/unified settings, admin-only access, revision conflicts, monitoring and per-user/per-setup accounting');
  console.log(
    "PASS: trial accounts activate 21 setups sequentially and concurrently; technical pair validation remains",
  );
} finally {
  await app?.close();
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
