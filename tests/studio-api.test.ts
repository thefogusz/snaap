import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type pg from "pg";
import ccxt from "ccxt";
import { registerMarkets } from "../src/markets.js";
import { frames } from "../src/domain/engine.js";
let fetched = 0;
(ccxt as any).binance = class {
  has = { fetchOHLCV: true };
  markets = { "STUDIO/USDT": { active: true, spot: true } };
  async loadMarkets() {
    return this.markets;
  }
  async fetchOHLCV(
    _symbol: string,
    frame: keyof typeof frames,
    since: number,
    limit: number,
  ) {
    fetched++;
    const step = frames[frame],
      end = Math.floor(Date.now() / step) * step;
    return Array.from({ length: 600 }, (_, i) => [
      end - (600 - i) * step,
      100,
      102,
      98,
      100 + i * 0.01,
      10,
    ])
      .filter((r) => r[0] >= since)
      .slice(0, limit);
  }
};
test("preview API loads a new chart timeframe without changing strategy events", async () => {
  const app = Fastify();
  registerMarkets(app, {} as pg.Pool, false);
  const spec = {
    schemaVersion: 2,
    name: "Studio",
    exchange: ["Binance"],
    market: "Spot",
    pairs: ["STUDIO/USDT"],
    timeframe: "5m",
    entry: {
      kind: "COMPARE",
      op: ">",
      left: { kind: "PRICE", field: "close", timeframe: "5m" },
      right: { kind: "CONSTANT", value: 100 },
    },
    stages: [],
    cooldownBars: 0,
    destinations: [],
  };
  try {
    const original = await app.inject({
      method: "POST",
      url: "/api/v1/preview",
      payload: { spec },
    });
    assert.equal(original.statusCode, 200);
    const viewed = await app.inject({
      method: "POST",
      url: "/api/v1/preview",
      payload: {
        spec,
        chartTimeframe: "4h",
        indicators: [
          { kind: "INDICATOR", name: "RSI", period: 14, timeframe: "4h" },
        ],
      },
    });
    assert.equal(viewed.statusCode, 200);
    const data = viewed.json();
    assert.equal(data.chartTimeframe, "4h");
    assert.equal(data.evaluationTimeframe, "5m");
    assert.ok(data.candles.length);
    assert.deepEqual(data.timeline, original.json().timeline);
    assert.deepEqual(data.events, original.json().events);
    assert.ok(data.overlays.every((o: any) => o.operand.timeframe === "4h"));
    const beforeInvalid = fetched;
    const invalidFrame = await app.inject({
      method: "POST",
      url: "/api/v1/preview",
      payload: {
        spec,
        chartTimeframe: "4h",
        indicators: [
          { kind: "INDICATOR", name: "RSI", period: 14, timeframe: "5m" },
        ],
      },
    });
    assert.notEqual(invalidFrame.statusCode, 200);
    const invalidParams = await app.inject({
      method: "POST",
      url: "/api/v1/preview",
      payload: {
        spec,
        chartTimeframe: "4h",
        indicators: [
          {
            kind: "INDICATOR",
            name: "MACD",
            period: 26,
            slow: 12,
            timeframe: "4h",
          },
        ],
      },
    });
    assert.notEqual(invalidParams.statusCode, 200);
    assert.equal(
      fetched,
      beforeInvalid,
      "invalid chart operands are rejected before fetching market data",
    );
  } finally {
    await app.close();
  }
});
