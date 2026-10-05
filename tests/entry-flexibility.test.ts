import { test } from "node:test";
import assert from "node:assert/strict";
import {
  strategySchema,
  replay,
  advance,
  emptyLifecycle,
  type Condition,
  type Series,
} from "../src/domain/engine.js";
import { preview } from "../src/domain/preview.js";
import { diffSetup } from "../dist/setup-changes.js";
import { setupFile } from "../src/domain/setup-files.js";
const price = { kind: "PRICE", field: "close", timeframe: "5m" } as const;
const cmp = (
  value: number,
  op: ">" | "<" | "CROSS_ABOVE" = ">",
): Condition => ({
  kind: "COMPARE",
  op,
  left: price,
  right: { kind: "CONSTANT", value },
});
const base = {
  schemaVersion: 2,
  name: "Flexible entry",
  exchange: ["MEXC"],
  market: "Spot",
  side: "SPOT",
  pairs: ["BTC/USDT"],
  timeframe: "5m",
  stages: [],
  cooldownBars: 0,
  destinations: [],
};
const data = (values: number[]): Series => ({
  "5m": values.map((close, i) => ({
    time: (i + 1) * 300000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  })),
});
test("all checks have equal weight; 80% rounds up and 100% keeps original evaluation", () => {
  const entry = {
    kind: "GROUP",
    op: "AND",
    children: Array.from({ length: 11 }, (_, i) => cmp(10 + i)),
  };
  const strict = strategySchema.parse({ ...base, entry });
  const flex = strategySchema.parse({ ...base, entry, entryMatchPercent: 80 });
  assert.equal(replay(strict, data([19])).length, 0);
  assert.equal(replay(flex, data([18])).length, 0); // eight of eleven is below 80%
  assert.equal(replay(flex, data([19])).length, 1); // nine of eleven meets 80%
  const now = Date.now();
  assert.deepEqual(
    preview({ ...strict, entryMatchPercent: 100 }, data([19, 21]), [], undefined, now),
    preview(strict, data([19, 21]), [], undefined, now),
  );
});
test("signal explanations preserve flexible entry results and flattened nested units", () => {
  const spec = strategySchema.parse({ ...base, entryMatchPercent: 50, entry: {
    kind: "GROUP", op: "AND", children: [cmp(5), {
      kind: "GROUP", op: "AND", children: [cmp(15), cmp(20)],
    }],
  }});
  const result = preview(spec, data([18])).timeline[0].branches[0];
  assert.equal(result.entry.result, "TRUE");
  assert.equal(result.explanations.entry[0].result, "TRUE");
  assert.match(result.explanations.entry[0].text, /ผ่าน 2\/3 ข้อ/);
  assert.deepEqual(result.explanations.entry.slice(1).map(e => e.result), ["TRUE", "TRUE", "FALSE"]);
  assert.equal(result.timeframes[0].conditions[0].result, "TRUE");
});

test("OR and HOLD remain atomic; missing data earns no matches", () => {
  const entry = {
    kind: "GROUP",
    op: "AND",
    children: [
      { kind: "GROUP", op: "OR", children: [cmp(20), cmp(30)] },
      { kind: "HOLD", bars: 2, condition: cmp(5) },
    ],
  };
  const spec = strategySchema.parse({ ...base, entry, entryMatchPercent: 50 });
  assert.equal(replay(spec, data([10])).length, 0);
  assert.equal(preview(spec, data([10])).timeline[0].entry.result, "UNKNOWN");
  assert.equal(replay(spec, data([10, 10])).length, 1);
});
test("percentage is shared across both sides, replay, preview and durable transitions", () => {
  const spec = strategySchema.parse({
    ...base,
    market: "Perpetual Futures",
    side: "BOTH",
    mirrorShort: true,
    entry: { kind: "GROUP", op: "AND", children: [cmp(10), cmp(20), cmp(12)] },
    entryMatchPercent: 50,
  });
  const series = data([8, 15, 9]);
  const expected = replay(spec, series);
  assert.deepEqual(
    expected.map((x) => x.side),
    ["SHORT", "LONG", "SHORT"],
  );
  let state = emptyLifecycle();
  const events = [];
  for (const bar of series["5m"]!) {
    const next = advance(spec, series, bar, JSON.parse(JSON.stringify(state)));
    state = next.state;
    events.push(...next.events);
  }
  assert.deepEqual(events, expected);
  assert.deepEqual(preview(spec, series).events, expected);
  const independent = strategySchema.parse({
    ...spec,
    mirrorShort: undefined,
    short: {
      entry: {
        kind: "GROUP",
        op: "AND",
        children: [cmp(5, "<"), cmp(10, "<")],
      },
      stages: [],
      cooldownBars: 0,
    },
  });
  assert.deepEqual(
    replay(independent, series).map((x) => x.side),
    ["SHORT", "LONG", "SHORT"],
  );
});
test("crossing and HOLD timing remain unchanged, exits cannot be relaxed", () => {
  const spec = strategySchema.parse({
    ...base,
    entry: cmp(10, "CROSS_ABOVE"),
    entryMatchPercent: 50,
  });
  assert.deepEqual(
    preview(spec, data([9, 11, 12])).timeline.map((x) => x.entry.result),
    ["UNKNOWN", "TRUE", "FALSE"],
  );
  const exit = { kind: "GROUP", op: "AND", children: [cmp(20), cmp(30)] };
  const lifecycle = strategySchema.parse({
    ...base,
    entry: cmp(10),
    exit,
    entryMatchPercent: 50,
  });
  assert.deepEqual(
    replay(lifecycle, data([15, 25, 35])).map((x) => x.kind),
    ["ENTRY", "EXIT"],
  );
});
test("bounds, receipts and exported setups preserve the single percentage", () => {
  const draft = { ...base, entry: cmp(10) };
  for (const invalid of [0, 101, 80.5, "80"])
    assert.equal(
      strategySchema.safeParse({ ...draft, entryMatchPercent: invalid })
        .success,
      false,
    );
  assert.ok(
    diffSetup(draft, { ...draft, entryMatchPercent: 80 }).some(
      (x) => x.path === "entryMatchPercent",
    ),
  );
  assert.equal(
    setupFile({ ...draft, entryMatchPercent: 80 }).setups[0].entryMatchPercent,
    80,
  );
  assert.equal(
    strategySchema.safeParse({
      ...draft,
      entryFlexibility: { minMatchPercent: 80, crossingWindowBars: 3 },
    }).success,
    false,
  );
});
