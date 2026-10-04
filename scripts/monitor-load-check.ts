import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import pg from "pg";
import { PgBoss } from "pg-boss";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { evaluateTarget } from "../src/monitor.js";
import {
  monitorBatches,
  splitMonitorTargets,
  type MonitorBatch,
} from "../src/monitor-batches.js";
import { strategySchema } from "../src/domain/engine.js";
const postgres = await localDatabase();
const admin = new pg.Pool({ connectionString: postgres.url });
const schema = "ml_" + randomUUID().replaceAll("-", ""),
  queueSchema = schema + "_q";
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({
  connectionString: postgres.url,
  max: 8,
  options: `-c search_path=${schema}`,
});
const boss = new PgBoss({
  connectionString: postgres.url,
  schema: queueSchema,
});
let started = false;
try {
  await migrate(db);
  const close = Math.floor(Date.now() / 300000) * 300000;
  const spec = strategySchema.parse({
    schemaVersion: 2,
    name: "Load fixture",
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
  });
  const owners = Array.from({ length: 100 }, () => randomUUID());
  await db.query("INSERT INTO users(id) SELECT unnest($1::uuid[])", [owners]);
  const rows = owners.flatMap((owner) =>
    Array.from({ length: 6 }, () => ({
      id: randomUUID(),
      owner,
      revision: 1,
      spec,
    })),
  );
  await db.query(
    "INSERT INTO rules(id,owner_id,spec,active,activated_at) SELECT unnest($1::uuid[]),unnest($2::uuid[]),$3::jsonb,true,to_timestamp(0)",
    [rows.map((r) => r.id), rows.map((r) => r.owner), spec],
  );
  const { groups, total } = monitorBatches(rows, new Map(), close);
  const jobs = [...groups.values()].flatMap((targets) =>
    splitMonitorTargets(targets).map((chunk) => ({
      data: { targets: chunk, queuedAt: Date.now() },
      expireInSeconds: 900,
    })),
  );
  assert.equal(total, 6000);
  assert.equal(jobs.length, 190);
  await boss.start();
  started = true;
  await boss.createQueue("load", { retryLimit: 0 });
  let processed = 0,
    fetches = 0,
    maxWaitMs = 0,
    maxBatchMs = 0;
  const sharedSeries = {
    "5m": [
      { time: close, open: 99, high: 102, low: 98, close: 101, volume: 100 },
    ],
  };
  await boss.work<MonitorBatch>(
    "load",
    {
      localConcurrency: 3,
      batchSize: 8,
      burstWhenBatchFull: true,
      pollingIntervalSeconds: 0.5,
    },
    async (batches) => {
      for (const job of batches) {
        const begin = performance.now();
        maxWaitMs = Math.max(maxWaitMs, Date.now() - job.data.queuedAt);
        for (const target of job.data.targets) {
          await evaluateTarget(db, target, async () => {
            fetches++;
            return sharedSeries;
          });
          processed++;
        }
        maxBatchMs = Math.max(maxBatchMs, performance.now() - begin);
      }
    },
  );
  const begin = performance.now();
  await boss.insert("load", jobs);
  const deadline = Date.now() + 120000;
  let finished = false;
  while (Date.now() < deadline) {
    const counts = await admin.query(
      `SELECT state,count(*)::int AS n FROM ${queueSchema}.job WHERE name='load' GROUP BY state`,
    );
    if (counts.rows.some((row) => row.state === "failed"))
      throw new Error("monitor load job failed");
    if (counts.rows.some((row) => row.state === "completed" && row.n === 190)) {
      finished = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(finished, "load did not finish within two minutes");
  assert.equal(processed, 6000);
  assert.equal(fetches, 6000);
  const signals = await db.query(
    "SELECT owner_id,count(*)::int AS n FROM signals GROUP BY owner_id",
  );
  assert.equal(signals.rowCount, 100);
  assert.ok(signals.rows.every((row) => row.n === 60));
  const firstElapsed = performance.now() - begin;
  const duplicateBegin = performance.now();
  for (const targets of groups.values())
    for (const target of targets)
      await evaluateTarget(db, target, async () => {
        throw new Error("duplicate fetched market history");
      });
  const second = await db.query("SELECT count(*)::int AS n FROM signals");
  assert.equal(second.rows[0].n, 6000);
  const checkpoints = new Map<string, number>(
    (
      await db.query(
        "SELECT rule_id,revision,exchange,pair,state->>'lastTime' AS time FROM monitor_checkpoints",
      )
    ).rows.map((row) => [
      [row.rule_id, row.revision, row.exchange, row.pair].join(":"),
      Number(row.time),
    ]),
  );
  assert.equal(monitorBatches(rows, checkpoints, close).groups.size, 0);
  console.log(
    JSON.stringify({
      scenario:
        "100 users x 6 active setups x 10 shared pairs, real PostgreSQL and pg-boss, simulated candle, no external sends",
      targets: processed,
      jobs: jobs.length,
      signals: second.rows[0].n,
      firstCloseMs: Math.round(firstElapsed),
      duplicatePassMs: Math.round(performance.now() - duplicateBegin),
      maxQueueWaitMs: maxWaitMs,
      maxBatchMs: Math.round(maxBatchMs),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      errors: 0,
    }),
  );
} finally {
  if (started) await boss.stop();
  await db.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`);
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
