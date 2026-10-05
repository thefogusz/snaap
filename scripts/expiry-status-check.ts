import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localDatabase } from "./postgres.js";
import { database } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { evaluateTarget } from "../src/monitor.js";
import { strategySchema } from "../src/domain/engine.js";

const postgres = await localDatabase(),
  db = database(postgres.url);
const { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  other = randomUUID(),
  rule = randomUUID(),
  destination = randomUUID(),
  token = randomUUID();
const headers = { host: "127.0.0.1:4173", cookie: `snaap_session=${token}` };
const compare = (value: number) => ({
  kind: "COMPARE",
  op: ">",
  left: { kind: "PRICE", field: "close", timeframe: "5m" },
  right: { kind: "CONSTANT", value },
});
const spec = strategySchema.parse({
  schemaVersion: 2,
  name: "Expiry fixture",
  exchange: ["Binance"],
  market: "Spot",
  side: "SPOT",
  pairs: ["BTC/USDT"],
  timeframe: "5m",
  entry: compare(0),
  stages: [{ condition: compare(70), withinBars: 1 }],
  cooldownBars: 0,
  destinations: [destination],
});
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO destinations(id,owner_id,kind,name,config,verified) VALUES($1,$2,'WEBHOOK','Fixture','{}',true)",
    [destination, owner],
  );
  await db.query(
    "INSERT INTO rules(id,owner_id,active,spec,activated_at) VALUES($1,$2,true,$3,to_timestamp(0))",
    [rule, owner, spec],
  );
  await db.query(
    "INSERT INTO rule_revisions(rule_id,revision,spec) VALUES($1,1,$2)",
    [rule, spec],
  );
  const target = {
    ruleId: rule,
    revision: 1,
    exchange: "Binance" as const,
    pair: "BTC/USDT",
  };
  const bars = Array.from({ length: 3 }, (_, i) => ({
    time: (i + 1) * 300000,
    open: 60,
    high: 61,
    low: 59,
    close: 60,
    volume: 100,
  }));
  await evaluateTarget(db, target, async () => ({ "5m": bars }));
  await evaluateTarget(db, target, async () => ({ "5m": bars }));
  const status = (
    await app.inject({ url: "/api/v1/signals?view=status", headers })
  ).json();
  assert.equal(status.length, 1);
  assert.equal(status[0].event.kind, "EXPIRED");
  assert.match(status[0].event.evidence.reason, /ภายใน 1 แท่ง \(5m\)/);
  assert.equal(
    (await app.inject({ url: "/api/v1/signals?view=signals", headers })).json()
      .length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM deliveries WHERE destination_id=$1",
        [destination],
      )
    ).rows[0].n,
    0,
  );
  // Older events remain browsable and cannot crowd actual signals out of a page.
  for (let i = 0; i < 101; i++)
    await db.query(
      "INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup) VALUES($1::uuid,$2,$3,1,'Binance','BTC/USDT',$4,$1::text)",
      [randomUUID(), owner, rule, { ...status[0].event, kind: "EXPIRED" }],
    );
  const entryId = randomUUID();
  await db.query(
    "INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup,created_at) VALUES($1::uuid,$2,$3,1,'Binance','BTC/USDT',$4,$1::text,now()-interval '1 day')",
    [entryId, owner, rule, { ...status[0].event, kind: "ENTRY" }],
  );
  assert.equal(
    (
      await app.inject({ url: "/api/v1/signals?view=signals", headers })
    ).json()[0].id,
    entryId,
  );
  const page = (
    await app.inject({ url: "/api/v1/signals?view=status", headers })
  ).json();
  assert.equal(page.length, 100);
  assert.equal(
    (
      await app.inject({
        url: `/api/v1/signals?view=status&before=${page.at(-1).id}`,
        headers,
      })
    ).json().length,
    2,
  );
  const outsiderToken = randomUUID();
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(outsiderToken),
    other,
  ]);
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/signals?view=status",
        headers: { ...headers, cookie: `snaap_session=${outsiderToken}` },
      })
    ).json().length,
    0,
  );
  console.log(
    "PASS expiry reasons, durable status/dedup, no external delivery, filtered pagination and owner isolation",
  );
} finally {
  await app.close();
  for (const table of [
    "deliveries",
    "signals",
    "monitor_status",
    "monitor_checkpoints",
    "rule_revisions",
  ]) {
    if (table === "deliveries")
      await db.query("DELETE FROM deliveries WHERE destination_id=$1", [
        destination,
      ]);
    else await db.query(`DELETE FROM ${table} WHERE rule_id=$1`, [rule]);
  }
  await db.query("DELETE FROM rules WHERE id=$1", [rule]);
  await db.query("DELETE FROM destinations WHERE id=$1", [destination]);
  await db.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.query("DELETE FROM admin_events WHERE event_key=$1", [
    "signup:" + owner,
  ]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.end();
  await postgres.stop();
}
