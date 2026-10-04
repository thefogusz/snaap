import { test } from "node:test";
import assert from "node:assert/strict";
import {
  indicator,
  evaluate,
  replay,
  advance,
  emptyLifecycle,
  strategySchema,
  type Candle,
  type Strategy,
} from "../src/domain/engine.js";
const candles: Candle[] = Array.from({ length: 80 }, (_, i) => ({
  time: (i + 1) * 900000,
  open: i + 1,
  high: i + 3,
  low: i,
  close: i + 2,
  volume: 100 + i,
}));
const price = { kind: "PRICE", field: "close", timeframe: "15m" } as const;
const constant = (value: number) => ({ kind: "CONSTANT" as const, value });
const condition = {
  kind: "COMPARE" as const,
  op: ">" as const,
  left: price,
  right: constant(50),
};
const spec: Strategy = {
  schemaVersion: 2,
  name: "test",
  exchange: ["Binance"],
  market: "Spot",
  pairs: ["BTC/USDT"],
  timeframe: "15m",
  entry: condition,
  cooldownBars: 0,
  stages: [],
  destinations: [],
};
test("SMA and seeded EMA agree for a linear series", () => {
  assert.equal(indicator(candles, "SMA", 3), 80);
  assert.equal(indicator(candles, "EMA", 3), 80);
  assert.equal(indicator(candles, "RSI", 14), 100);
});
test("closed higher timeframe excludes future candle", () => {
  const c = { ...condition, left: { ...price, timeframe: "4h" as const } };
  assert.equal(
    evaluate(
      c,
      { "4h": [{ ...candles[0], time: 14400000, close: 100 }] },
      900000,
    ).result,
    "UNKNOWN",
  );
});
test("cross requires a transition, not a persistent threshold", () => {
  const c = { ...condition, op: "CROSS_ABOVE" as const };
  assert.equal(
    evaluate(c, { "15m": candles }, candles[49].time).result,
    "TRUE",
  );
  assert.equal(
    evaluate(c, { "15m": candles }, candles[50].time).result,
    "FALSE",
  );
});
test("missing data preserves three-valued logic", () => {
  const unknown = {
    ...condition,
    left: { ...price, timeframe: "4h" as const },
  };
  assert.equal(
    evaluate(
      { kind: "GROUP", op: "OR", children: [condition, unknown] },
      { "15m": candles },
      candles.at(-1)!.time,
    ).result,
    "TRUE",
  );
  assert.equal(
    evaluate(
      { kind: "GROUP", op: "AND", children: [condition, unknown] },
      { "15m": candles },
      candles.at(-1)!.time,
    ).result,
    "UNKNOWN",
  );
});
test("replay latches entry and cannot invent real positions", () => {
  const events = replay(spec, { "15m": candles });
  assert.equal(events.filter((e) => e.kind === "ENTRY").length, 1);
  assert.equal(events[0].referencePrice, 51);
});
test("rejects executable payload and unknown schema fields", () => {
  assert.equal(
    strategySchema.safeParse({ ...spec, code: "process.exit()" }).success,
    false,
  );
  assert.equal(
    strategySchema.safeParse({ ...spec, pairs: ["../secret"] }).success,
    false,
  );
});
test("incremental evaluation survives serialization and matches replay", () => {
  const s = {
    ...spec,
    stages: [
      { condition: { ...condition, right: constant(55) }, withinBars: 8 },
    ],
    exit: { ...condition, right: constant(60) },
  };
  let checkpoint = emptyLifecycle();
  const events = [];
  for (const bar of candles) {
    const result = advance(
      s,
      { "15m": candles },
      bar,
      JSON.parse(JSON.stringify(checkpoint)),
    );
    checkpoint = result.state;
    events.push(...result.events);
  }
  assert.deepEqual(events, replay(s, { "15m": candles }));
  assert.deepEqual(
    events.map((e) => e.kind),
    ["ENTRY", "EXIT"],
  );
  assert.equal(
    advance(s, { "15m": candles }, candles.at(-1)!, checkpoint).events.length,
    0,
  );
});
test("entry return uses base timeframe, never another series with the same close time", () => {
  const c = {
    kind: "COMPARE",
    op: ">",
    left: { kind: "ENTRY_RETURN" },
    right: constant(10),
  } as const;
  const last = candles.at(-1)!;
  assert.equal(
    evaluate(
      c,
      { "15m": [last], "1h": [{ ...last, close: 999 }] },
      last.time,
      "15m",
      80,
    ).result,
    "FALSE",
  );
});
test("MACD periods must be ordered and entry cannot reference an entry that has not occurred", () => {
  assert.equal(
    strategySchema.safeParse({
      ...spec,
      entry: { ...condition, left: { kind: "ENTRY_RETURN" } },
    }).success,
    false,
  );
  assert.equal(
    strategySchema.safeParse({
      ...spec,
      entry: {
        ...condition,
        left: {
          kind: "INDICATOR",
          name: "MACD",
          period: 30,
          slow: 26,
          timeframe: "15m",
        },
      },
    }).success,
    false,
  );
});
test("sequence expires and does not fire after the deadline", () => {
  const events = replay(
    {
      ...spec,
      stages: [
        { condition: { ...condition, right: constant(70) }, withinBars: 2 },
      ],
    },
    { "15m": candles },
  );
  assert.deepEqual(
    events.map((e) => e.kind),
    ["EXPIRED"],
  );
});
test("indicator source is explicit and ATR uses true ranges", () => {
  const c = {
    ...condition,
    left: {
      kind: "INDICATOR" as const,
      name: "SMA" as const,
      period: 3,
      timeframe: "15m" as const,
      source: "open" as const,
    },
    right: constant(80),
  };
  assert.equal(evaluate(c, { "15m": candles }, candles.at(-1)!.time).left, 79);
  assert.equal(indicator(candles, "ATR", 14), 3);
  assert.equal(indicator(candles, "MACD", 12, 26), 7);
  assert.ok(
    Math.abs(indicator(candles, "BB_UPPER", 3)! - (80 + 2 * Math.sqrt(2 / 3))) <
      1e-10,
  );
});
test("missing bars cancel an in-progress signal and never invent an exit", () => {
  const s = {
    ...spec,
    entry: { ...condition, right: constant(1) },
    exit: { ...condition, right: constant(1000) },
  };
  const bars = [candles[0], candles[3]];
  assert.deepEqual(
    replay(s, { "15m": bars }).map((e) => e.kind),
    ["ENTRY", "CANCEL"],
  );
});
test("very deep rule input is rejected before recursive schema parsing", () => {
  let nested: any = condition;
  for (let i = 0; i < 100; i++)
    nested = { kind: "HOLD", bars: 1, condition: nested };
  assert.equal(
    strategySchema.safeParse({ ...spec, entry: nested }).success,
    false,
  );
});
