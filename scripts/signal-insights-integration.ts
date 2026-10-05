import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { evaluateTarget, startMonitor } from "../src/monitor.js";
import { frames, strategySchema } from "../src/domain/engine.js";
import { preview } from "../src/domain/preview.js";
const postgres = await localDatabase(),
  admin = new pg.Pool({ connectionString: postgres.url });
const schema = "insight_test_" + Date.now();
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({
  connectionString: postgres.url,
  options: `-c search_path=${schema}`,
});
await migrate(db);
await migrate(db);
const serve = process.argv.includes("--serve");
const { app } = await buildApp(db, {
  local: true,
  monitoring: false,
  developerPro: true,
  origin: "http://127.0.0.1:4175",
  validateMarket: async () => {},
  presetInstruments: async () => ({
    at: Date.now(),
    items: [{ symbol: "BTC/USDT", supported: true }],
  }),
});
const owner = serve ? "00000000-0000-4000-8000-000000000001" : randomUUID(),
  other = randomUUID(),
  space = randomUUID(),
  otherSpace = randomUUID(),
  token = randomUUID(),
  otherToken = randomUUID();
const headers: Record<string, string> = {
  host: "127.0.0.1:4175",
  "x-snaap-client": "web",
  cookie: `snaap_session=${token}`,
  "x-snaap-workspace": space,
};
const call = async (
  url: string,
  method: any = "GET",
  payload?: any,
  expected = 200,
  auth = headers,
) => {
  const response = await app.inject({
    url: "/api/v1" + url,
    method,
    payload,
    headers: auth,
  });
  assert.equal(response.statusCode, expected, response.body);
  return response.json();
};
const step = frames["1h"],
  now = Math.floor(Date.now() / step) * step;
const bars = Array.from({ length: 60 }, (_, i) => ({
  time: now - (59 - i) * step,
  open: 100,
  high: 104,
  low: 96,
  close: i % 2 ? 101 : 99,
  volume: 100,
}));
bars[54].close = 101;
for (let i = 55; i < 59; i++) bars[i].close = 99;
const spec = strategySchema.parse({
  schemaVersion: 2,
  name: "ทดสอบสัญญาณ",
  exchange: ["Binance"],
  market: "Spot",
  side: "SPOT",
  pairs: ["BTC/USDT"],
  timeframe: "1h",
  entry: {
    kind: "COMPARE",
    left: { kind: "PRICE", field: "close", timeframe: "1h" },
    op: ">",
    right: { kind: "CONSTANT", value: 100 },
  },
  exit: {
    kind: "COMPARE",
    left: { kind: "PRICE", field: "close", timeframe: "1h" },
    op: "<",
    right: { kind: "CONSTANT", value: 100 },
  },
  stages: [],
  cooldownBars: 0,
  destinations: [],
});
if (serve) {
  app.addHook("preHandler", async (req, reply) => {
    if (req.url === "/api/v1/preview")
      return reply.send({
        ...preview(strategySchema.parse((req.body as any).spec), {
          "1h": bars,
        }),
        source: {
          exchange: "Binance",
          pair: "BTC/USDT",
          frame: "1h",
          asOf: new Date().toISOString(),
        },
      });
    if (req.url.startsWith("/api/v1/instruments"))
      return reply.send({ items: [{ symbol: "BTC/USDT", supported: true }] });
  });
}
async function cleanup() {
  await app.close();
  await db.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema}_queue CASCADE`);
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
try {
  await db.query("INSERT INTO users(id,email) VALUES($1,$2),($3,$4)", [
    owner,
    "local@snaap.invalid",
    other,
    "other@test.invalid",
  ]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$2,'Signal research',true),($3,$2,'Other workspace',false)",
    [space, owner, otherSpace],
  );
  const rule = await call("/rules", "POST", spec, 201);
  assert.equal("risk_plan" in (await call("/rules"))[0], false);
  const config = { enabled: true, atrPeriod: 14, stopAtr: 1.5, rewardRisk: 2 };
  await call(`/rules/${rule.id}/risk-plan`, "PUT", {
    expectedRevision: 1, riskPlan: config,
  }, 404);
  const destination = randomUUID();
  await db.query(
    "INSERT INTO destinations(id,owner_id,kind,name,config,verified) VALUES($1,$2,'WEBHOOK','Never sent','{}',true)",
    [destination, owner],
  );
  await db.query(
    "UPDATE rules SET spec=$2,active=true,activated_at=to_timestamp($3) WHERE id=$1",
    [
      rule.id,
      { ...spec, destinations: [destination] },
      (now - 6 * step) / 1000,
    ],
  );
  const target = {
    ruleId: rule.id,
    revision: 1,
    exchange: "Binance" as const,
    pair: "BTC/USDT",
  };
  await evaluateTarget(
    db,
    target,
    async () => ({ "1h": bars.slice(0, -1) }),
    now,
  );
  assert.equal((await call("/monitor"))[0].status, "DELAYED");
  assert.equal((await call("/signals")).length, 0);
  await evaluateTarget(db, target, async () => ({ "1h": bars }), now);
  const signals = await call("/signals");
  assert.equal(signals.length, 3);
  const deliveries = await db.query("SELECT * FROM deliveries");
  assert.equal(deliveries.rowCount, 1, "only latest event delivered");
  assert.equal(signals.filter((s: any) => s.event.recovered).length, 2);
  const latest = signals.find((s: any) => s.event.time === now);
  assert.equal("risk_snapshot" in latest, false);
  assert.equal("outcome" in latest, false);
  await evaluateTarget(db, target, async () => ({ "1h": bars }), now);
  assert.equal((await call("/signals")).length, 3);
  assert.equal((await db.query("SELECT * FROM deliveries")).rowCount, 1);
  await call(`/signals/${latest.id}/outcome`, "GET", undefined, 404);
  // Upgrade a database that previously stored tracking data without losing signals.
  await db.query(`
    ALTER TABLE rules ADD COLUMN risk_plan jsonb;
    ALTER TABLE rule_revisions ADD COLUMN risk_plan jsonb;
    CREATE FUNCTION snapshot_rule_risk() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN SELECT risk_plan INTO NEW.risk_plan FROM rules WHERE id=NEW.rule_id; RETURN NEW; END $$;
    CREATE TRIGGER rule_risk_snapshot BEFORE INSERT ON rule_revisions FOR EACH ROW EXECUTE FUNCTION snapshot_rule_risk();
    CREATE TABLE signal_outcomes(signal_id uuid PRIMARY KEY REFERENCES signals, result jsonb);
  `);
  await db.query("UPDATE rules SET risk_plan=$2 WHERE id=$1", [rule.id, config]);
  await db.query("INSERT INTO signal_outcomes VALUES($1,$2)", [latest.id, {status: "PENDING"}]);
  await migrate(db);
  await migrate(db);
  assert.equal((await db.query("SELECT to_regclass('signal_outcomes') AS table_name")).rows[0].table_name, null);
  assert.equal((await db.query("SELECT * FROM signals")).rowCount, 3);
  assert.equal("risk_plan" in (await call("/rules"))[0], false);
  const share = await call("/setup-shares", "POST", { ruleId: rule.id }, 201);
  assert.equal("riskPlan" in await call("/setup-shares/" + share.code), false);
  // Older share wrappers remain readable and have their retired settings removed.
  await db.query("UPDATE setup_shares SET setup=$1", [{spec, riskPlan: config}]);
  await migrate(db);
  assert.equal((await db.query("SELECT setup FROM setup_shares")).rows[0].setup.riskPlan, undefined);
  assert.equal((await call("/setup-shares/" + share.code)).setup.name, spec.name);
  const imported = await call(
    "/setup-shares/" + share.code + "/import",
    "POST",
    {},
    201,
  );
  assert.equal("risk_plan" in imported, false);
  assert.equal(imported.active, false);
  const file = await call(
    "/setup-files/import",
    "POST",
    {
      format: "snaap.trade-setups",
      version: 1,
      setups: [spec],
      riskPlans: [config],
    },
    201,
  );
  assert.equal("risk_plan" in file.items[0], false);
  assert.equal((await db.query("SELECT * FROM usage_ledger")).rowCount, 0);
  assert.deepEqual(
    await call(`/rules/${rule.id}/revisions`, "GET", undefined, 200, {
      ...headers,
      "x-snaap-workspace": otherSpace,
    }),
    [],
  );
  const revised = await call(`/rules/${rule.id}`, "PUT", {
    expectedRevision: 1,
    spec: { ...spec, name: "แก้เงื่อนไขสัญญาณ" },
  });
  assert.equal(revised.revision, 2);
  assert.equal("risk_plan" in revised, false);
  assert.equal("risk_plan" in (await call(`/rules/${rule.id}/revisions`))[0], false);
  const both = await call(
    "/rules",
    "POST",
    { ...spec, market: "Perpetual Futures", side: "BOTH", mirrorShort: true },
    201,
  );
  await db.query(
    "UPDATE rules SET active=true,activated_at=to_timestamp($2) WHERE id=$1",
    [both.id, now / 1000],
  );
  await evaluateTarget(
    db,
    { ...target, ruleId: both.id, revision: 1 },
    async () => ({ "1h": bars }),
    now,
  );
  assert.equal(
    (await call("/monitor")).find((m: any) => m.rule_id === both.id).progress
      .length,
    2,
    "new BOTH rule has progress before any post-activation bar",
  );
  const multiSpec = {
    ...spec,
    entry: {
      kind: "GROUP",
      op: "AND",
      children: [
        spec.entry,
        {
          kind: "COMPARE",
          op: ">",
          left: { kind: "PRICE", field: "close", timeframe: "4h" },
          right: { kind: "CONSTANT", value: 0 },
        },
      ],
    },
  };
  const multi = await call("/rules", "POST", multiSpec, 201);
  await db.query(
    "UPDATE rules SET active=true,activated_at=to_timestamp($2) WHERE id=$1",
    [multi.id, (now - step) / 1000],
  );
  await evaluateTarget(
    db,
    { ...target, ruleId: multi.id, revision: 1 },
    async () => ({ "1h": bars }),
    now,
  );
  assert.equal(
    (await call("/monitor")).find((m: any) => m.rule_id === multi.id).status,
    "INSUFFICIENT",
  );
  assert.equal(
    (await call("/signals")).filter((s: any) => s.rule_id === multi.id).length,
    0,
  );
  await db.query("UPDATE rules SET active=false WHERE id=ANY($1::uuid[])", [
    [both.id, multi.id],
  ]);
  await call(`/rules/${multi.id}`, "DELETE", { expectedRevision: 1 });
  await call(`/rules/${multi.id}/risk-plan`, "PUT", {
    expectedRevision: 2,
    riskPlan: config,
  }, 404);
  await db.query("UPDATE rules SET active=false");
  const queueSchema = schema + "_queue";
  const legacyQueue = new PgBoss({connectionString: postgres.url, schema: queueSchema});
  await legacyQueue.start();
  await legacyQueue.createQueue("outcome");
  await legacyQueue.send("outcome", {id: latest.id});
  await legacyQueue.stop();
  const monitor = await startMonitor(db, postgres.url, queueSchema);
  try {
    assert.equal(await monitor.getQueue("outcome"), null);
    assert.ok(await monitor.getQueue("evaluate"));
    assert.ok(await monitor.getQueue("deliver"));
    assert.equal((await db.query(`SELECT count(*) AS count FROM ${queueSchema}.job WHERE name='outcome'`)).rows[0].count, "0");
  } finally {
    await monitor.stop();
  }
  console.log(
    "PASS: freshness, recovery suppression, deduplication, tracking removal and migration, legacy sharing/import, revisions, workspace isolation, zero LLM usage",
  );
  if (serve) {
    // Local UI fixture only; no exchanges, LLMs, notification delivery or paid calls.

    await app.listen({ host: "127.0.0.1", port: 4175 });
    console.log("UI fixture http://127.0.0.1:4175");
    for (const event of ["SIGINT", "SIGTERM"] as const)
      process.once(event, () => void cleanup().then(() => process.exit(0)));
  } else await cleanup();
} catch (error) {
  await cleanup();
  throw error;
}
