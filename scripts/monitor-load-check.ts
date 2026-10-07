import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
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
const users = Number(process.argv[2] ?? 100);
const sourceMode = process.argv[3] ?? '1';
const sourceCount = sourceMode === '5' ? 5 : 1;
const concurrency = Number(process.argv[4] ?? 3);
const budgetMs = Number(process.argv[5] ?? 300000);
assert.ok(Number.isInteger(users) && users >= 1 && users <= 1000, 'users: 1..1000');
assert.ok(['1','5','spread'].includes(sourceMode), 'sources: 1, 5 or spread');
assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 8, 'concurrency: 1..8');
assert.ok(Number.isInteger(budgetMs) && budgetMs >= 1000 && budgetMs <= 600000, 'budget: 1000..600000 ms');
const exchanges = ['Binance','Bybit','OKX','Bitget','MEXC'];
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
let queries = 0;
db.on('connect', client => {
  const query = client.query.bind(client);
  client.query = ((...args: any[]) => { queries++; return (query as any)(...args); }) as typeof client.query;
});
const boss = new PgBoss({
  connectionString: postgres.url,
  schema: queueSchema,
});
let started = false;
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
let sampler: ReturnType<typeof setInterval> | undefined;
try {
  await migrate(db);
  const close = Math.floor(Date.now() / 300000) * 300000;
  const spec = strategySchema.parse({
    schemaVersion: 2,
    name: "Load fixture",
    exchange: exchanges.slice(0, sourceCount),
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
  const owners = Array.from({ length: users }, () => randomUUID());
  await db.query("INSERT INTO users(id) SELECT unnest($1::uuid[])", [owners]);
  const rows = owners.flatMap((owner, index) =>
    Array.from({ length: 6 }, () => ({
      id: randomUUID(),
      owner,
      revision: 1,
      spec: sourceMode === 'spread' ? strategySchema.parse({...spec,exchange:[exchanges[index % 5]]}) : spec,
    })),
  );
  await db.query(
    "INSERT INTO rules(id,owner_id,spec,active,activated_at) SELECT unnest($1::uuid[]),unnest($2::uuid[]),unnest($3::jsonb[]),true,to_timestamp(0)",
    [rows.map((r) => r.id), rows.map((r) => r.owner), rows.map(r=>JSON.stringify(r.spec))],
  );
  const { groups, total } = monitorBatches(rows, new Map(), close);
  const jobs = [...groups.values()].flatMap((targets) =>
    splitMonitorTargets(targets).map((chunk) => ({
      data: { targets: chunk, queuedAt: Date.now() },
      expireInSeconds: 900,
    })),
  );
  assert.equal(total, users * 6 * 10 * sourceCount);
  const expectedJobs = sourceMode === 'spread'
    ? exchanges.reduce((n,_,i)=>n+Math.ceil((Math.floor(users/5)+(i<users%5?1:0))*6/32)*10,0)
    : Math.ceil(users * 6 / 32) * 10 * sourceCount;
  assert.equal(jobs.length, expectedJobs);
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
      localConcurrency: concurrency,
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
          }, close);
          processed++;
        }
        maxBatchMs = Math.max(maxBatchMs, performance.now() - begin);
      }
    },
  );
  const begin = performance.now();
  queries = 0;
  const cpu = process.cpuUsage();
  eventLoop.enable();
  let peakRss = process.memoryUsage().rss;
  sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100).unref();
  await boss.insert("load", jobs);
  const deadline = Date.now() + budgetMs;
  let lastProgress = Date.now();
  let finished = false;
  while (Date.now() < deadline) {
    const counts = await admin.query(
      `SELECT state,count(*)::int AS n FROM ${queueSchema}.job WHERE name='load' GROUP BY state`,
    );
    if (counts.rows.some((row) => row.state === "failed"))
      throw new Error("monitor load job failed");
    if (counts.rows.some((row) => row.state === "completed" && row.n === jobs.length)) {
      finished = true;
      break;
    }
    if(Date.now()-lastProgress>=30000){console.log(JSON.stringify({progress:processed,total,elapsedMs:Math.round(performance.now()-begin)}));lastProgress=Date.now();}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if(!finished){
    await boss.stop();started=false;
    const evaluationQueries = queries;
    const partial=(await db.query('SELECT count(*)::int AS n FROM signals')).rows[0].n;
    console.log(JSON.stringify({scenario:`${users} users, ${sourceMode} sources`,completed:false,budgetMs,
      elapsedMs:Math.round(performance.now()-begin),concurrency,
      targets:total,processed,signals:partial,evaluationQueries,maxQueueWaitMs:maxWaitMs,
      peakNodeRssMB:Math.round(peakRss/1024/1024),eventLoopP95Ms:eventLoop.percentile(95)/1e6}));
    assert.fail('capacity budget exceeded; this workload is not certified');
  }
  clearInterval(sampler);
  eventLoop.disable();
  const evaluationQueries = queries;
  const usedCpu = process.cpuUsage(cpu);
  assert.equal(processed, total);
  assert.equal(fetches, total);
  const signals = await db.query(
    "SELECT owner_id,count(*)::int AS n FROM signals GROUP BY owner_id",
  );
  assert.equal(signals.rowCount, users);
  assert.ok(signals.rows.every((row) => row.n === 60 * sourceCount));
  const firstElapsed = performance.now() - begin;
  const duplicateBegin = performance.now();
  let duplicateTargets = 0, duplicateFetches = 0;
  for (const targets of groups.values())
    for (const target of targets.slice(0, Math.max(1, Math.floor(6000 / groups.size)))) {
      await evaluateTarget(db, target, async () => {
        duplicateFetches++;
        return sharedSeries;
      }, close);
      duplicateTargets++;
    }
  assert.equal(duplicateFetches,0,'duplicate work must not fetch market history');
  const second = await db.query("SELECT count(*)::int AS n FROM signals");
  assert.equal(second.rows[0].n, total);
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
        `${users} users x 6 active setups x 10 shared pairs, ${sourceMode === 'spread' ? 'one source per user spread across 5 exchanges' : sourceCount+' sources each'}, real PostgreSQL and pg-boss, one simulated price candle, no external sends`,
      completed:true,
      concurrency,
      targets: processed,
      jobs: jobs.length,
      signals: second.rows[0].n,
      firstCloseMs: Math.round(firstElapsed),
      duplicatePassMs: Math.round(performance.now() - duplicateBegin),
      duplicateTargets,
      evaluationQueries,
      queriesPerTarget: Number((evaluationQueries / total).toFixed(2)),
      nodeCpuMs: Math.round((usedCpu.user + usedCpu.system) / 1000),
      eventLoopP95Ms: Number((eventLoop.percentile(95) / 1e6).toFixed(2)),
      peakNodeRssMB: Math.round(peakRss / 1024 / 1024),
      maxQueueWaitMs: maxWaitMs,
      maxBatchMs: Math.round(maxBatchMs),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      errors: 0,
    }),
  );
} finally {
  if (sampler) clearInterval(sampler);
  eventLoop.disable();
  if (started) await boss.stop();
  await db.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`);
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
