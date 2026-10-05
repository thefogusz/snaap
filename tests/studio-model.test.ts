import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conditionRows,
  indicatorUses,
  evidenceAtPath,
} from "../dist/studio-model.js";
import { strategySchema } from "../src/domain/engine.js";
import { preview } from "../src/domain/preview.js";
const leaf = {
  kind: "COMPARE",
  op: ">",
  left: { kind: "INDICATOR", name: "EMA", period: 2, timeframe: "5m" },
  right: { kind: "CONSTANT", value: 1 },
};
const spec = strategySchema.parse({
  schemaVersion: 2,
  name: "Nested",
  exchange: ["Binance"],
  market: "Spot",
  pairs: ["BTC/USDT"],
  timeframe: "5m",
  entry: {
    kind: "GROUP",
    op: "OR",
    children: [leaf, { kind: "HOLD", bars: 2, condition: leaf }],
  },
  stages: [],
  cooldownBars: 0,
  destinations: [],
});
test("UI projections preserve OR/HOLD structure and track shared operand uses", () => {
  const original = JSON.stringify(spec),
    rows = conditionRows(spec);
  assert.deepEqual(
    rows.map((r) => r.path),
    [
      "entry",
      "entry.children.0",
      "entry.children.1",
      "entry.children.1.condition",
    ],
  );
  assert.equal(rows[0].condition.kind, "GROUP");
  const uses = indicatorUses(spec);
  assert.equal(uses.length, 1);
  assert.deepEqual(uses[0].paths, [
    "entry.children.0.left",
    "entry.children.1.condition.left",
  ]);
  assert.equal(JSON.stringify(spec), original);
});
test("UI reads engine evidence rather than interpreting missing values as FALSE", () => {
  const bar = preview(spec, {
    "5m": [{ time: 300000, open: 1, high: 1, low: 1, close: 1, volume: 1 }],
  }).timeline[0];
  assert.equal(evidenceAtPath(bar, "entry", spec)?.result, "UNKNOWN");
  assert.equal(
    evidenceAtPath(bar, "entry.children.1.condition", spec)?.result,
    "UNKNOWN",
  );
  assert.equal(evidenceAtPath(bar, "entry.children.9", spec), undefined);
});
