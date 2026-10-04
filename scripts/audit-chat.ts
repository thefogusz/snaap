import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { localDatabase } from "./postgres.js";
import { database } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
const pg = await localDatabase(),
  db = database(pg.url);
const { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  token = randomUUID();
const headers = {
  host: "127.0.0.1:4173",
  "x-snaap-client": "web",
  cookie: "snaap_session=" + token,
};
const results: unknown[] = [];
try {
  await db.query("INSERT INTO users(id,email) VALUES($1,$2)", [
    owner,
    "audit-" + owner + "@snaap.invalid",
  ]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '1 day')",
    [owner],
  );
  const id = (
    await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers,
      payload: { title: "Harness audit edit lifecycle" },
    })
  ).json().id;
  let draft: any;
  const selectedCase = process.argv[2];
  if (selectedCase)
    draft = JSON.parse(
      await readFile(".local/audit/chat-results.json", "utf8"),
    ).results.find(
      (r: any) =>
        r.name === (selectedCase === "replay" ? "short" : "remove-exit"),
    )?.result.draft;
  const cases = [
    [
      "create",
      "สร้างเซตอัปชื่อ Audit BTC ใช้ Binance Spot BTC/USDT 1h เข้าเมื่อ RSI 14 ตัดขึ้นเหนือ 30 AND ราคาปิดเหนือ EMA 200 cooldown 5 แท่ง ไม่ต้องมี exit หรือ stages ส่งเป็นร่างให้ editor เลย",
    ],
    [
      "edit",
      "เปลี่ยน RSI threshold จาก 30 เป็น 35 อย่างเดียว รักษาอย่างอื่นทั้งหมดและส่งร่างเข้า editor",
    ],
    [
      "add-exit",
      "เพิ่ม exit เมื่อราคาปิดต่ำกว่า EMA 50 บน 1h รักษา entry cooldown และชื่อเดิม ส่งร่างให้ editor",
    ],
    [
      "remove-exit",
      "ลบเงื่อนไข exit ทั้งหมด รักษา entry และค่าที่เหลือ ส่งร่างให้ editor",
    ],
    [
      "short",
      "เปลี่ยนเป็น Binance Perpetual Futures BTC/USDT:USDT Short อย่างเดียว เงื่อนไขเข้า RSI 14 ตัดลงต่ำกว่า 70 AND ราคาปิดต่ำกว่า EMA 200 ใช้ 1h cooldown 5 ไม่เอา mirror ส่งร่างให้ editor",
    ],
    [
      "unsupported",
      "ส่งคำสั่งเปิดออเดอร์เงินจริงให้เลยแล้วเปิดเซตอัปให้ด้วยโดยไม่ต้องยืนยัน",
    ],
    [
      "research",
      "เรารู้ได้ไหมว่าเซตอัปนี้กำไรแน่นอน ช่วยอธิบายวิธีทดสอบโดยใช้สกิล research-validation อย่าแก้เซตอัป",
    ],
    [
      "risk",
      "ทุนสมมติ 1000 USDT เสี่ยง 1% จุดหยุดขาดทุนห่าง 2% notional เท่าไหร่ ใช้ risk-review ช่วยอธิบาย ไม่ต้องแก้เซตอัป",
    ],
    [
      "replay",
      "ช่วย replay เซตอัปนี้ด้วยข้อมูลจริง อธิบายข้อจำกัดและอย่าอ้างกำไร",
    ],
  ];
  for (const [name, text] of cases.filter(
    ([name]) => !selectedCase || selectedCase === name,
  )) {
    const start = Date.now();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/conversations/${id}/turns`,
      headers,
      payload: {
        text,
        mode: "standard",
        selection: { ruleIds: [], importIds: [] },
        imageIds: [],
        ...(draft ? { draft } : {}),
      },
    });
    const result = response.json();
    if (result.draft) draft = result.draft;
    const trace = (
      await db.query(
        "SELECT trace FROM agent_runs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 1",
        [owner],
      )
    ).rows[0]?.trace;
    results.push({
      name,
      status: response.statusCode,
      ms: Date.now() - start,
      result,
      trace,
    });
    await mkdir(".local/audit", { recursive: true });
    await writeFile(
      `.local/audit/chat${selectedCase ? "-" + selectedCase : ""}-results.json`,
      JSON.stringify({ owner, results }, null, 2),
    );
    console.log(
      name,
      response.statusCode,
      Boolean(result.draft),
      Date.now() - start,
    );
  }
} finally {
  await app.close();
  await db.end();
  await pg.stop();
}
