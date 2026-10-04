import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { registerPresets } from "../src/presets.js";
import { buildPreset } from "../dist/preset-catalog.js";
import { strategySchema } from "../src/domain/engine.js";

const postgres = await localDatabase(), db = database(postgres.url);
await migrate(db);
const owner = randomUUID(), other = randomUUID(), token = randomUUID();
const { app } = await buildApp(db, { local: true, validateMarket: async () => {} });
const presetApp = Fastify();
presetApp.addHook("preHandler", async req => { req.userId = owner; });
registerPresets(presetApp, db, { instruments: async () => ({
  items: [{ symbol: "BTC/USDT", supported: true }], at: new Date().toISOString(),
}) as any });
const headers = { host: "127.0.0.1:4173", "x-snaap-client": "web", cookie: `snaap_session=${token}` };
const spec = strategySchema.parse(buildPreset("trend", { exchange: "Binance", market: "Spot", side: "SPOT", pair: "BTC/USDT", timeframe: "15m" }));
async function call(method: "GET" | "POST" | "PUT", url: string, payload?: Record<string, unknown>) {
  const response = await app.inject({ method, url, headers, payload });
  assert.ok(response.statusCode < 300, response.body);
  return response.json();
}
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [hash(token), owner]);
  const conversation = await call("POST", "/api/v1/conversations", { title: "เซตอัพใหม่" });
  await call("PUT", `/api/v1/conversations/${conversation.id}/draft`, { spec, expectedRevision: 0 });
  let list = await call("GET", "/api/v1/conversations");
  assert.equal(list[0].title, "เซตอัพใหม่", "An unsaved draft must not rename a chat");
  const rule = await call("POST", "/api/v1/rules", { spec, conversationId: conversation.id });
  list = await call("GET", "/api/v1/conversations");
  assert.equal(list[0].title, spec.name, "Saving from the editor must update the title");
  const renamed = { ...spec, name: "ชื่อเซตอัปที่แก้ไข" };
  await call("PUT", `/api/v1/rules/${rule.id}`, { spec: renamed, expectedRevision: 1, conversationId: conversation.id });
  assert.equal((await call("GET", "/api/v1/conversations"))[0].title, renamed.name);
  const conflict = await app.inject({ method: "PUT", url: `/api/v1/rules/${rule.id}`, headers,
    payload: { spec: { ...spec, name: "ชื่อที่ห้ามบันทึก" }, expectedRevision: 1, conversationId: conversation.id } });
  assert.equal(conflict.statusCode, 409);
  assert.equal((await call("GET", "/api/v1/conversations"))[0].title, renamed.name);

  const presetConversation = randomUUID(), message = randomUUID();
  await db.query("INSERT INTO conversations(id,owner_id,title,draft,draft_revision) VALUES($1,$2,'เซตอัพใหม่',$3,1)", [presetConversation, owner, spec]);
  await db.query("INSERT INTO messages(id,conversation_id,role,content,ui_card) VALUES($1,$2,'assistant','preset',$3)", [message, presetConversation, { type: "preset", presetId: "trend", spec, ruleId: null }]);
  const saved = await presetApp.inject({ method: "POST", url: `/api/v1/conversations/${presetConversation}/preset/${message}/save`, payload: { expectedRevision: 1, destinations: [] } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal((await db.query("SELECT title FROM conversations WHERE id=$1", [presetConversation])).rows[0].title, spec.name);
  await db.query("UPDATE conversations SET title='เซตอัพใหม่' WHERE id=$1", [presetConversation]);
  list = await call("GET", "/api/v1/conversations");
  assert.equal(list.find((row: any) => row.id === presetConversation).title, spec.name, "Previously saved placeholders get a display fallback");
  const otherConversation = randomUUID();
  await db.query("INSERT INTO conversations(id,owner_id,title,draft,setup_saved_at) VALUES($1,$2,'เซตอัพใหม่',$3,now())", [otherConversation, other, spec]);
  assert.ok(!(await call("GET", "/api/v1/conversations")).some((row: any) => row.id === otherConversation));
  console.log("Passed: editor save, rename, failed save rollback, preset save, legacy names, unsaved chats, owner isolation");
} finally {
  await presetApp.close(); await app.close();
  await db.query("DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE owner_id=ANY($1::uuid[]))", [[owner, other]]);
  await db.query("DELETE FROM conversations WHERE owner_id=ANY($1::uuid[])", [[owner, other]]);
  await db.query("DELETE FROM rule_revisions WHERE rule_id IN (SELECT id FROM rules WHERE owner_id=$1)", [owner]);
  await db.query("DELETE FROM rules WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM sessions WHERE user_id=$1", [owner]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [[owner, other]]);
  await db.end(); await postgres.stop();
}
