import { test } from "node:test";
import assert from "node:assert/strict";
import { freshness, explain, progress } from "../src/domain/insights.js";
import {
  emptyLifecycle,
  frames,
  type Candle,
} from "../src/domain/engine.js";
const step = frames["1h"];
const bar = (time: number, high = 102, low = 98, close = 100): Candle => ({
  time,
  open: 100,
  high,
  low,
  close,
  volume: 10,
});
test("freshness distinguishes delayed, gaps, absent and future candles", () => {
  assert.equal(freshness("1h", [bar(step)], 2 * step).status, "DELAYED");
  assert.equal(
    freshness("1h", [bar(step), bar(3 * step)], 3 * step).status,
    "INSUFFICIENT",
  );
  assert.equal(freshness("1h", [], step).status, "INSUFFICIENT");
  assert.equal(
    freshness("1h", [bar(step), bar(2 * step)], step).latestClose,
    step,
  );
  assert.equal(freshness("1h", [bar(step)], step).status, "CURRENT");
});
test("evidence names operands and actual values without a model call", () => {
  const lines = explain(
    {
      kind: "COMPARE",
      op: ">",
      left: { kind: "INDICATOR", name: "RSI", period: 14, timeframe: "1h" },
      right: { kind: "CONSTANT", value: 50 },
    },
    { result: "FALSE", left: 48, right: 50 },
  );
  assert.match(lines[0].text, /RSI/);
  assert.match(lines[0].text, /48/);
  assert.match(lines[0].text, /50/);
  assert.equal(lines[0].result, "FALSE");
});
test("stage progress includes deadline equality as the final allowed bar", () => {
  const state = { ...emptyLifecycle(), stage: 0, deadline: 10 * step };
  assert.equal(progress(state, "1h", 10 * step, 2).remainingBars, 0);
  assert.equal(progress(state, "1h", 9 * step, 2).remainingBars, 1);
});

test('weekly freshness uses exchange Monday UTC boundaries', () => {
  const monday = Date.parse('2026-10-05T00:00:00Z');
  assert.equal(freshness('1w', [bar(monday - frames['1w']), bar(monday)], monday + frames['1d']).status, 'CURRENT');
  assert.equal(freshness('1w', [bar(monday - frames['1w'])], monday).status, 'DELAYED');
  assert.equal(freshness('1w', [bar(monday + 3 * frames['1d'])], monday + 4 * frames['1d']).status, 'INSUFFICIENT');
});
test("an old gap outside the bars a setup reads does not stall monitoring", async () => {
  const { seriesFreshness, indicatorWarmup } = await import("../src/domain/insights.js");
  const now = 1000 * step;
  const bars = Array.from({ length: 600 }, (_, i) => bar((401 + i) * step)).filter((b) => b.time !== 450 * step);
  const rsi = { kind: "INDICATOR", name: "RSI", period: 14, timeframe: "1h" } as const;
  const spec: any = {
    schemaVersion: 2, name: "gap", exchange: ["Binance"], market: "Spot", pairs: ["BTC/USDT"], timeframe: "1h",
    entry: { kind: "COMPARE", op: ">", left: rsi, right: { kind: "CONSTANT", value: 50 } },
    cooldownBars: 0, stages: [], destinations: [],
  };
  assert.equal(indicatorWarmup([rsi]).get("1h"), 46);
  assert.equal(freshness("1h", bars, now).status, "INSUFFICIENT", "the whole-series check still sees the gap");
  assert.equal(seriesFreshness(spec, { "1h": bars }, now)[0].status, "CURRENT");
  const recentGap = bars.filter((b) => b.time !== 990 * step);
  assert.equal(seriesFreshness(spec, { "1h": recentGap }, now)[0].status, "INSUFFICIENT", "a gap inside the warmup still blocks");
});
