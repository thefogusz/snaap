import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { evaluateTarget } from "../src/monitor.js";
import { preview } from "../src/domain/preview.js";
import { type Series } from "../src/domain/engine.js";
const postgres = await localDatabase();
const schema = "flex_check_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: postgres.url });
await admin.query(`CREATE SCHEMA "${schema}"`);
const db = new pg.Pool({
  connectionString: postgres.url,
  options: `-c search_path=${schema}`,
});
await migrate(db);
const { app } = await buildApp(db, {
  local: true,
  monitoring: true,
  validateMarket: async () => {},
});
const owner = randomUUID(),
  outsider = randomUUID(),
  token = randomUUID(),
  otherToken = randomUUID();
const headers = {
  host: "127.0.0.1:4173",
  "x-snaap-client": "web",
  cookie: "snaap_session=" + token,
};
const cmp = (value: number) => ({
  kind: "COMPARE",
  op: ">",
  left: { kind: "PRICE", field: "close", timeframe: "5m" },
  right: { kind: "CONSTANT", value },
});
const spec = {
  schemaVersion: 2,
  name: "Entry flexibility integration",
  exchange: ["MEXC"],
  market: "Spot",
  side: "SPOT",
  pairs: ["BTC/USDT"],
  timeframe: "5m",
  entry: { kind: "GROUP", op: "AND", children: [cmp(10), cmp(100), cmp(20)] },
  stages: [],
  cooldownBars: 0,
  destinations: [],
};
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, outsider]);
  await db.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')",
    [hash(token), owner, hash(otherToken), outsider],
  );
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/rules",
    headers,
    payload: spec,
  });
  assert.equal(created.statusCode, 201, created.body);
  const rule = created.json();
  const active = await app.inject({
    method: "POST",
    url: `/api/v1/rules/${rule.id}/activation`,
    headers,
    payload: { active: true, expectedRevision: 1, confirmation: "ACTIVATE" },
  });
  assert.equal(active.statusCode, 200, active.body);
  const payload = { expectedRevision: 1, entryMatchPercent: 50 };
  const update = (body = payload, auth: Record<string, string> = headers) =>
    app.inject({
      method: "PUT",
      url: `/api/v1/rules/${rule.id}/entry-flexibility`,
      headers: auth,
      payload: body,
    });
  assert.equal(
    (
      await update(payload, {
        ...headers,
        cookie: "snaap_session=" + otherToken,
      })
    ).statusCode,
    409,
  );
  const workspace = randomUUID();
  await db.query("INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,$3)", [
    workspace,
    owner,
    "Other workspace",
  ]);
  assert.equal(
    (await update(payload, { ...headers, "x-snaap-workspace": workspace }))
      .statusCode,
    409,
  );
  assert.equal(
    (await update({ ...payload, entryMatchPercent: 0 })).statusCode,
    400,
  );
  assert.equal(
    (await update({ ...payload, entryMatchPercent: 101 })).statusCode,
    400,
  );
  await db.query(
    "INSERT INTO monitor_checkpoints VALUES($1,1,'MEXC','BTC/USDT',$2,now())",
    [rule.id, { lastTime: 1 }],
  );
  const savedResponse = await update();
  assert.equal(savedResponse.statusCode, 200, savedResponse.body);
  const saved = savedResponse.json();
  assert.equal(saved.revision, 2);
  assert.equal(saved.active, true);
  assert.equal(saved.spec.entryMatchPercent, 50);
  assert.deepEqual(saved.spec.entry, spec.entry);
  assert.equal(
    (
      await db.query(
        "SELECT count(*) n FROM monitor_checkpoints WHERE rule_id=$1",
        [rule.id],
      )
    ).rows[0].n,
    "0",
  );
  assert.equal((await update()).statusCode, 409);
  const unchanged = await update({ ...payload, expectedRevision: 2 });
  assert.equal(unchanged.statusCode, 200);
  assert.equal(unchanged.json().revision, 2);
  console.log(
    "PASS revision, ownership, workspace isolation, validation, active-state preservation and no-op saves",
  );
  const first =
    Math.floor(new Date(saved.activated_at).getTime() / 300000) * 300000;
  const series: Series = {
    "5m": [1, 30, 30].map((close, i) => ({
      time: first + i * 300000,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    })),
  };
  const clock = Date.now;
  Date.now = () => first + 600001;
  try {
    await evaluateTarget(
      db,
      { ruleId: rule.id, revision: 1, exchange: "MEXC", pair: "BTC/USDT" },
      async () => series,
    );
    assert.equal(
      (
        await db.query("SELECT count(*) n FROM signals WHERE rule_id=$1", [
          rule.id,
        ])
      ).rows[0].n,
      "0",
    );
    await evaluateTarget(
      db,
      { ruleId: rule.id, revision: 2, exchange: "MEXC", pair: "BTC/USDT" },
      async () => series,
    );
    const stored = (
      await db.query(
        "SELECT event,revision FROM signals WHERE rule_id=$1 ORDER BY created_at",
        [rule.id],
      )
    ).rows;
    assert.equal(stored.length, 1);
    assert.equal(stored[0].revision, 2);
    assert.equal(stored[0].event.time, first + 300000);
    assert.deepEqual(stored[0].event, { ...preview(saved.spec, series).events[0], recovered: true });
    await evaluateTarget(
      db,
      { ruleId: rule.id, revision: 2, exchange: "MEXC", pair: "BTC/USDT" },
      async () => series,
    );
    assert.equal(
      (
        await db.query("SELECT count(*) n FROM signals WHERE rule_id=$1", [
          rule.id,
        ])
      ).rows[0].n,
      "1",
    );
  } finally {
    Date.now = clock;
  }
  console.log(
    "PASS real PostgreSQL monitor matches preview, ignores stale revisions and deduplicates resumed signals",
  );
  const competing = await Promise.all([
    update({ expectedRevision: 2, entryMatchPercent: 90 }),
    update({ expectedRevision: 2, entryMatchPercent: 70 }),
  ]);
  assert.deepEqual(
    competing.map((response) => response.statusCode).sort(),
    [200, 409],
  );
  const strict = await update({ expectedRevision: 3, entryMatchPercent: 100 });
  assert.equal(strict.statusCode, 200, strict.body);
  assert.equal(strict.json().active, true);
  assert.equal(strict.json().spec.entryMatchPercent, undefined);
  assert.equal(
    (
      await db.query("SELECT count(*) n FROM rule_revisions WHERE rule_id=$1", [
        rule.id,
      ])
    ).rows[0].n,
    "4",
  );
  console.log(
    "PASS concurrent saves are atomic; returning to 100% retains monitoring and revision history",
  );
} finally {
  await app.close();
  await db.end();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
  await postgres.stop();
}
