import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
const postgres = await localDatabase(),
  db = database(postgres.url);
await migrate(db);
const { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  other = randomUUID(),
  space = randomUUID(),
  foreign = randomUUID(),
  token = randomUUID();
const base = { host: "127.0.0.1:4173", "x-snaap-client": "web" },
  auth = {
    ...base,
    cookie: `snaap_session=${token}`,
    "x-snaap-workspace": space,
  };
const spec = {
  schemaVersion: 2,
  name: "Portable fixture",
  exchange: ["MEXC"],
  market: "Spot",
  pairs: ["BTC/USDT"],
  timeframe: "15m",
  entry: {
    kind: "COMPARE",
    op: ">",
    left: { kind: "PRICE", field: "close", timeframe: "15m" },
    right: { kind: "INDICATOR", name: "EMA", period: 200, timeframe: "15m" },
  },
  stages: [],
  cooldownBars: 0,
  destinations: [randomUUID()],
};
const payload = {
  format: "snaap.trade-setups",
  version: 1,
  setups: [spec, { ...spec, name: "Second fixture" }],
};
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,'Import test'),($3,$4,'Foreign')",
    [space, owner, foreign, other],
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/setup-files/import",
        headers: base,
        payload,
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/setup-files/import",
        headers: { ...auth, "x-snaap-workspace": foreign },
        payload,
      })
    ).statusCode,
    403,
  );
  const preview = await app.inject({
    method: "POST",
    url: "/api/v1/setup-files/preview",
    headers: auth,
    payload,
  });
  assert.equal(preview.statusCode, 200, preview.body);
  assert.deepEqual(preview.json().setups[0].destinations, []);
  assert.equal(
    (await db.query("SELECT id FROM rules WHERE owner_id=$1", [owner]))
      .rowCount,
    0,
  );
  const invalid = { ...payload, setups: [spec, { ...spec, cooldownBars: -1 }] };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/setup-files/import",
        headers: auth,
        payload: invalid,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await db.query("SELECT id FROM rules WHERE owner_id=$1", [owner]))
      .rowCount,
    0,
  );
  const result = await app.inject({
    method: "POST",
    url: "/api/v1/setup-files/import",
    headers: auth,
    payload,
  });
  assert.equal(result.statusCode, 201, result.body);
  const rows = (
    await db.query("SELECT * FROM rules WHERE owner_id=$1", [owner])
  ).rows;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.workspace_id, space);
    assert.equal(row.active, false);
    assert.deepEqual(row.spec.destinations, []);
    assert.equal(
      (
        await db.query("SELECT id FROM rules WHERE id=$1 AND owner_id=$2", [
          row.id,
          other,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await db.query("SELECT revision FROM rule_revisions WHERE rule_id=$1", [
          row.id,
        ])
      ).rows[0].revision,
      1,
    );
  }
  const share = await app.inject({
    method: "POST",
    url: "/api/v1/setup-shares",
    headers: auth,
    payload: { ruleId: rows[0].id },
  });
  assert.equal(share.statusCode, 201, share.body);
  const code = share.json().code;
  await db.query(
    "UPDATE rules SET spec=jsonb_set(spec,'{name}','\"Changed after sharing\"') WHERE id=$1",
    [rows[0].id],
  );
  assert.equal(
    (await app.inject({ url: "/api/v1/setup-shares/" + code, headers: base }))
      .statusCode,
    401,
  );
  const otherToken = randomUUID();
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(otherToken),
    other,
  ]);
  const recipient = {
    ...base,
    cookie: `snaap_session=${otherToken}`,
    "x-snaap-workspace": foreign,
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/setup-shares",
        headers: recipient,
        payload: { ruleId: rows[0].id },
      })
    ).statusCode,
    404,
  );
  const shared = await app.inject({
    url: "/api/v1/setup-shares/" + code,
    headers: recipient,
  });
  assert.equal(shared.statusCode, 200, shared.body);
  assert.deepEqual(shared.json().setup.destinations, []);
  assert.equal(shared.json().setup.name, "Portable fixture");
  const copy = await app.inject({
    method: "POST",
    url: "/api/v1/setup-shares/" + code + "/import",
    headers: recipient,
    payload: {},
  });
  assert.equal(copy.statusCode, 201, copy.body);
  assert.equal(copy.json().active, false);
  const copied = (
    await db.query("SELECT * FROM rules WHERE id=$1", [copy.json().id])
  ).rows[0];
  assert.equal(copied.owner_id, other);
  assert.equal(copied.workspace_id, foreign);
  assert.deepEqual(copied.spec, shared.json().setup);
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/v1/setup-shares/" + code,
        headers: recipient,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: "/api/v1/setup-shares/" + code,
        headers: auth,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/v1/setup-shares/" + code,
        headers: recipient,
      })
    ).statusCode,
    404,
  );
  console.log(
    "Setup files and codes: auth, workspace ownership, immutable snapshots, recipient copies, inactive import, revisions and owner-only revocation passed",
  );
} finally {
  await db.query(
    "DELETE FROM rule_revisions WHERE rule_id IN (SELECT id FROM rules WHERE owner_id=ANY($1::uuid[]))",
    [[owner, other]],
  );
  await db.query("DELETE FROM rules WHERE owner_id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await app.close();
  await db.end();
  await postgres.stop();
}
