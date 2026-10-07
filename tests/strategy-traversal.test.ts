import test from "node:test";
import assert from "node:assert/strict";
import { strategySchema, type Condition, type Strategy } from "../src/domain/engine.js";
import { usedFrames } from "../src/domain/insights.js";
import { inspectSetupBar } from "../src/domain/studio.js";
import { preview } from "../src/domain/preview.js";
import { neededFrames } from "../src/markets.js";
import { subscriptionsFor } from "../src/realtime.js";

test("market, preview and Studio traversal preserves nested and independent side timeframes", () => {
  const compare = (timeframe: Strategy["timeframe"]): Condition => ({
    kind: "COMPARE", op: ">",
    left: { kind: "INDICATOR", name: "EMA", period: 2, timeframe },
    right: { kind: "CONSTANT", value: 100 },
  });
  const spec = strategySchema.parse({
    schemaVersion: 2, name: "Traversal", exchange: ["Binance"],
    market: "Perpetual Futures", side: "BOTH", pairs: ["BTC/USDT"], timeframe: "5m",
    entry: { kind: "GROUP", op: "AND", children: [
      compare("1h"), { kind: "HOLD", bars: 2, condition: compare("4h") },
    ] },
    exit: compare("6h"), cancel: compare("8h"),
    stages: [{ withinBars: 2, condition: compare("2h") }],
    short: {
      entry: compare("12h"), exit: compare("1d"),
      stages: [{ withinBars: 2, condition: compare("1w") }], cooldownBars: 0,
    },
    cooldownBars: 0, destinations: [],
  });
  const mirrored = strategySchema.parse({ ...spec, short: undefined, mirrorShort: true });
  for (const [input, expected] of [
    [spec, ["5m", "1h", "4h", "6h", "8h", "2h", "12h", "1d", "1w"]],
    [mirrored, ["5m", "1h", "4h", "6h", "8h", "2h"]],
  ] as const) {
    const original = structuredClone(input);
    assert.deepEqual(usedFrames(input), expected);
    assert.deepEqual(neededFrames(input), expected);
    const inspection = inspectSetupBar(input, {}, 0);
    assert.deepEqual(inspection.references.map(row => row.timeframe), expected);
    assert.deepEqual(inspection.coverage.map(row => row.timeframe), expected);
    const chart = preview(input, {}, [], undefined, false, 0);
    assert.deepEqual(chart.overlays.map(row => "timeframe" in row.operand && row.operand.timeframe), expected.slice(1));
    assert.deepEqual([...subscriptionsFor([{ id: "rule", revision: 1, spec: input }]).values()].map(row => row.frame), expected);
    assert.deepEqual(input, original);
  }
});
