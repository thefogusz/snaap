import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { localDatabase } from "./postgres.js";
import { database } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
if (process.env.RUN_PAID_EVALS !== "1")
  throw new Error(
    "This audit calls the configured AI provider. Set RUN_PAID_EVALS=1 to run it.",
  );
const pg = await localDatabase(),
  db = database(pg.url),
  { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  token = randomUUID();
const headers = {
  host: "127.0.0.1:4173",
  "x-snaap-client": "web",
  cookie: "snaap_session=" + token,
};
const spec = {
  schemaVersion: 2,
  name: "UX long chat fixture",
  exchange: ["Binance"],
  market: "Spot",
  side: "SPOT",
  pairs: ["BTC/USDT"],
  timeframe: "1h",
  entry: {
    kind: "COMPARE",
    op: ">",
    left: { kind: "PRICE", field: "close", timeframe: "1h" },
    right: { kind: "INDICATOR", name: "EMA", period: 200, timeframe: "1h" },
  },
  stages: [],
  cooldownBars: 5,
  destinations: [],
};
try {
  await db.query("INSERT INTO users(id) VALUES($1)", [owner]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '1 day')",
    [owner],
  );
  const seed = async (user: string) => {
    const id = randomUUID();
    await db.query(
      "INSERT INTO conversations(id,owner_id,title,draft) VALUES($1,$2,$3,$4)",
      [id, user, "UX audit · 240 messages", spec],
    );
    for (let i = 0; i < 240; i++)
      await db.query(
        "INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES($1,$2,$3,$4,now()-interval '1 day'+$5*interval '1 second')",
        [
          randomUUID(),
          id,
          i % 2 ? "assistant" : "user",
          `ข้อความจำลอง ${i + 1} · สำหรับทดสอบประวัติยาวและการเลื่อน\n${"ข้อมูลจำลอง ไม่ใช่คำแนะนำการลงทุน ".repeat(5)}`,
          i,
        ],
      );
    return id;
  };
  const id = await seed(owner);
  const page = (
    await app.inject({
      method: "GET",
      url: `/api/v1/conversations/${id}/messages`,
      headers,
    })
  ).json();
  assert.equal(page.length, 200);
  const older = (
    await app.inject({
      method: "GET",
      url: `/api/v1/conversations/${id}/messages?before=${page[0].id}`,
      headers,
    })
  ).json();
  assert.equal(older.length, 40);
  assert.equal(new Set([...older, ...page].map((m) => m.id)).size, 240);
  const start = Date.now();
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/conversations/${id}/turns`,
    headers,
    payload: {
      text: "เปลี่ยน cooldown จาก 5 เป็น 7 แท่งอย่างเดียว รักษาชื่อ entry EMA 200 timeframe 1h และทุกค่าเดิม ส่งร่างเข้า editor",
      mode: "standard",
      selection: { ruleIds: [], importIds: [] },
      imageIds: [],
      draft: spec,
    },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json().draft, { ...spec, cooldownBars: 7 });
  const localOwner = "00000000-0000-4000-8000-000000000001";
  const uiId = await seed(localOwner);
  await mkdir(".local/audit", { recursive: true });
  await writeFile(
    ".local/audit/long-chat-results.json",
    JSON.stringify(
      {
        messages: 240,
        pagination: [200, 40],
        status: response.statusCode,
        ms: Date.now() - start,
        exactDraftPreserved: true,
        uiId,
        conversation: id,
        result: response.json(),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS 240-message pagination, real provider edit preserves all other draft fields; UI fixture created",
  );
} finally {
  await app.close();
  await db.end();
  await pg.stop();
}
