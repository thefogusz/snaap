import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
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
  app = (
    await buildApp(db, {
      local: true,
      monitoring: true,
      validateMarket: async () => {},
    })
  ).app;
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
  assert.equal(me.json().limits.activeRules, 6);
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
  for (let i = 0; i < 7; i++) {
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
    assert.equal(activated.statusCode, i < 6 ? 200 : 409, activated.body);
    if (i === 6) assert.equal(activated.json().error.code, "RULE_LIMIT");
  }
  const active = await db.query(
    "SELECT count(*) AS n FROM rules WHERE owner_id=$1 AND active",
    [owner],
  );
  assert.equal(Number(active.rows[0].n), 6);
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
  const parallelIds = Array.from({ length: 7 }, () => randomUUID());
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
    6,
  );
  assert.equal(
    parallel.filter(
      (result) =>
        result.statusCode === 409 && result.json().error.code === "RULE_LIMIT",
    ).length,
    1,
  );
  console.log(
    "PASS: Free 6 active setups, 10 pairs, backend rejects pair 11 and activation 7",
  );
} finally {
  await app?.close();
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
