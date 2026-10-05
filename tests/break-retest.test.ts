import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPreset } from "../dist/preset-catalog.js";
import {
  strategySchema,
  frames,
  advance,
  emptyLifecycle,
  replay,
  type Candle,
} from "../src/domain/engine.js";
for (const side of ["SPOT", "LONG", "SHORT"])
  test(`break/retest ${side} waits for distinct bars and matches live/replay`, () => {
    const spec = strategySchema.parse(
      buildPreset("break-retest", {
        exchange: "Binance",
        market: side === "SPOT" ? "Spot" : "Perpetual Futures",
        side,
        pair: "BTC/USDT",
        timeframe: "1h",
        level: 100,
      }),
    );
    const short = side === "SHORT";
    const closes = short ? [101, 99, 99, 99] : [99, 101, 101, 101];
    const candles: Candle[] = closes.map((close, i) => ({
      time: (i + 1) * frames["1h"],
      open: close,
      close,
      high: short ? (i === 2 ? 100 : close + 0.5) : close + 0.5,
      low: short ? close - 0.5 : i === 2 ? 100 : close - 0.5,
      volume: 1,
    }));
    let state = emptyLifecycle();
    const actual = [];
    for (let i = 0; i < candles.length; i++) {
      const next = advance(
        spec,
        { "1h": candles.slice(0, i + 1) },
        candles[i],
        state,
      );
      state = next.state;
      actual.push(...next.events);
      if (i < 3) assert.equal(next.events.length, 0);
    }
    assert.equal(actual.length, 1);
    assert.equal(actual[0].kind, "ENTRY");
    assert.equal(actual[0].time, 4 * frames["1h"]);
    assert.deepEqual(actual, replay(spec, { "1h": candles }));
  });
test("break/retest expires only after the final allowed retest bar", () => {
  const spec = strategySchema.parse(
    buildPreset("break-retest", {
      exchange: "Binance",
      market: "Spot",
      side: "SPOT",
      pair: "BTC/USDT",
      timeframe: "1h",
      level: 100,
    }),
  );
  const candles = Array.from({ length: 13 }, (_, i) => ({
    time: (i + 1) * frames["1h"],
    open: i ? 102 : 99,
    close: i ? 102 : 99,
    high: i ? 103 : 99.5,
    low: i ? 101 : 98,
    volume: 1,
  }));
  assert.equal(replay(spec, { "1h": candles.slice(0, 12) }).length, 0);
  assert.equal(replay(spec, { "1h": candles })[0].kind, "EXPIRED");
  assert.throws(() =>
    buildPreset("break-retest", {
      exchange: "Binance",
      market: "Perpetual Futures",
      side: "BOTH",
      pair: "BTC/USDT",
      level: 100,
    }),
  );
  assert.throws(() =>
    buildPreset("break-retest", {
      exchange: "Binance",
      market: "Spot",
      side: "SPOT",
      pair: "BTC/USDT",
    }),
  );
});
