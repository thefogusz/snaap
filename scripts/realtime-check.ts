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
let queries = 0;
db.on('connect', client => {
  const query = client.query.bind(client);
  client.query = ((...args: any[]) => { queries++; return (query as any)(...args); }) as typeof client.query;
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
  const before = queries;
  const created = await evaluateTarget(db, target, fixture, 300000);
  assert.ok(queries - before <= 14, 'fresh evaluation with a delivery uses at most 14 SQL statements');
  assert.equal(created?.length, 1);
  let duplicateFetches=0;
  const duplicateQueries = queries;
  await evaluateTarget(db,target,async()=>{duplicateFetches++;return fixture();},300000);
  assert.equal(duplicateFetches,0,'a committed candle must not fetch market history again');
  assert.ok(queries - duplicateQueries <= 2, 'duplicate evaluation reads rule/checkpoint and access only');
  assert.equal(
    (await db.query("SELECT status FROM deliveries WHERE id=$1", [created![0]]))
      .rows[0].status,
    "PENDING",
  );
  const marketIncidents = async () =>
    (await db.query("SELECT coalesce(sum(occurrences),0)::int AS n FROM admin_events WHERE event_key LIKE 'market:%'")).rows[0].n;
  const incidentsAfterFirstCandle = await marketIncidents();
  let fetches = 0, release!: () => void;
  const bothFetched = new Promise<void>(resolve => { release = resolve; });
  await Promise.all([1, 2].map(() => evaluateTarget(db, target, async () => {
    if (++fetches === 2) release();
    await bothFetched;
    return { '5m': [{ time: 600000, open: 99, high: 101, low: 98, close: 101, volume: 100 }] };
  }, 600000)));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM signals WHERE rule_id=$1', [rule])).rows[0].n, 1, 'concurrent evaluation retains one lifecycle/signal');
  assert.equal((await db.query('SELECT state FROM monitor_checkpoints WHERE rule_id=$1', [rule])).rows[0].state.lastTime, 600000);
  assert.equal(await marketIncidents(), incidentsAfterFirstCandle, 'a healthy follow-up candle must not reopen a market incident');
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
  }), 4500000);
  assert.equal(
    (
      await db.query("SELECT status FROM monitor_status WHERE rule_id=$1", [
        rule,
      ])
    ).rows[0].status,
    "DELAYED",
  );
  assert.equal((await db.query('SELECT state FROM monitor_checkpoints WHERE rule_id=$1',[rule])).rows[0].state.lastTime,600000,'lagging higher-frame data must not advance the checkpoint');
  await db.query("UPDATE rules SET active=false");
  boss = await startMonitor(db, postgres.url, queueSchema);
  const scan = await boss.send('scan');
  const start = Date.now();
  const id = await boss.send("deliver", { id: randomUUID() });
  while (Date.now() - start < 5000) {
    const job = await boss.getJobById("deliver", id!);
    if (job?.state === "completed" && (await boss.getJobById('scan',scan!))?.state === 'completed') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await boss.getJobById("deliver", id!))?.state, "completed");
  assert.equal((await boss.getJobById('scan',scan!))?.state,'completed','real scan must emit capacity metrics and release its resources');
  console.log(
    `PASS: post-commit delivery IDs, duplicate suppression, lagging higher-frame guard, LISTEN/NOTIFY worker (${Date.now() - start}ms; not mobile delivery latency)`,
  );
} finally {
  await boss?.stop();
  await db.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${queueSchema} CASCADE`);
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
