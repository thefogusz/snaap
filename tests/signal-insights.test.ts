import { test } from "node:test";
import assert from "node:assert/strict";
import { freshness, explain, progress } from "../src/domain/insights.js";
import {
  freezeRisk,
  measureOutcome,
  riskPlanSchema,
} from "../src/domain/outcomes.js";
import {
  emptyLifecycle,
  frames,
  type Candle,
  type Signal,
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
const event: Signal = {
  market: "Spot",
  side: "SPOT",
  time: 30 * step,
  kind: "ENTRY",
  referencePrice: 100,
  evidence: { result: "TRUE" },
  stage: 0,
};
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
test("ATR snapshot is causal, fixed and side aware", () => {
  const candles = Array.from({ length: 30 }, (_, i) => bar((i + 1) * step));
  const config = riskPlanSchema.parse({ enabled: true });
  const long = freezeRisk(config, event, { "1h": candles }, "1h");
  assert.equal(long?.status, "READY");
  assert.equal(long?.stopLoss, 94);
  assert.equal(long?.takeProfit, 112);
  assert.deepEqual(
    freezeRisk(
      config,
      event,
      { "1h": [...candles, bar(31 * step, 1000, 1)] },
      "1h",
    ),
    long,
  );
  const short = freezeRisk(
    config,
    { ...event, side: "SHORT" },
    { "1h": candles },
    "1h",
  );
  assert.equal(short?.stopLoss, 106);
  assert.equal(short?.takeProfit, 88);
  assert.equal(freezeRisk(config, event, {}, "1h")?.status, "INSUFFICIENT");
  assert.equal(
    freezeRisk({ ...config, enabled: false }, event, {}, "1h"),
    null,
  );
});
test("outcomes exclude entry bar, preserve ambiguity, gaps and pending windows", () => {
  const risk = freezeRisk(
    riskPlanSchema.parse({ enabled: true }),
    event,
    { "1h": Array.from({ length: 30 }, (_, i) => bar((i + 1) * step)) },
    "1h",
  );
  const ambiguous = measureOutcome(
    event,
    "1h",
    [bar(event.time, 1000, 1), bar(31 * step, 113, 93)],
    risk,
    20,
    31 * step,
  );
  assert.equal(ambiguous.firstTouch, "AMBIGUOUS");
  assert.equal(ambiguous.status, "PENDING");
  assert.equal(ambiguous.favorablePct, 13);
  assert.equal(ambiguous.adversePct, 7);
  assert.equal(
    measureOutcome(event, "1h", [bar(32 * step)], risk, 20, 32 * step).status,
    "INCOMPLETE",
  );
  assert.equal(
    measureOutcome(
      event,
      "1h",
      Array.from({ length: 20 }, (_, i) => bar((31 + i) * step)),
      risk,
      20,
      50 * step,
    ).status,
    "COMPLETE",
  );
});
test("short excursion signs, ordered touches and gap-before-touch are explicit", () => {
  const short = { ...event, side: "SHORT" as const };
  const risk = freezeRisk(
    riskPlanSchema.parse({ enabled: true }),
    short,
    { "1h": Array.from({ length: 30 }, (_, i) => bar((i + 1) * step)) },
    "1h",
  );
  const measured = measureOutcome(
    short,
    "1h",
    [bar(31 * step, 103, 87), bar(32 * step, 108, 90)],
    risk,
    20,
    32 * step,
  );
  assert.equal(measured.firstTouch, "TP");
  assert.equal(measured.favorablePct, 13);
  assert.equal(measured.adversePct, 8);
  assert.equal(
    measureOutcome(short, "1h", [bar(32 * step, 103, 87)], risk, 20, 32 * step)
      .firstTouch,
    "UNKNOWN",
  );
});
