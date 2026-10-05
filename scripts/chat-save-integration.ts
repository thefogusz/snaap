import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { buildPreset } from "../dist/preset-catalog.js";
import { diffSetup } from "../dist/setup-changes.js";
import { strategySchema } from "../src/domain/engine.js";

const postgres = await localDatabase();
const admin = new pg.Pool({ connectionString: postgres.url });
const schema = "chat_save_test_" + Date.now();
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({
  connectionString: postgres.url,
  options: `-c search_path=${schema}`,
});
await migrate(db);
const serve = process.argv.includes("--serve");
const { app } = await buildApp(db, {
  local: true,
  developerPro: true,
  monitoring: true,
  origin: "http://127.0.0.1:4175",
  validateMarket: async () => {},
  presetInstruments: async () => ({
    at: Date.now(),
    items: [{ symbol: "BTC/USDT", supported: true }],
  }),
});
const owner = serve ? "00000000-0000-4000-8000-000000000001" : randomUUID();
const other = randomUUID(),
  space = randomUUID(),
  otherSpace = randomUUID(),
  token = randomUUID(),
  otherToken = randomUUID();
const headers: Record<string, string> = {
  host: "127.0.0.1:4175",
  cookie: `snaap_session=${token}`,
  "x-snaap-client": "web",
  "x-snaap-workspace": space,
};
const outsider = {
  ...headers,
  cookie: `snaap_session=${otherToken}`,
  "x-snaap-workspace": "",
};
const spec = strategySchema.parse(
  buildPreset("rebound", {
    exchange: "Binance",
    market: "Spot",
    side: "SPOT",
    pair: "BTC/USDT",
    timeframe: "1h",
  }),
);
async function call(
  url: string,
  method: any = "GET",
  payload?: any,
  expected = 200,
  auth = headers,
) {
  const r = await app.inject({
    url: "/api/v1" + url,
    method,
    payload,
    headers: auth,
  });
  assert.equal(r.statusCode, expected, `${url}: ${r.body}`);
  return r.json();
}
// Explicit local browser fixture: never invokes a provider or sends notifications.
if (serve)
  app.addHook("preHandler", async (req, reply) => {
    if (req.url === "/api/v1/health")
      return reply.send({
        ai: true,
        monitoring: true,
        local: true,
        database: true,
        google: false,
        billing: false,
      });
    if (req.url.endsWith("/turns")) {
      const body = req.body as any;
      const id = req.url.split("/")[4];
      const draft = { ...spec, name: "รอ BTC ย่อตัว · ร่างจากแชท" };
      await db.query(
        "INSERT INTO messages(id,conversation_id,role,content) VALUES($1,$2,'user',$3)",
        [randomUUID(), id, body.text],
      );
      const changes = diffSetup(body.draft, draft);
      await db.query(
        "INSERT INTO messages(id,conversation_id,role,content,setup_changes) VALUES($1,$2,'assistant',$3,$4)",
        [
          randomUUID(),
          id,
          "เตรียมเงื่อนไขให้แล้ว ตรวจสรุปและบันทึกได้ด้านล่าง",
          JSON.stringify(changes),
        ],
      );
      return reply.send({
        text: "เตรียมเงื่อนไขให้แล้ว ตรวจสรุปและบันทึกได้ด้านล่าง",
        draft,
        changes,
      });
    }
    if (req.url.startsWith("/api/v1/instruments"))
      return reply.send({ items: [{ symbol: "BTC/USDT", supported: true }] });
    if (req.url === "/api/v1/preview")
      return reply
        .code(503)
        .send({ message: "ข้อมูลตลาดไม่ได้เปิดในชุดทดสอบแชท" });
  });
async function cleanup() {
  await app.close();
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
}
try {
  await db.query("INSERT INTO users(id,email) VALUES($1,$2),($3,$4)", [
    owner,
    "local@snaap.invalid",
    other,
    "other@snaap.invalid",
  ]);
  await db.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",
    [hash(token), owner, hash(otherToken), other],
  );
  await db.query(
    "INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$2,'Chat save',true),($3,$2,'Other',false)",
    [space, owner, otherSpace],
  );
  const conv = await call(
    "/conversations",
    "POST",
    { title: "บันทึกได้ในแชท" },
    201,
  );
  let draft = await call(`/conversations/${conv.id}/draft`, "PUT", {
    spec,
    expectedRevision: 0,
  });
  const cardUrl = `/conversations/${conv.id}/setup-card`;
  const card = await call(cardUrl, "POST", {
    expectedRevision: draft.draft_revision,
  });
  assert.equal(card.message.ui_card.type, "setup");
  assert.equal(
    (await call(cardUrl, "POST", { expectedRevision: draft.draft_revision }))
      .message.id,
    card.message.id,
  );
  await call(cardUrl, "POST", { expectedRevision: 0 }, 409);
  await call(cardUrl, "POST", { expectedRevision: draft.draft_revision }, 404, {
    ...headers,
    "x-snaap-workspace": otherSpace,
  });
  await call(
    cardUrl,
    "POST",
    { expectedRevision: draft.draft_revision },
    404,
    outsider,
  );
  const saveUrl = `/conversations/${conv.id}/setup-card/${card.message.id}/save`;
  let saved = await call(saveUrl, "POST", {
    expectedRevision: draft.draft_revision,
    destinations: [],
  });
  assert.equal(saved.rule.active, false);
  const firstId = saved.rule.id;
  saved = await call(saveUrl, "POST", {
    expectedRevision: saved.draft_revision,
    destinations: [],
  });
  assert.equal(saved.rule.id, firstId);
  assert.equal(saved.rule.revision, 1);
  await call(
    saveUrl,
    "POST",
    { expectedRevision: saved.draft_revision, destinations: [] },
    409,
    outsider,
  );
  const history = await call(`/conversations/${conv.id}/messages`);
  assert.equal(history[0].ui_card.ruleId, firstId);
  const editedRule = await call(`/rules/${firstId}`, "PUT", {
    expectedRevision: 1, spec: {...spec, name: "แก้เซ็ตอัพจากภายนอกแชท"},
  });
  const changed = { ...spec, name: "แก้จากแชท" };
  draft = await call(`/conversations/${conv.id}/draft`, "PUT", {
    spec: changed,
    expectedRevision: saved.draft_revision,
  });
  const next = await call(cardUrl, "POST", {
    expectedRevision: draft.draft_revision,
  });
  assert.equal(next.message.ui_card.ruleId, firstId);
  await call(
    saveUrl,
    "POST",
    { expectedRevision: draft.draft_revision, destinations: [] },
    409,
  );
  const nextUrl = `/conversations/${conv.id}/setup-card/${next.message.id}/save`;
  await call(
    nextUrl,
    "POST",
    {
      expectedRevision: draft.draft_revision,
      expectedRuleRevision: 1,
      destinations: [],
    },
    409,
  );
  saved = await call(nextUrl, "POST", {
    expectedRevision: draft.draft_revision,
    expectedRuleRevision: editedRule.revision,
    destinations: [],
  });
  assert.equal(saved.rule.id, firstId);
  assert.equal("risk_plan" in saved.rule, false);
  assert.equal(saved.rule.revision, 3);
  await call(`/rules/${firstId}/activation`, "POST", {
    active: true,
    expectedRevision: 3,
    confirmation: "ACTIVATE",
  });
  await call(`/rules/${firstId}/activation`, "POST", {
    active: false,
    expectedRevision: 3,
    confirmation: "PAUSE",
  });
  const unrelated = await call("/rules", "POST", spec, 201, {
    ...headers,
    "x-snaap-workspace": otherSpace,
  });
  await call(
    cardUrl,
    "POST",
    { expectedRevision: saved.draft_revision, ruleId: unrelated.id },
    404,
  );
  // Saving through the advanced editor keeps the durable chat binding too.
  const second = await call(
    "/conversations",
    "POST",
    { title: "Advanced editor" },
    201,
  );
  await call(`/conversations/${second.id}/draft`, "PUT", {
    spec,
    expectedRevision: 0,
  });
  await call(`/conversations/${second.id}/setup-card`, "POST", {
    expectedRevision: 1,
  });
  const editor = await call(
    "/rules",
    "POST",
    { spec, conversationId: second.id },
    201,
  );
  assert.equal(
    (await call(`/conversations/${second.id}/messages`))[0].ui_card.ruleId,
    editor.id,
  );
  const preset = await call(`/conversations/${second.id}/preset`, "POST", {
    presetId: "cross",
    exchange: "Binance",
    market: "Spot",
    side: "SPOT",
    pair: "BTC/USDT",
    timeframe: "1h",
    expectedRevision: 1,
  });
  const presetSaved = await call(
    `/conversations/${second.id}/preset/${preset.message.id}/save`,
    "POST",
    { expectedRevision: preset.draft_revision, destinations: [] },
  );
  assert.notEqual(
    presetSaved.rule.id,
    editor.id,
    "choosing a new preset creates its own setup",
  );
  const refined = { ...preset.spec, name: "ปรับพรีเซ็ตผ่านแชท" };
  const refinedDraft = await call(`/conversations/${second.id}/draft`, "PUT", {
    spec: refined,
    expectedRevision: presetSaved.draft_revision,
  });
  const refinedCard = await call(
    `/conversations/${second.id}/setup-card`,
    "POST",
    { expectedRevision: refinedDraft.draft_revision },
  );
  assert.equal(refinedCard.message.ui_card.ruleId, presetSaved.rule.id);
  const simultaneousUrl = `/conversations/${second.id}/setup-card/${refinedCard.message.id}/save`;
  const simultaneous = await Promise.all(
    Array.from({ length: 3 }, () =>
      app.inject({
        url: "/api/v1" + simultaneousUrl,
        method: "POST",
        headers,
        payload: {
          expectedRevision: refinedDraft.draft_revision,
          expectedRuleRevision: presetSaved.rule.revision,
          destinations: [],
        },
      }),
    ),
  );
  assert.deepEqual(
    simultaneous.map((r) => r.statusCode).sort(),
    [200, 409, 409],
  );
  assert.equal(
    simultaneous.find((r) => r.statusCode === 200)!.json().rule.id,
    presetSaved.rule.id,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM usage_ledger")).rows[0].n,
    0,
  );
  console.log(
    "PASS: chat save, retry deduplication, history, existing rule revisions, activation/pause, superseded cards, owner/workspace isolation, editor binding, zero AI calls",
  );
  if (serve) {
    await app.listen({ host: "127.0.0.1", port: 4175 });
    console.log("Chat fixture http://127.0.0.1:4175");
    for (const event of ["SIGINT", "SIGTERM"] as const)
      process.once(event, () => void cleanup().then(() => process.exit(0)));
  } else await cleanup();
} catch (error) {
  await cleanup();
  throw error;
}
