// Isolated browser fixture. No monitor workers, model requests or external deliveries.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { buildApp } from "../src/api.js";
const postgres = await localDatabase();
const schema = "flex_ui_" + randomUUID().replaceAll("-", "");
const admin = new pg.Pool({ connectionString: postgres.url });
await admin.query(`CREATE SCHEMA "${schema}"`);
const db = new pg.Pool({
  connectionString: postgres.url,
  options: `-c search_path=${schema}`,
});
await migrate(db);
delete process.env.AI_API_KEY;
const { app } = await buildApp(db, {
  local: true,
  developerPro: true,
  monitoring: false,
  origin: "http://127.0.0.1:4188",
});
const login = await app.inject({
  method: "POST",
  url: "/api/v1/auth/local",
  headers: { host: "127.0.0.1:4188", "x-snaap-client": "web" },
});
const cookie = login.headers["set-cookie"] as string;
const me = await app.inject({
  url: "/api/v1/me",
  headers: { host: "127.0.0.1:4188", cookie: cookie.split(";")[0] },
});
const owner = me.json().id;
const entry = {
  kind: "GROUP",
  op: "AND",
  children: [
    ...(["4h", "1h", "15m"] as const).flatMap((timeframe) =>
      [12, 26, 50].map((period) => ({
        kind: "COMPARE",
        op: ">",
        left: { kind: "PRICE", field: "close", timeframe },
        right: { kind: "INDICATOR", name: "EMA", period, timeframe },
      })),
    ),
    ...[
      ["MACD", "MACD_SIGNAL"],
      ["STOCH_RSI_K", "STOCH_RSI_D"],
    ].map(([left, right]) => ({
      kind: "COMPARE",
      op: "CROSS_ABOVE",
      left: {
        kind: "INDICATOR",
        name: left,
        period: left === "MACD" ? 12 : 14,
        timeframe: "5m",
      },
      right: {
        kind: "INDICATOR",
        name: right,
        period: left === "MACD" ? 12 : 14,
        timeframe: "5m",
      },
    })),
  ],
};
const spec = {
  schemaVersion: 2,
  name: "เทรนด์ 3TF + ย่อ 5m (Long/Short)",
  exchange: ["MEXC"],
  market: "Perpetual Futures",
  side: "BOTH",
  mirrorShort: true,
  pairs: [
    "BTC/USDT",
    "ZEC/USDT",
    "ETH/USDT",
    "SOL/USDT",
    "XRP/USDT",
    "QNT/USDT",
    "DOGE/USDT",
    "SUI/USDT",
    "NEAR/USDT",
    "PEPE/USDT",
  ],
  timeframe: "5m",
  entry,
  stages: [],
  cooldownBars: 0,
  destinations: [],
};
const created = await app.inject({
  method: "POST",
  url: "/api/v1/rules",
  headers: {
    host: "127.0.0.1:4188",
    "x-snaap-client": "web",
    cookie: cookie.split(";")[0],
  },
  payload: spec,
});
if (created.statusCode !== 201) throw new Error(created.body);
await db.query("UPDATE rules SET active=true,activated_at=now() WHERE id=$1", [
  created.json().id,
]);
await app.listen({ host: "127.0.0.1", port: 4188 });
console.log("Isolated flexibility browser fixture: http://127.0.0.1:4188");
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    await app.close();
    await db.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    await postgres.stop();
    process.exit(0);
  });
