import { promptText } from "./provider-request.js";
import { lastClosedBoundary } from "../dist/timeframes.js";
// Local, isolated interaction fixture. No exchange calls, real AI or monitoring.
import http from "node:http";
import { randomUUID } from "node:crypto";
import ccxt from "ccxt";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp } from "../src/api.js";
import { frames } from "../src/domain/engine.js";

(ccxt as any).binance = class {
  has = { fetchOHLCV: true };
  markets = Object.fromEntries(
    ["BTC/USDT", "ETH/USDT"].map((symbol) => [
      symbol,
      { symbol, active: true, spot: true },
    ]),
  );
  async loadMarkets() {
    return this.markets;
  }
  async fetchOHLCV(
    _symbol: string,
    frame: keyof typeof frames,
    since: number,
    limit: number,
  ) {
    const step = frames[frame],
      end = lastClosedBoundary(Date.now(), frame);
    return Array.from({ length: 2400 }, (_, i) => {
      const close = 100 + Math.sin(i / 9) * 8 + i * 0.01;
      return [
        end - (2400 - i) * step,
        close - 1,
        close + 2,
        close - 2,
        close,
        1000 + i,
      ];
    })
      .filter((r) => r[0] >= since)
      .slice(0, limit);
  }
};
const provider = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const last = body.input?.findLast(
    (m: any) => m.type === "function_call_output",
  );
  let output: any[];
  if (last) {
    output = [
      {
        id: "msg_" + randomUUID(),
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "ปรับร่างแล้ว ตรวจเงื่อนไขที่เปลี่ยนและกราฟก่อนบันทึก",
          },
        ],
      },
    ];
  } else {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const raw = promptText(body)
      .split("Current editable draft (not activated): ")[1]
      ?.split("\n")[0];
    const spec = JSON.parse(raw ?? "null");
    if (spec) {
      spec.cooldownBars = 7;
      output = [
        {
          id: "fc_" + randomUUID(),
          type: "function_call",
          call_id: "call_" + randomUUID(),
          name: "propose_strategy",
          arguments: JSON.stringify({ spec }),
          status: "completed",
        },
      ];
    } else
      output = [
        {
          id: "msg_" + randomUUID(),
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            { type: "output_text", text: "เลือกเซ็ตอัพก่อนเริ่มปรับร่าง" },
          ],
        },
      ];
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "resp_" + randomUUID(),
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model: "fixture",
      status: "completed",
      output,
      usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
    }),
  );
});
await new Promise<void>((resolve) =>
  provider.listen(4191, "127.0.0.1", resolve),
);
process.env.AI_BASE_URL = "http://127.0.0.1:4191/v1";
process.env.AI_API_KEY = "local-fixture";
process.env.AI_STANDARD_INPUT_USD_PER_MILLION = "0.25";
process.env.AI_STANDARD_OUTPUT_USD_PER_MILLION = "2";
process.env.AI_STANDARD_MAX_USD = "0.03";
const postgres = await localDatabase();
const admin = database(postgres.url),
  schema = "studio_ui_" + Date.now();
await admin.query(`CREATE SCHEMA "${schema}"`);
const url = new URL(postgres.url);
url.searchParams.set("options", "-c search_path=" + schema);
const db = database(url.toString());
await migrate(db);
const { app } = await buildApp(db, {
  local: true,
  developerPro: true,
  // Expose activation readiness; this fixture never starts a monitor worker.
  monitoring: true,
  origin: "http://127.0.0.1:4189",
});
await app.listen({ host: "127.0.0.1", port: 4189 });
console.log(
  "Studio fixture: http://127.0.0.1:4189 (isolated DB, synthetic candles and AI)",
);
for (const event of ["SIGINT", "SIGTERM"] as const)
  process.once(event, async () => {
    await app.close();
    await db.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    await postgres.stop();
    provider.close();
    process.exit(0);
  });
