import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { evaluateTarget, startMonitor } from "../src/monitor.js";
const postgres = await localDatabase();
const admin = new pg.Pool({ connectionString: postgres.url });
const schema = "rt_" + randomUUID().replaceAll("-", "");
const queueSchema = schema + "_queue";
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({
  connectionString: postgres.url,
  options: `-c search_path=${schema}`,
});
let boss: Awaited<ReturnType<typeof startMonitor>> | undefined;
try {
  await migrate(db);
  const owner = randomUUID(),
    rule = randomUUID(),
    dest = randomUUID();
  const spec = {
    schemaVersion: 2,
    name: "fixture",
    exchange: ["Binance"],
    market: "Spot",
    pairs: ["BTC/USDT"],
    timeframe: "5m",
    entry: {
      kind: "COMPARE",
      op: ">",
      left: { kind: "PRICE", field: "close", timeframe: "5m" },
      right: { kind: "CONSTANT", value: 100 },
    },
    stages: [],
    cooldownBars: 0,
    destinations: [dest],
  };
  await db.query("INSERT INTO users(id) VALUES($1)", [owner]);
  await db.query(
    "INSERT INTO destinations(id,owner_id,kind,name,config,verified) VALUES($1,$2,'TELEGRAM','fixture','{}',true)",
    [dest, owner],
  );
  await db.query(
    "INSERT INTO rules(id,owner_id,spec,active,activated_at) VALUES($1,$2,$3,true,to_timestamp(0))",
    [rule, owner, spec],
  );
  const target = {
    ruleId: rule,
    revision: 1,
    exchange: "Binance" as const,
    pair: "BTC/USDT",
  };
  const fixture = async () => ({
    "5m": [
      { time: 300000, open: 99, high: 101, low: 98, close: 101, volume: 100 },
    ],
  });
  const created = await evaluateTarget(db, target, fixture);
  assert.equal(created?.length, 1);
  assert.equal((await evaluateTarget(db, target, fixture))?.length, 0);
  assert.equal(
    (await db.query("SELECT status FROM deliveries WHERE id=$1", [created![0]]))
      .rows[0].status,
    "PENDING",
  );
  await db.query("UPDATE rules SET spec=$1 WHERE id=$2", [
    {
      ...spec,
      entry: { ...spec.entry, left: { ...spec.entry.left, timeframe: "1h" } },
    },
    rule,
  ]);
  await evaluateTarget(db, target, async () => ({
    "5m": [
      { time: 4500000, open: 99, high: 101, low: 98, close: 101, volume: 100 },
    ],
    "1h": [{ time: 0, open: 99, high: 101, low: 98, close: 101, volume: 100 }],
  }));
  assert.equal(
    (
      await db.query("SELECT status FROM monitor_status WHERE rule_id=$1", [
        rule,
      ])
    ).rows[0].status,
    "DATA_UNAVAILABLE",
  );
  await db.query("UPDATE rules SET active=false");
  boss = await startMonitor(db, postgres.url, queueSchema);
  const start = Date.now();
  const id = await boss.send("deliver", { id: randomUUID() });
  while (Date.now() - start < 5000) {
    const job = await boss.getJobById("deliver", id!);
    if (job?.state === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await boss.getJobById("deliver", id!))?.state, "completed");
  console.log(
    `PASS: post-commit delivery IDs, duplicate suppression, missing higher-frame guard, LISTEN/NOTIFY worker (${Date.now() - start}ms; not mobile delivery latency)`,
  );
} finally {
  await boss?.stop();
  await db.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`);
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
