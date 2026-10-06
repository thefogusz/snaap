import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { applyBillingEvent } from "../src/billing.js";

const postgres = await localDatabase();
const schema = `admin_test_${randomUUID().replaceAll("-", "")}`;
const root = new pg.Pool({ connectionString: postgres.url });
await root.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({
  connectionString: postgres.url,
  options: `-c search_path=${schema},public`,
});
let app: Awaited<ReturnType<typeof buildApp>>["app"] | undefined;
const serving = process.argv.includes("--serve");
const origin = serving ? "http://127.0.0.1:4175" : "http://127.0.0.1:4173";
try {
  await migrate(db);
  const admin = randomUUID(),
    user = randomUUID(),
    token = randomUUID(),
    userToken = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,role,google_sub) VALUES($1,'kirdssadee@gmail.com','user','integration-google-sub'),($2,'user@test.invalid','user',NULL)",
    [admin, user],
  );
  await db.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",
    [hash(token), admin, hash(userToken), user],
  );
  ({ app } = await buildApp(db, {
    origin,
    local: true,
    monitoring: true,
    validateMarket: async () => {},
  }));
  let apiBroken = true;
  app.get("/api/v1/admin/test-failure", async () => {
    if (apiBroken) throw new Error("private-provider-token");
    return { ok: true };
  });
  if (serving) {
    // Fixture-only entry route on the loopback preview; never registered in production.
    app.get('/__fixture_admin', async (_req, reply) => {
      reply.setCookie('snaap_session', token, {path:'/',httpOnly:true,sameSite:'lax'});
      return reply.redirect('/admin');
    });
  }
  const headers = {
    host: new URL(origin).host,
    "x-snaap-client": "web",
    cookie: `snaap_session=${token}`,
  };
  assert.equal(
    (await app.inject({ url: "/admin/login", headers: { host: headers.host } }))
      .statusCode,
    200,
  );
  for (const url of [
    "/admin",
    "/admin/",
    "/admin.html",
    "/%61dmin.html",
    "/ADMIN.HTML",
  ]) {
    const anon: { headers: Record<string, unknown> } = await app.inject({
      url,
      headers: { host: headers.host },
    });
    assert.equal(anon.headers.location, "/admin/login", url);
    const denied: { headers: Record<string, unknown> } = await app.inject({
      url,
      headers: { ...headers, cookie: `snaap_session=${userToken}` },
    });
    assert.equal(
      denied.headers.location,
      "/admin/login?error=admin_denied",
      url,
    );
  }
  const adminPage = await app.inject({ url: "/admin", headers });
  assert.equal(adminPage.statusCode, 200);
  assert.ok(adminPage.body.includes("Admin Dashboard"));
  assert.ok(adminPage.headers["content-security-policy"]);
  assert.equal(
    (await app.inject({ url: "/admin.html", headers })).headers.location,
    "/admin",
  );
  await db.query(
    "UPDATE users SET role='admin',google_sub='other-google-sub' WHERE id=$1",
    [user],
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/admin/overview",
        headers: { ...headers, cookie: `snaap_session=${userToken}` },
      })
    ).statusCode,
    403,
    "a legacy admin role cannot widen the allowlist",
  );
  await db.query("UPDATE users SET role='user',google_sub=NULL WHERE id=$1", [
    user,
  ]);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/admin/users/${user}/plan`,
        headers,
        payload: { role: "admin" },
      })
    ).statusCode,
    409,
  );
  const localLogin = await app.inject({
    method: "POST",
    url: "/api/v1/auth/local",
    headers,
    payload: {},
  });
  const localCookie = localLogin.cookies.find(
    (c) => c.name === "snaap_session",
  )!;
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/admin/overview",
        headers: { ...headers, cookie: `snaap_session=${localCookie.value}` },
      })
    ).statusCode,
    403,
    "local login cannot bypass admin email policy",
  );
  for (const url of ["overview", "diagnostics", "activity", "users"]) {
    const res: { statusCode: number; body: string } = await app.inject({
      url: `/api/v1/admin/${url}`,
      headers,
    });
    assert.equal(res.statusCode, 200, `${url}: ${res.body}`);
    assert.equal(
      (
        await app.inject({
          url: `/api/v1/admin/${url}`,
          headers: { ...headers, cookie: `snaap_session=${userToken}` },
        })
      ).statusCode,
      403,
    );
  }
  const cleared = await app.inject({
    method: "POST",
    url: "/api/v1/admin/logs/clear",
    headers,
    payload: {},
  });
  assert.equal(cleared.statusCode, 200);
  for (const path of [
    "logs/clear",
    `users/${user}/plan`,
    `users/${user}/reset-quota`,
    `users/${user}/impersonate`,
    "activity/read-all",
  ]) {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/admin/${path}`,
          headers: { ...headers, cookie: `snaap_session=${userToken}` },
          payload: {},
        })
      ).statusCode,
      403,
    );
  }
  // Counts must describe the whole day, even when the feed is paginated.
  await db.query(
    "INSERT INTO users(id,email) SELECT gen_random_uuid(),'signup-'||n||'@test.invalid' FROM generate_series(1,65) n",
  );
  const first = (
    await app.inject({
      url: "/api/v1/admin/activity?limit=10&category=signup",
      headers,
    })
  ).json();
  assert.equal(first.summary.todaySignups, 67);
  assert.equal(first.events.length, 10);
  assert.ok(first.nextCursor);
  const cursorEvent = first.events.at(-1).id;
  const originalTime = (
    await db.query(
      "SELECT updated_at::text AS time FROM admin_events WHERE id=$1",
      [cursorEvent],
    )
  ).rows[0].time;
  await db.query(
    "UPDATE admin_events SET updated_at=now()+interval '1 minute' WHERE id=$1",
    [cursorEvent],
  );
  const second = (
    await app.inject({
      url: `/api/v1/admin/activity?limit=10&category=signup&before=${first.nextCursor}`,
      headers,
    })
  ).json();
  assert.ok(
    second.events.every(
      (e: any) => !first.events.some((f: any) => e.id === f.id),
    ),
  );
  await db.query("UPDATE admin_events SET updated_at=$2 WHERE id=$1", [
    cursorEvent,
    originalTime,
  ]);
  const rule = randomUUID();
  await db.query(
    "INSERT INTO rules(id,owner_id,active,spec) VALUES($1,$2,true,$3)",
    [
      rule,
      user,
      JSON.stringify({
        schemaVersion: 2,
        name: "<img src=x onerror=alert(1)>",
        exchange: ["Binance"],
        market: "Spot",
        pairs: ["BTC/USDT"],
        timeframe: "15m",
        entry: {
          kind: "COMPARE",
          op: ">",
          left: { kind: "PRICE", field: "close", timeframe: "15m" },
          right: { kind: "CONSTANT", value: 100 },
        },
        stages: [],
        cooldownBars: 0,
        destinations: [],
      }),
    ],
  );
  await db.query(
    "INSERT INTO monitor_status VALUES($1,'Binance','BTC/USDT','READY',now())",
    [rule],
  );
  let market = (
    await app.inject({ url: "/api/v1/admin/activity?category=market", headers })
  ).json();
  assert.equal(market.events.length, 0, "READY is not an incident");
  await db.query(
    "UPDATE monitor_status SET status='DATA_UNAVAILABLE' WHERE rule_id=$1",
    [rule],
  );
  market = (
    await app.inject({ url: "/api/v1/admin/activity?category=market", headers })
  ).json();
  assert.equal(market.events.length, 1);
  assert.equal(market.events[0].status, "open");
  const event = market.events[0];
  await app.inject({
    method: "POST",
    url: `/api/v1/admin/activity/${event.id}/acknowledge`,
    headers,
    payload: {},
  });
  await db.query(
    "UPDATE monitor_status SET checked_at=now() WHERE rule_id=$1",
    [rule],
  );
  market = (
    await app.inject({ url: "/api/v1/admin/activity?category=market", headers })
  ).json();
  assert.equal(
    market.events[0].occurrences,
    1,
    "same status does not spam events",
  );
  assert.equal(market.events[0].unread, false);
  await db.query("UPDATE monitor_status SET status='READY' WHERE rule_id=$1", [
    rule,
  ]);
  market = (
    await app.inject({ url: "/api/v1/admin/activity?category=market", headers })
  ).json();
  assert.equal(market.events[0].id, event.id);
  assert.equal(market.events[0].status, "resolved");
  assert.equal(market.events[0].unread, true, "recovery is new information");
  await db.query(
    "INSERT INTO service_heartbeats VALUES('monitor',now()) ON CONFLICT(service) DO UPDATE SET checked_at=now()",
  );
  const health = (
    await app.inject({ url: "/api/v1/admin/activity", headers })
  ).json();
  assert.equal(
    health.events.find((e: any) => e.event_key === "service:monitor")?.status,
    "resolved",
  );
  const usage = randomUUID();
  await db.query(
    "INSERT INTO usage_ledger(id,owner_id,mode,status,input_tokens,estimated_usd) VALUES($1,$2,'standard','COMPLETED',1234,0.08)",
    [usage, user],
  );
  const reset = (
    await app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${user}/reset-quota`,
      headers,
      payload: {},
    })
  ).json();
  assert.equal(reset.resetRecords, 1);
  const retained = (
    await db.query("SELECT * FROM usage_ledger WHERE id=$1", [usage])
  ).rows[0];
  assert.equal(retained.input_tokens, 1234);
  assert.equal(retained.status, "COMPLETED");
  assert.equal(retained.quota_waived, true);
  const quotaOverview = (
    await app.inject({ url: "/api/v1/admin/overview", headers })
  ).json();
  assert.equal(
    quotaOverview.kpis.aiCallsMonth.standard,
    1,
    "quota reset does not erase monthly call history",
  );
  assert.equal(quotaOverview.kpis.aiCallsMonth.estimatedUsd, 0.08);
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/me",
        headers: { ...headers, cookie: `snaap_session=${userToken}` },
      })
    ).json().usage.length,
    0,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/admin/users/${admin}/plan`,
        headers,
        payload: { role: "user" },
      })
    ).statusCode,
    409,
  );
  const upgrade = await app.inject({
    method: "POST",
    url: `/api/v1/admin/users/${user}/plan`,
    headers,
    payload: { plan: "pro_30d" },
  });
  assert.equal(upgrade.statusCode, 200);
  assert.ok(
    (
      await db.query(
        "SELECT pro_until FROM manual_entitlements WHERE owner_id=$1",
        [user],
      )
    ).rows[0].pro_until,
  );
  const manualExpiry = (
    await db.query(
      "SELECT pro_until FROM manual_entitlements WHERE owner_id=$1",
      [user],
    )
  ).rows[0].pro_until;
  const payment = `pi_admin_${randomUUID()}`;
  await db.query(
    "INSERT INTO billing_grants(payment_id,owner_id,amount,kind,starts_at,ends_at) VALUES($1,$2,19900,'promptpay',now(),now()+interval '30 days')",
    [payment, user],
  );
  await applyBillingEvent(db, {
    id: `evt_${randomUUID()}`,
    type: "charge.refunded",
    data: {
      object: {
        payment_intent: payment,
        refunded: true,
        amount_refunded: 19900,
      },
    },
  });
  assert.equal(
    (
      await db.query("SELECT pro_until FROM entitlements WHERE owner_id=$1", [
        user,
      ])
    ).rows[0].pro_until.getTime(),
    manualExpiry.getTime(),
    "Stripe refund preserves an independent manual grant",
  );
  assert.ok(
    (await app.inject({ url: "/api/v1/admin/audit", headers }))
      .json()
      .entries.some(
        (e: any) =>
          e.action === "quota.reset" &&
          e.actor_id === admin &&
          e.subject_id === user,
      ),
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/admin/test-failure?secret=do-not-log",
        headers,
      })
    ).statusCode,
    500,
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/admin/test-failure", headers }))
      .statusCode,
    500,
  );
  const incident = (
    await app.inject({ url: "/api/v1/admin/activity?category=system", headers })
  )
    .json()
    .events.find((e: any) => e.event_key.startsWith("api:"));
  assert.equal(incident.occurrences, 2);
  assert.equal(incident.status, "open");
  assert.ok(!JSON.stringify(incident).includes("do-not-log"));
  assert.ok(
    !JSON.stringify(
      (await app.inject({ url: "/api/v1/admin/logs", headers })).json(),
    ).includes("private-provider-token"),
  );
  apiBroken = false;
  await app.inject({ url: "/api/v1/admin/test-failure", headers });
  assert.equal(
    (
      await db.query("SELECT status FROM admin_events WHERE id=$1", [
        incident.id,
      ])
    ).rows[0].status,
    "resolved",
  );
  const conversation = randomUUID(),
    run = randomUUID();
  await db.query(
    "INSERT INTO conversations(id,owner_id,title) VALUES($1,$2,'test')",
    [conversation, user],
  );
  await db.query(
    "INSERT INTO agent_runs(id,owner_id,conversation_id,status) VALUES($1,$2,$3,'RUNNING')",
    [run, user, conversation],
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/admin/users/${user}/reset-quota`,
        headers,
        payload: {},
      })
    ).statusCode,
    409,
  );
  await db.query("UPDATE agent_runs SET status='FAILED' WHERE id=$1", [run]);
  assert.equal(
    (
      await db.query("SELECT status FROM admin_events WHERE event_key=$1", [
        `ai:${user}`,
      ])
    ).rows[0].status,
    "open",
  );
  const recoveredRun = randomUUID();
  await db.query(
    "INSERT INTO agent_runs(id,owner_id,conversation_id,status) VALUES($1,$2,$3,'COMPLETED')",
    [recoveredRun, user, conversation],
  );
  assert.equal(
    (
      await db.query("SELECT status FROM admin_events WHERE event_key=$1", [
        `ai:${user}`,
      ])
    ).rows[0].status,
    "resolved",
  );
  const destination = randomUUID(),
    signal = randomUUID(),
    delivery = randomUUID();
  await db.query(
    "INSERT INTO destinations(id,owner_id,kind,name,config) VALUES($1,$2,'telegram',$3,'{}')",
    [destination, user, "<img src=x onerror=alert(1)>"],
  );
  await db.query(
    "INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup) VALUES($1,$2,$3,1,'Binance','BTC/USDT','{}',$4)",
    [signal, user, rule, randomUUID()],
  );
  await db.query(
    "INSERT INTO deliveries(id,signal_id,destination_id,status) VALUES($1,$2,$3,'RETRY')",
    [delivery, signal, destination],
  );
  assert.equal(
    (
      await db.query("SELECT status FROM admin_events WHERE event_key=$1", [
        `delivery:${delivery}`,
      ])
    ).rows[0].status,
    "open",
  );
  await db.query("UPDATE deliveries SET status='DELIVERED' WHERE id=$1", [
    delivery,
  ]);
  assert.equal(
    (
      await db.query("SELECT status FROM admin_events WHERE event_key=$1", [
        `delivery:${delivery}`,
      ])
    ).rows[0].status,
    "resolved",
  );
  assert.equal(
    (
      await app.inject({ url: "/api/v1/admin/users?search=signup-65", headers })
    ).json().users.length,
    1,
  );
  const imp: { statusCode: number; headers: any; json: () => any } =
    await app.inject({
      method: "POST",
      url: `/api/v1/admin/users/${user}/impersonate`,
      headers,
      payload: {},
    });
  assert.equal(imp.statusCode, 200);
  const impCookie = imp.headers["set-cookie"].split(";")[0];
  const impHeaders = { ...headers, cookie: impCookie };
  assert.equal(
    (await app.inject({ url: "/api/v1/me", headers: impHeaders })).json()
      .impersonating,
    true,
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/admin/overview", headers: impHeaders }))
      .statusCode,
    403,
  );
  const restore = await app.inject({
    method: "POST",
    url: "/api/v1/impersonation/restore",
    headers: impHeaders,
    payload: {},
  });
  assert.equal(restore.statusCode, 200);
  assert.equal(
    (await app.inject({ url: "/api/v1/me", headers: impHeaders })).statusCode,
    401,
    "impersonation cookie revoked",
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/admin/overview",
        headers: {
          ...headers,
          cookie: (restore.headers["set-cookie"] as string).split(";")[0],
        },
      })
    ).statusCode,
    200,
  );
  await db.query(
    "UPDATE monitor_status SET status='DATA_UNAVAILABLE' WHERE rule_id=$1",
    [rule],
  );
  await db.query("UPDATE rules SET active=false WHERE id=$1", [rule]);
  assert.equal(
    (await db.query("SELECT status FROM admin_events WHERE id=$1", [event.id]))
      .rows[0].status,
    "resolved",
    "paused setups stop firing incidents",
  );
  const readTime = (
    await app.inject({ url: "/api/v1/admin/activity", headers })
  ).json().checkedAt;
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/activity/read-all",
        headers,
        payload: { through: readTime },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({ url: "/api/v1/admin/activity?state=unread", headers })
    ).json().events.length,
    0,
  );
  await db.query("INSERT INTO users(id,email) VALUES($1,'late@test.invalid')", [
    randomUUID(),
  ]);
  assert.equal(
    (
      await app.inject({ url: "/api/v1/admin/activity?state=unread", headers })
    ).json().events.length,
    1,
    "new events after read-all stay unread",
  );
  // Repeated migration and rebuilding the app preserve event/receipt history.
  await migrate(db);
  const preserved = (
    await app.inject({ url: "/api/v1/admin/activity?category=market", headers })
  ).json();
  assert.equal(preserved.events[0].id, event.id);
  console.log(
    "Admin SQL and access checks passed on isolated PostgreSQL schema",
  );
  if (serving) {
    await db.query("UPDATE rules SET active=true WHERE id=$1", [rule]);
    await db.query(
      "UPDATE rules SET spec=jsonb_set(spec,'{name}','\"BTC Trend · 15 นาที\"') WHERE id=$1",
      [rule],
    );
    await db.query(
      "UPDATE monitor_status SET status='READY' WHERE rule_id=$1",
      [rule],
    );
    await db.query(
      "UPDATE monitor_status SET status='DATA_UNAVAILABLE' WHERE rule_id=$1",
      [rule],
    );
    await db.query("UPDATE destinations SET name='ทีมปฏิบัติการ' WHERE id=$1", [
      destination,
    ]);
    await db.query(
      "UPDATE admin_events SET detail=replace(detail,'<img src=x onerror=alert(1)>','ทีมปฏิบัติการ') WHERE category='delivery'",
    );
    await app.listen({ host: "127.0.0.1", port: 4175 });
    console.log(`Isolated admin entry preview: ${origin}/admin`);
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await app?.close();
  await db.end();
  await root.query(`DROP SCHEMA ${schema} CASCADE`);
  await root.end();
  await postgres.stop();
}
