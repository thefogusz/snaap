import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { evaluateTarget } from "../src/monitor.js";
import { applyBillingEvent } from "../src/billing.js";
import { sourceIds } from "../src/context.js";
const postgres = await localDatabase();
let db = database(postgres.url);
await migrate(db);
const { app } = await buildApp(db, {
  local: true,
  monitoring: true,
  validateMarket: async () => {},
});
const headers = { host: "127.0.0.1:4173", "x-snaap-client": "web" };
const owner = randomUUID(),
  other = randomUUID(),
  token = randomUUID(),
  otherToken = randomUUID();
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
  await db.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",
    [hash(token), owner, hash(otherToken), other],
  );
  const auth = { ...headers, cookie: `snaap_session=${token}` },
    outsider = { ...headers, cookie: `snaap_session=${otherToken}` };
  const imageId = randomUUID();
  await db.query(
    "INSERT INTO assets(id,owner_id,name,mime,storage_path,metadata) VALUES($1,$2,$3,$4,$5,$6)",
    [
      imageId,
      owner,
      "lab-image.png",
      "image/png",
      "integration-list-only",
      { width: 1, height: 1 },
    ],
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/images", headers: auth }))
      .json()
      .some((image: { id: string }) => image.id === imageId),
    true,
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/images", headers: outsider })).json()
      .length,
    0,
  );
  assert.equal(
    (await app.inject({ url: `/api/v1/images/${imageId}`, headers: outsider }))
      .statusCode,
    404,
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/images", headers })).statusCode,
    401,
  );
  const spec = {
    schemaVersion: 2,
    name: "เงื่อนไขภาษาไทย",
    exchange: ["Binance", "Bybit"],
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
  };
  assert.equal(
    (await app.inject({ url: "/api/v1/rules", headers })).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/rules",
        headers: { ...auth, origin: "https://hostile.invalid" },
      })
    ).statusCode,
    403,
  );
  const create = await app.inject({
    method: "POST",
    url: "/api/v1/rules",
    headers: auth,
    payload: spec,
  });
  assert.equal(create.statusCode, 201, create.body);
  const rule = create.json();
  assert.equal(
    (await app.inject({ url: "/api/v1/rules", headers: outsider })).json()
      .length,
    0,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/v1/rules/${rule.id}`,
        headers: outsider,
        payload: { expectedRevision: 1, spec },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/v1/rules/${rule.id}`,
        headers: auth,
        payload: { expectedRevision: 1, spec: { ...spec, name: "updated" } },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/v1/rules/${rule.id}`,
        headers: auth,
        payload: { expectedRevision: 1, spec },
      })
    ).statusCode,
    409,
  );
  const revisions = (
    await app.inject({
      url: `/api/v1/rules/${rule.id}/revisions`,
      headers: auth,
    })
  ).json();
  assert.equal(revisions.length, 2);
  assert.equal(revisions[1].spec.name, "เงื่อนไขภาษาไทย");
  const conversation = (
    await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers: auth,
      payload: { title: "ร่างทดสอบการบันทึก" },
    })
  ).json();
  const saveDraft = (who: typeof auth, revision: number) =>
    app.inject({
      method: "PUT",
      url: `/api/v1/conversations/${conversation.id}/draft`,
      headers: who,
      payload: { spec, expectedRevision: revision },
    });
  assert.equal((await saveDraft(outsider, 0)).statusCode, 409);
  assert.equal((await saveDraft(auth, 0)).statusCode, 200);
  assert.equal((await saveDraft(auth, 0)).statusCode, 409);
  assert.equal(
    (
      await app.inject({ url: "/api/v1/conversations", headers: auth })
    ).json()[0].draft.name,
    spec.name,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/rules",
        headers: auth,
        payload: { ...spec, owner_id: other },
      })
    ).statusCode,
    400,
  );
  const activation = {
    active: true,
    expectedRevision: 2,
    confirmation: "ACTIVATE",
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/rules/${rule.id}/activation`,
        headers: outsider,
        payload: activation,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/rules/${rule.id}/activation`,
        headers: auth,
        payload: activation,
      })
    ).statusCode,
    200,
  );
  await db.query("UPDATE rules SET activated_at=to_timestamp(0) WHERE id=$1", [
    rule.id,
  ]);
  const fixture = async () => ({
    "15m": [
      { time: 900000, open: 99, high: 100, low: 98, close: 99, volume: 100 },
      { time: 1800000, open: 99, high: 102, low: 99, close: 101, volume: 200 },
    ],
  });
  const target = {
    ruleId: rule.id,
    revision: 2,
    exchange: "Binance" as const,
    pair: "BTC/USDT",
  };
  await evaluateTarget(db, target, fixture, 1800000);
  await evaluateTarget(db, target, fixture, 1800000);
  // Overview endpoints must expose human-readable context without leaking destinations.
  const monitored = await app.inject({ url: '/api/v1/monitor', headers: auth });
  assert.equal(monitored.statusCode, 200, monitored.body);
  const monitoredRule = monitored.json().find((row: any) => row.rule_id === rule.id);
  assert.ok(monitoredRule.setup_name);
  assert.equal(monitoredRule.setup_market, 'Spot');
  assert.equal(monitoredRule.state.lastTime, 1800000);
  assert.equal(monitoredRule.state.latched, true);
  assert.equal((await app.inject({ url: '/api/v1/monitor', headers: outsider })).json().length, 0);
  const destinationId = randomUUID();
  await db.query('INSERT INTO destinations(id,owner_id,kind,name,config) VALUES($1,$2,$3,$4,$5)',
    [destinationId, owner, 'DISCORD', 'SignalGus', {}]);
  await db.query("INSERT INTO deliveries(id,signal_id,destination_id,status) SELECT $1,id,$2,'SENT' FROM signals WHERE rule_id=$3 LIMIT 1",
    ['0' + randomUUID().slice(1), destinationId, rule.id]);
  const olderSignalId = randomUUID();
  await db.query("INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup,created_at) SELECT $1::uuid,owner_id,rule_id,revision,exchange,'ETH/USDT',event,$1::uuid::text,now()-interval '1 day' FROM signals WHERE rule_id=$2 LIMIT 1",
    [olderSignalId, rule.id]);
  await db.query("INSERT INTO deliveries(id,signal_id,destination_id,status) VALUES($1,$2,$3,'SENT')",
    ['f' + randomUUID().slice(1), olderSignalId, destinationId]);
  const delivered = await app.inject({ url: '/api/v1/deliveries', headers: auth });
  assert.equal(delivered.statusCode, 200, delivered.body);
  const message = delivered.json()[0];
  assert.equal(message.destination_id, destinationId);
  assert.equal(message.pair, 'BTC/USDT');
  assert.equal(message.kind, 'DISCORD');
  assert.equal(message.event.kind, 'ENTRY');
  assert.ok(message.setup_name);
  assert.ok(message.signal_created_at);
  assert.equal(message.config, undefined);
  assert.equal((await app.inject({ url: '/api/v1/deliveries', headers: outsider })).json().length, 0);
  await db.query('DELETE FROM deliveries WHERE destination_id=$1', [destinationId]);
  await db.query('DELETE FROM signals WHERE id=$1', [olderSignalId]);
  await db.query('DELETE FROM destinations WHERE id=$1', [destinationId]);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM signals WHERE rule_id=$1",
        [rule.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/signals", headers: outsider })).json()
      .length,
    0,
  );
  const freeLimit = (
    await app.inject({ url: "/api/v1/me", headers: auth })
  ).json().limits.activeRules;
  assert.equal(freeLimit, 6);
  const alreadyActive = Number(
    (
      await db.query(
        "SELECT count(*) AS n FROM rules WHERE owner_id=$1 AND active",
        [owner],
      )
    ).rows[0].n,
  );
  for (let i = alreadyActive; i <= freeLimit; i++) {
    const next = (
      await app.inject({
        method: "POST",
        url: "/api/v1/rules",
        headers: auth,
        payload: spec,
      })
    ).json();
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/rules/${next.id}/activation`,
          headers: auth,
          payload: { ...activation, expectedRevision: 1 },
        })
      ).statusCode,
      i < freeLimit ? 200 : 409,
    );
  }
  const customer = "cus_" + owner,
    payment = "pi_" + owner,
    paidId = "evt_" + owner;
  await db.query(
    "INSERT INTO entitlements(owner_id,stripe_customer) VALUES($1,$2)",
    [owner, customer],
  );
  const paid = {
    id: paidId,
    type: "checkout.session.async_payment_succeeded",
    data: {
      object: {
        mode: "payment",
        payment_status: "paid",
        amount_total: 19900,
        currency: "thb",
        metadata: { ownerId: owner, snaapPlan: "pro_199" },
        payment_intent: payment,
        customer,
      },
    },
  };
  await applyBillingEvent(db, paid);
  const expiry = (
    await db.query("SELECT pro_until FROM entitlements WHERE owner_id=$1", [
      owner,
    ])
  ).rows[0].pro_until;
  await applyBillingEvent(db, paid);
  await applyBillingEvent(db, { ...paid, id: paidId + "duplicate" });
  assert.equal(
    (
      await db.query("SELECT pro_until FROM entitlements WHERE owner_id=$1", [
        owner,
      ])
    ).rows[0].pro_until.getTime(),
    expiry.getTime(),
  );
  await applyBillingEvent(db, {
    id: paidId + "partial",
    type: "charge.refunded",
    data: {
      object: {
        payment_intent: payment,
        refunded: false,
        amount_refunded: 1000,
      },
    },
  });
  assert.equal(
    (
      await db.query(
        "SELECT refunded FROM billing_grants WHERE payment_id=$1",
        [payment],
      )
    ).rows[0].refunded,
    false,
  );
  await applyBillingEvent(db, {
    id: paidId + "full",
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
        owner,
      ])
    ).rows[0].pro_until,
    null,
  );
  const spaces = (
    await app.inject({ url: "/api/v1/workspaces", headers: auth })
  ).json();
  const spaceA = spaces.find((w: any) => w.is_default).id;
  await db.query(
    "UPDATE entitlements SET pro_until=now()-interval '1 day' WHERE owner_id=$1",
    [owner],
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/workspaces",
        headers: auth,
        payload: { name: "Free blocked" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/v1/workspaces/${spaceA}`,
        headers: auth,
        payload: { name: "พื้นที่ของฉัน" },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/v1/workspaces/${spaceA}`,
        headers: outsider,
        payload: { name: "Wrong owner" },
      })
    ).statusCode,
    404,
  );
  await db.query(
    "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '30 days') ON CONFLICT(owner_id) DO UPDATE SET pro_until=EXCLUDED.pro_until",
    [owner],
  );
  const spaceB = (
    await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: auth,
      payload: { name: "MEXC" },
    })
  ).json().id;
  const a = { ...auth, "x-snaap-workspace": spaceA },
    b = { ...auth, "x-snaap-workspace": spaceB };
  assert.ok(
    (await app.inject({ url: "/api/v1/rules", headers: a }))
      .json()
      .some((r: any) => r.id === rule.id),
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/rules", headers: b })).json().length,
    0,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/rules",
        headers: { ...outsider, "x-snaap-workspace": spaceA },
      })
    ).statusCode,
    403,
  );
  const scopedConversation = await app.inject({
    method: "POST",
    url: "/api/v1/conversations",
    headers: b,
    payload: { title: "MEXC workspace chat" },
  });
  assert.equal(scopedConversation.statusCode, 201, scopedConversation.body);
  assert.equal(scopedConversation.json().workspace_id, spaceB);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/conversations/${scopedConversation.json().id}/turns`,
        headers: a,
        payload: {
          text: "Wrong workspace",
          mode: "standard",
          selection: {},
          imageIds: [],
        },
      })
    ).statusCode,
    404,
  );
  assert.ok(
    (await app.inject({ url: "/api/v1/conversations", headers: b }))
      .json()
      .some((c: any) => c.id === scopedConversation.json().id),
  );
  assert.ok(
    !(await app.inject({ url: "/api/v1/conversations", headers: a }))
      .json()
      .some((c: any) => c.id === scopedConversation.json().id),
  );
  const scopedImport = randomUUID();
  await db.query(
    "INSERT INTO imports(id,owner_id,name,rows,account_scope) VALUES($1,$2,'workspace fixture','[]','workspace-test')",
    [scopedImport, owner],
  );
  for (const [kind, id] of [
    ["image", imageId],
    ["import", scopedImport],
  ]) {
    const set = await app.inject({
      method: "PUT",
      url: `/api/v1/data-scopes/${kind}/${id}`,
      headers: a,
      payload: { workspaceIds: [spaceA] },
    });
    assert.equal(set.statusCode, 200, set.body);
    const list = kind === "image" ? "/images" : "/imports";
    assert.ok(
      (await app.inject({ url: "/api/v1" + list, headers: a }))
        .json()
        .some((r: any) => r.id === id),
    );
    assert.ok(
      !(await app.inject({ url: "/api/v1" + list, headers: b }))
        .json()
        .some((r: any) => r.id === id),
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: `/api/v1/data-scopes/${kind}/${id}`,
          headers: outsider,
          payload: { workspaceIds: null },
        })
      ).statusCode,
      404,
    );
  }
  const emptyContext = (
    await app.inject({
      method: "POST",
      url: "/api/v1/context",
      headers: b,
      payload: {},
    })
  ).json();
  assert.ok(!(await sourceIds(db, owner, spaceB)).has(imageId));
  assert.ok(!(await sourceIds(db, owner, spaceB)).has(scopedImport));
  assert.ok((await sourceIds(db, owner, spaceA)).has(imageId));
  assert.equal(
    (await app.inject({ url: `/api/v1/images/${imageId}`, headers: b }))
      .statusCode,
    404,
  );
  assert.ok(
    !emptyContext.sources.some(
      (s: any) => s.id === scopedImport || s.id === rule.id,
    ),
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/signals", headers: b })).json().length,
    0,
  );
  await app.inject({
    method: "PUT",
    url: `/api/v1/data-scopes/image/${imageId}`,
    headers: a,
    payload: { workspaceIds: null },
  });
  assert.ok(
    (await app.inject({ url: "/api/v1/images", headers: b }))
      .json()
      .some((r: any) => r.id === imageId),
  );
  console.log(
    "PASS: workspace persistence, migration, rules/chat/inbox filtering, source sharing, context filtering and owner isolation",
  );
  console.log(
    "PASS: duplicate payment events, partial then full refund and entitlement rollback",
  );
  const renew = (suffix: string) => ({
    ...paid,
    id: paidId + suffix,
    data: { object: { ...paid.data.object, payment_intent: payment + suffix } },
  });
  await applyBillingEvent(db, renew("renew1"));
  await applyBillingEvent(db, renew("renew2"));
  await applyBillingEvent(db, {
    id: paidId + "refundRenew1",
    type: "charge.refunded",
    data: {
      object: {
        payment_intent: payment + "renew1",
        refunded: true,
        amount_refunded: 19900,
      },
    },
  });
  const remainingDays =
    ((
      await db.query("SELECT pro_until FROM entitlements WHERE owner_id=$1", [
        owner,
      ])
    ).rows[0].pro_until.getTime() -
      Date.now()) /
    86400000;
  assert.ok(
    // PostgreSQL and JS clocks can differ by milliseconds; allow one second.
    remainingDays > 29.99 && remainingDays <= 30 + 1000 / 86400000,
    `Refunded renewal must not retain 60 days: ${remainingDays}`,
  );
  const beforeRace = (
    await db.query("SELECT pro_until FROM entitlements WHERE owner_id=$1", [
      owner,
    ])
  ).rows[0].pro_until.getTime();
  await Promise.all([
    applyBillingEvent(db, renew("race")),
    applyBillingEvent(db, {
      id: paidId + "refundRace",
      type: "charge.refunded",
      data: {
        object: {
          payment_intent: payment + "race",
          refunded: true,
          amount_refunded: 19900,
        },
      },
    }),
  ]);
  await applyBillingEvent(db, {
    id: paidId + "refundBefore",
    type: "charge.refunded",
    data: {
      object: {
        payment_intent: payment + "later",
        refunded: true,
        amount_refunded: 19900,
      },
    },
  });
  await applyBillingEvent(db, renew("later"));
  assert.equal(
    (
      await db.query("SELECT pro_until FROM entitlements WHERE owner_id=$1", [
        owner,
      ])
    ).rows[0].pro_until.getTime(),
    beforeRace,
  );
  console.log(
    "PASS: stacked renewal refund, concurrent payment/refund and refund-before-payment",
  );
  await db.end();
  db = database(postgres.url);
  assert.equal(
    (await db.query("SELECT revision FROM rules WHERE id=$1", [rule.id]))
      .rows[0].revision,
    2,
  );
  console.log(
    "PASS: UTF8 persistence, ownership, CSRF, versions, concurrent edits, quota, durable monitoring and deduplication",
  );
} finally {
  await app.close();
  await db.query('DELETE FROM deliveries WHERE destination_id IN (SELECT id FROM destinations WHERE owner_id=$1)', [owner]);
  await db.query('DELETE FROM destinations WHERE owner_id=$1', [owner]);
  for (const table of [
    "monitor_checkpoints",
    "monitor_status",
    "signals",
    "rule_revisions",
  ])
    await db.query(
      `DELETE FROM ${table} WHERE rule_id IN (SELECT id FROM rules WHERE owner_id=$1)`,
      [owner],
    );
  await db.query("DELETE FROM rules WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM billing_grants WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM billing_refunds WHERE payment_id LIKE $1", [
    "pi_" + owner + "%",
  ]);
  await db.query("DELETE FROM billing_events WHERE id LIKE $1", [
    "evt_" + owner + "%",
  ]);
  await db.query("DELETE FROM entitlements WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM conversations WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM assets WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM imports WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.end();
  await postgres.stop();
}
