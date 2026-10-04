import { instruments } from "../src/markets.js";
import { writeFile } from "node:fs/promises";
const results = await Promise.all(
  ["Binance", "Bybit", "OKX", "Bitget", "MEXC"].flatMap((exchange) =>
    ["Spot", "Perpetual Futures"].map(async (market) => {
      const started = Date.now();
      try {
        const data = await instruments(exchange as any, market, true);
        return {
          exchange,
          market,
          at: new Date(data.at).toISOString(),
          count: data.items.length,
          supported: data.items.filter((x) => x.supported).length,
          btc: data.items.find((x) => x.symbol === "BTC/USDT"),
          elapsedMs: Date.now() - started,
        };
      } catch (e) {
        return { exchange, market, error: (e as Error).message };
      }
    }),
  ),
);
await writeFile(
  ".local/audit/catalog-results.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
