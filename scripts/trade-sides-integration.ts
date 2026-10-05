import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { evaluateTarget } from "../src/monitor.js";
import { deliver } from "../src/destinations.js";
import { seal } from "../src/vault.js";
import type { Series } from "../src/domain/engine.js";
const postgres = await localDatabase(),
  db = database(postgres.url);
await migrate(db);
const { app } = await buildApp(db, {
  local: true,
  monitoring: true,
  validateMarket: async () => {},
});
const owner = randomUUID(),
  token = randomUUID(),
  destination = randomUUID();
const headers = {
  host: "127.0.0.1:4173",
  "x-snaap-client": "web",
  cookie: `snaap_session=${token}`,
};
const spec = {
  schemaVersion: 2,
  name: "Direction fixture",
  exchange: ["MEXC"],
  market: "Perpetual Futures",
  side: "BOTH",
  mirrorShort: true,
  pairs: ["BTC/USDT"],
  timeframe: "15m",
  entry: {
    kind: "COMPARE",
    op: ">=",
    left: { kind: "PRICE", field: "close", timeframe: "15m" },
    right: { kind: "CONSTANT", value: 100 },
  },
  stages: [],
  cooldownBars: 0,
  destinations: [destination],
};
const originalFetch = globalThis.fetch;
const originalEncryptionKey=process.env.DATA_ENCRYPTION_KEY;
process.env.DATA_ENCRYPTION_KEY='ab'.repeat(32);
try {
  await db.query("INSERT INTO users(id) VALUES($1)", [owner]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO destinations(id,owner_id,kind,name,config,verified) VALUES($1,$2,'TELEGRAM','Fixture',$3,true)",
    [destination, owner, { recipient: "123456789",encryptedTelegram:seal({token:'123456:'+'x'.repeat(35)},`telegram:${owner}:${destination}`) }],
  );
  const create = await app.inject({
    method: "POST",
    url: "/api/v1/rules",
    headers,
    payload: spec,
  });
  assert.equal(create.statusCode, 201, create.body);
  const rule = create.json();
  const activation = await app.inject({
    method: "POST",
    url: `/api/v1/rules/${rule.id}/activation`,
    headers,
    payload: { active: true, expectedRevision: 1, confirmation: "ACTIVATE" },
  });
  assert.equal(activation.statusCode, 200, activation.body);
  await db.query("UPDATE rules SET activated_at=to_timestamp(0) WHERE id=$1", [
    rule.id,
  ]);
  const series: Series = {
    "15m": [
      { time: 900000, open: 100, close: 100, high: 100, low: 100, volume: 1 },
    ],
  };
  const target = {
    ruleId: rule.id,
    revision: 1,
    exchange: "MEXC" as const,
    pair: "BTC/USDT",
  };
  await evaluateTarget(db, target, async () => series);
  await evaluateTarget(db, target, async () => series);
  const signals = (
    await app.inject({ url: "/api/v1/signals", headers })
  ).json();
  assert.equal(signals.length, 2);
  assert.deepEqual(signals.map((s: any) => s.event.side).sort(), [
    "LONG",
    "SHORT",
  ]);
  assert.ok(
    signals.every(
      (s: any) =>
        s.event.market === "Perpetual Futures" && s.setup_side === "BOTH",
    ),
  );
  // No outbound request: intercept every delivery call in-process.
  const messages: string[] = [];
  globalThis.fetch = async (_url, options) => {
    const body=options?.body; messages.push(body instanceof FormData ? String(body.get("caption")) : JSON.parse(String(body)).text);
    return new Response('{"ok":true}', { status: 200 });
  };
  for (const row of (
    await db.query("SELECT id FROM deliveries WHERE destination_id=$1", [
      destination,
    ])
  ).rows)
    await deliver(db, row.id);
  assert.equal(messages.length, 2);
  assert.ok(messages.some((x) => x.includes("Long (ซื้อ) · Futures")));
  assert.ok(messages.some((x) => x.includes("Short (ขาย) · Futures")));
  const legacy = { ...spec };
  delete (legacy as any).side;
  delete (legacy as any).mirrorShort;
  const old = await app.inject({
    method: "POST",
    url: "/api/v1/rules",
    headers,
    payload: legacy,
  });
  assert.equal(old.statusCode, 201, old.body);
  const denied = await app.inject({
    method: "POST",
    url: `/api/v1/rules/${old.json().id}/activation`,
    headers,
    payload: { active: true, expectedRevision: 1, confirmation: "ACTIVATE" },
  });
  assert.equal(denied.statusCode, 400);
  assert.equal(denied.json().error.code, "DIRECTION_REQUIRED");
  // Old Spot events fall back to their recorded revision despite a current Futures edit.
  const oldSignal = randomUUID();
  await db.query("INSERT INTO rule_revisions VALUES($1,2,$2,now())", [
    rule.id,
    { ...spec, market: "Spot", side: "SPOT", mirrorShort: undefined },
  ]);
  await db.query(
    "INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup) VALUES($1,$2,$3,2,'MEXC','BTC/USDT',$4,$5)",
    [
      oldSignal,
      owner,
      rule.id,
      { kind: "ENTRY", time: 1800000, referencePrice: 100 },
      oldSignal,
    ],
  );
  const historical = (await app.inject({ url: "/api/v1/signals", headers }))
    .json()
    .find((s: any) => s.id === oldSignal);
  assert.equal(historical.setup_market, "Spot");
  assert.equal(historical.setup_side, "SPOT");
  const share = await app.inject({
    method: "POST",
    url: "/api/v1/setup-shares",
    headers,
    payload: { ruleId: rule.id },
  });
  assert.equal(share.statusCode, 201, share.body);
  const shared = (
    await app.inject({
      url: "/api/v1/setup-shares/" + share.json().code,
      headers,
    })
  ).json().setup;
  assert.equal(shared.side, "BOTH");
  assert.equal(shared.mirrorShort, true);
  console.log(
    "Trade directions: separate same-bar signals, checkpoint dedup, delivery labels (mock transport), historical revision labels, required direction and share preservation passed",
  );
} finally {
  globalThis.fetch = originalFetch;
  if(originalEncryptionKey===undefined)delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY=originalEncryptionKey;
  await db.query("DELETE FROM deliveries WHERE destination_id=$1", [
    destination,
  ]);
  await db.query("DELETE FROM signals WHERE owner_id=$1", [owner]);
  for (const table of [
    "monitor_checkpoints",
    "monitor_status",
    "rule_revisions",
  ])
    await db.query(
      `DELETE FROM ${table} WHERE rule_id IN (SELECT id FROM rules WHERE owner_id=$1)`,
      [owner],
    );
  await db.query("DELETE FROM rules WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM destinations WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM sessions WHERE user_id=$1", [owner]);
  await db.query("DELETE FROM users WHERE id=$1", [owner]);
  await app.close();
  await db.end();
  await postgres.stop();
}
