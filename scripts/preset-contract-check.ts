import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
const postgres = await localDatabase(),
  db = database(postgres.url);
await migrate(db);
const owner = randomUUID(),
  workspace = randomUUID(),
  token = randomBytes(32).toString("hex");
await db.query("INSERT INTO users(id,email) VALUES($1,$2)", [
  owner,
  "preset-contract@snaap.invalid",
]);
await db.query(
  "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
  [hash(token), owner],
);
await db.query(
  "INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$2,'Preset contract test',true)",
  [workspace, owner],
);
const { app } = await buildApp(db, {
  monitoring: true,
  validateMarket: async () => {},
});
const headers = {
  host: "127.0.0.1:4173",
  cookie: `snaap_session=${token}`,
  "x-snaap-client": "web",
  "x-snaap-workspace": workspace,
};
async function call(
  url: string,
  method: "GET" | "POST" | "PUT",
  payload?: unknown,
  expected = 200,
) {
  const r = await app.inject({
    url: "/api/v1" + url,
    method,
    headers,
    payload: payload as any,
  });
  assert.equal(r.statusCode, expected, `${url}: ${r.body}`);
  return r.json();
}
try {
  const conv = await call(
    "/conversations",
    "POST",
    { title: "Preset contract" },
    201,
  );
  const input = {
    presetId: "rebound",
    exchange: "Binance",
    market: "Perpetual Futures",
    side: "BOTH",
    pair: "BTC/USDT",
    timeframe: "15m",
    expectedRevision: 0,
  };
  const draft = await call(`/conversations/${conv.id}/preset`, "POST", input);
  assert.equal(draft.spec.short.entry.right.value, 70);
  assert.ok(draft.message.content.includes("เข้า Short"));
  await call(`/conversations/${conv.id}/preset`, "POST", input, 409);
  const saveUrl = `/conversations/${conv.id}/preset/${draft.message.id}/save`;
  const saved = await call(saveUrl, "POST", {
    expectedRevision: draft.draft_revision,
    destinations: [],
  });
  const repeated = await call(saveUrl, "POST", {
    expectedRevision: saved.draft_revision,
    destinations: [],
  });
  assert.equal(saved.rule.id, repeated.rule.id);
  assert.equal(repeated.rule.revision, 1);
  const rows = await call(`/conversations/${conv.id}/messages`, "GET");
  assert.equal(rows[0].ui_card.ruleId, saved.rule.id);
  await call(`/rules/${saved.rule.id}/activation`, "POST", {
    active: true,
    expectedRevision: 1,
    confirmation: "ACTIVATE",
  });
  await call(`/rules/${saved.rule.id}/activation`, "POST", {
    active: false,
    expectedRevision: 1,
    confirmation: "PAUSE",
  });
  const newer = await call(`/conversations/${conv.id}/preset`, "POST", {
    ...input,
    presetId: "cross",
    expectedRevision: repeated.draft_revision,
  });
  await call(
    saveUrl,
    "POST",
    { expectedRevision: newer.draft_revision, destinations: [] },
    409,
  );
  const usage = await db.query(
    "SELECT count(*)::int AS n FROM usage_ledger WHERE owner_id=$1",
    [owner],
  );
  assert.equal(usage.rows[0].n, 0);
  const other = randomUUID();
  await call(`/conversations/${other}/preset`, "POST", input, 404);
  console.log(
    "PASS: durable cards, actual save, idempotency, conflicts, BOTH thresholds, activation/pause, zero LLM ledger, owner scope",
  );
} finally {
  await app.close();
  await db.query(
    "DELETE FROM monitor_checkpoints WHERE rule_id IN (SELECT id FROM rules WHERE owner_id=$1)",
    [owner],
  );
  await db.query(
    "DELETE FROM rule_revisions WHERE rule_id IN (SELECT id FROM rules WHERE owner_id=$1)",
    [owner],
  );
  await db.query("DELETE FROM rules WHERE owner_id=$1", [owner]);
  await db.query(
    "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE owner_id=$1)",
    [owner],
  );
  await db.query("DELETE FROM conversations WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM sessions WHERE user_id=$1", [owner]);
  await db.query("DELETE FROM workspaces WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM users WHERE id=$1", [owner]);
  await db.end();
  await postgres.stop();
}
