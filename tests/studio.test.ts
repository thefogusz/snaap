import { test } from "node:test";
import assert from "node:assert/strict";
import { strategySchema, type Candle } from "../src/domain/engine.js";
import {
  conditionAtPath,
  validEditorContext,
  inspectSetupBar,
} from "../src/domain/studio.js";
const spec = strategySchema.parse({
  schemaVersion: 2,
  name: "Studio",
  exchange: ["Binance"],
  market: "Spot",
  pairs: ["BTC/USDT"],
  timeframe: "5m",
  entry: {
    kind: "COMPARE",
    op: ">",
    left: { kind: "PRICE", field: "close", timeframe: "1h" },
    right: { kind: "CONSTANT", value: 100 },
  },
  stages: [],
  cooldownBars: 0,
  destinations: [],
});
test("editor focus is scoped to existing draft conditions and pairs", () => {
  assert.ok(conditionAtPath(spec, "entry"));
  for (const path of [
    "__proto__",
    "entry.left",
    "entry.children.0",
    "pairs.0",
    "short.entry",
  ])
    assert.equal(conditionAtPath(spec, path), undefined);
  assert.equal(
    validEditorContext(spec, {
      pair: "BTC/USDT",
      chartTimeframe: "4h",
      conditionPath: "entry",
    }),
    true,
  );
  assert.equal(
    validEditorContext(spec, { pair: "ETH/USDT", chartTimeframe: "4h" }),
    false,
  );
  assert.equal(
    validEditorContext(spec, {
      pair: "BTC/USDT",
      chartTimeframe: "4h",
      conditionPath: "cancel",
    }),
    false,
  );
});
test("inspection uses the preceding closed evaluation bar, never a future HTF candle", () => {
  const bar = (time: number, close: number): Candle => ({
    time,
    close,
    open: close,
    high: close,
    low: close,
    volume: 10,
  });
  const series = {
    "5m": [bar(3600000, 100), bar(3900000, 102)],
    "1h": [bar(3600000, 101), bar(7200000, 9999)],
  };
  const result = inspectSetupBar(spec, series, 3899999);
  assert.equal(result.bar?.time, 3600000);
  assert.equal(result.bar?.entry.result, "TRUE");
  assert.equal(result.bar?.entry.left, 101);
  assert.equal(
    result.references.find((r) => r.timeframe === "1h")?.closedAt,
    3600000,
  );
  assert.equal(inspectSetupBar(spec, series, 1).bar, null);
  assert.equal(
    inspectSetupBar(spec, { "5m": [bar(300000, 1)] }, 300000).bar?.entry.result,
    "UNKNOWN",
  );
});
