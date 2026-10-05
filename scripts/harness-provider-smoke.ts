// Real provider, isolated database schema, synthetic public candles. Never live monitoring.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import ccxt from "ccxt";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { frames } from "../src/domain/engine.js";

if (process.env.RUN_PAID_EVALS !== "true" || !process.env.AI_API_KEY)
  throw new Error(
    "Real provider smoke requires configured AI and RUN_PAID_EVALS=true (four standard turns maximum).",
  );
(ccxt as any).binance = class {
  has = { fetchOHLCV: true };
  markets = { "BTC/USDT": { symbol: "BTC/USDT", active: true, spot: true } };
  async loadMarkets() {
    return this.markets;
  }
  async fetchOHLCV(
    _pair: string,
    frame: keyof typeof frames,
    since: number,
    limit: number,
  ) {
    const step = frames[frame],
      end = Math.floor(Date.now() / step) * step;
    return Array.from({ length: 600 }, (_, i) => {
      const close = 100 + i * 0.02 + Math.sin(i / 8) * 3;
      return [
        end - (600 - i) * step,
        close - 0.2,
        close + 1,
        close - 1,
        close,
        10 + (i % 9),
      ];
    })
      .filter((r) => r[0] >= since)
      .slice(0, limit);
  }
};
const postgres = await localDatabase(),
  admin = database(postgres.url),
  schema = "provider_smoke_" + Date.now();
await admin.query(`CREATE SCHEMA "${schema}"`);
const url = new URL(postgres.url);
url.searchParams.set("options", "-c search_path=" + schema);
const db = database(url.toString());
await migrate(db);
const { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  token = randomUUID(),
  headers = {
    host: "127.0.0.1:4173",
    "x-snaap-client": "web",
    cookie: "snaap_session=" + token,
  };
const draft = {
  schemaVersion: 2,
  name: "Provider smoke",
  exchange: ["Binance"],
  market: "Spot",
  pairs: ["BTC/USDT"],
  timeframe: "5m",
  entry: {
    kind: "COMPARE",
    op: ">",
    left: { kind: "PRICE", field: "close", timeframe: "1h" },
    right: { kind: "INDICATOR", name: "EMA", period: 50, timeframe: "1h" },
  },
  stages: [],
  cooldownBars: 0,
  destinations: [],
};
const results: any[] = [];
const run = async (
  name: string,
  text: string,
  extra: any = {},
  image = false,
) => {
  const conversation = (
    await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers,
      payload: { title: name },
    })
  ).json();
  if (image) {
    const id = randomUUID(),
      file = path.resolve(".local/audit", id + ".webp");
    await sharp(
      Buffer.from(
        '<svg width="600" height="240"><rect width="600" height="240" fill="#16161b"/><text x="32" y="90" fill="white" font-size="38">INDICATOR: EMA 50</text><text x="32" y="160" fill="white" font-size="28">TIMEFRAME: 1H</text></svg>',
      ),
    )
      .webp()
      .toFile(file);
    await db.query(
      "INSERT INTO assets(id,owner_id,name,mime,storage_path,metadata,purpose,conversation_id) VALUES($1,$2,'synthetic-chart.webp','image/webp',$3,$4,'chat',$5)",
      [id, owner, file, { width: 600, height: 240 }, conversation.id],
    );
    extra.imageIds = [id];
  }
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/conversations/${conversation.id}/turns`,
    headers,
    payload: { text, mode: "standard", ...extra },
  });
  const body = response.json();
  const run = (
    await db.query(
      "SELECT r.trace,l.estimated_usd,l.status FROM agent_runs r JOIN usage_ledger l ON l.id=r.id WHERE r.conversation_id=$1 ORDER BY r.created_at DESC LIMIT 1",
      [conversation.id],
    )
  ).rows[0];
  const record = {
    name,
    status: response.statusCode,
    result: body,
    trace: run?.trace,
    cost: run?.estimated_usd,
    ledger: run?.status,
  };
  results.push(record);
  await writeFile(
    process.env.HARNESS_SMOKE_READ_ONLY === "true"
      ? ".local/audit/harness-provider-read-only.json"
      : ".local/audit/harness-provider-smoke.json",
    JSON.stringify(
      { provider: "real", marketData: "synthetic fixtures", cases: results },
      null,
      2,
    ),
  );
  console.log(name, response.statusCode, "cost", run?.estimated_usd);
  return record;
};
try {
  await mkdir(".local/audit", { recursive: true });
  await db.query("INSERT INTO users(id) VALUES($1)", [owner]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')", [
    hash(token),
    owner,
  ]);
  const explain = await run(
    "read-only",
    "อธิบายว่าร่างนี้ใช้แท่ง 1H ร่วมกับรอบตรวจ 5m อย่างไร ไม่ต้องแก้เซตอัป",
    { draft },
  );
  assert.equal(explain.status, 200);
  assert.equal(explain.result.draft, null);
  assert.ok(explain.result.text.length > 20);
  assert.doesNotMatch(
    explain.result.text,
    />=|≥/,
    "Strict comparison must not be described as inclusive",
  );
  if (process.env.HARNESS_SMOKE_READ_ONLY === "true") {
    console.log(
      "PASS targeted real-provider read-only explanation preserves exact comparison and does not edit the draft",
    );
  } else {
    const edit = await run(
      "MACD edit",
      "เพิ่มเงื่อนไขเข้า MACD 12/26/9 ของ 5m ตัดขึ้น MACD Signal โดย AND กับเงื่อนไข EMA 50 ของ 1h เดิม คงค่าอื่นทั้งหมด ส่งร่างเข้า editor ไม่ต้อง replay",
      { draft },
    );
    assert.equal(edit.status, 200);
    assert.ok(edit.result.draft);
    assert.ok(edit.result.changes.length > 0);
    assert.equal(edit.result.draft.timeframe, "5m");
    assert.equal(edit.result.draft.name, draft.name);
    const entry = JSON.stringify(edit.result.draft.entry);
    assert.ok(
      entry.includes("MACD_SIGNAL") &&
        entry.includes("CROSS_ABOVE") &&
        entry.includes("EMA"),
    );
    const selectedBarTime =
      Math.floor(Date.now() / frames["5m"]) * frames["5m"] - 1;
    const inspect = await run(
      "inspect MTF",
      "ใช้ inspect_setup_bar ตรวจเงื่อนไขร่าง ณ แท่งที่เลือก แล้วอธิบายค่าจริงและเวลาแท่งอ้างอิงเป็น UTC ตามค่า ISO จากเครื่องมือ ไม่ต้องแก้เซตอัป",
      {
        draft,
        editorContext: {
          pair: "BTC/USDT",
          chartTimeframe: "4h",
          conditionPath: "entry",
          selectedBarTime,
        },
      },
    );
    assert.equal(inspect.status, 200);
    assert.equal(inspect.result.draft, null);
    assert.ok(
      inspect.trace.some(
        (item: any) =>
          item.tool === "inspect_setup_bar" &&
          item.result.bar?.time <= selectedBarTime,
      ),
    );
    const inspected = inspect.trace.find(
      (item: any) => item.tool === "inspect_setup_bar",
    ).result;
    for (const reference of inspected.references) {
      if (reference.closedAtIso)
        assert.ok(
          inspect.result.text.includes(reference.closedAtIso.slice(11, 16)),
          "Reported UTC reference time must match tool ISO evidence",
        );
    }
    const image = await run(
      "image read-only",
      "อ่านชื่ออินดิเคเตอร์ period และไทม์เฟรมจากภาพนี้ ไม่ต้องแก้เซตอัป",
      {},
      true,
    );
    assert.equal(image.status, 200);
    assert.equal(image.result.draft, null);
    assert.match(image.result.text, /EMA/i);
    assert.match(image.result.text, /50/);
    assert.equal(
      (await db.query("SELECT count(*) n FROM rules")).rows[0].n,
      "0",
    );
    console.log(
      "PASS four real-provider turns: read-only, MACD edit, MTF inspection, image reading; no saved or activated rules. Market evidence is fixture data.",
    );
  }
} finally {
  await app.close();
  await db.end();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
  await postgres.stop();
}
