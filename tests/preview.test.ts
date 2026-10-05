import { test } from "node:test";
import assert from "node:assert/strict";
import { preview } from "../src/domain/preview.js";
import {
  strategySchema,
  value,
  replay,
  type Candle,
} from "../src/domain/engine.js";
const spec = strategySchema.parse({
  schemaVersion: 2,
  name: "preview",
  exchange: ["MEXC"],
  market: "Spot",
  pairs: ["ETH/BTC"],
  timeframe: "15m",
  entry: {
    kind: "COMPARE",
    op: ">",
    left: { kind: "PRICE", field: "close", timeframe: "15m" },
    right: { kind: "INDICATOR", name: "EMA", period: 2, timeframe: "1h" },
  },
  stages: [],
  cooldownBars: 0,
  destinations: [],
});
const bar = (time: number, close: number): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 10,
});
test("chart-only preview renders prices and selected overlays without strategy evidence or events", () => {
  const series = { "15m": [bar(900000, 100), bar(1800000, 102)] };
  const result = preview(spec, series, [{kind:"INDICATOR",name:"SMA",period:2,timeframe:"15m"}], "15m", true);
  assert.deepEqual(result.candles, series["15m"]);
  assert.equal(result.overlays.length, 1);
  assert.equal(result.overlays[0].operand.kind, "INDICATOR");
  assert.deepEqual(result.timeline, []);
  assert.deepEqual(result.events, []);
});
test("preview uses the alert engine and never reveals future higher-timeframe values", () => {
  const series = {
    "15m": Array.from({ length: 16 }, (_, i) => bar((i + 1) * 900000, 100 + i)),
    "1h": [
      bar(3600000, 100),
      bar(7200000, 102),
      bar(10800000, 104),
      bar(14400000, 106),
    ],
  };
  const result = preview(spec, series);
  assert.deepEqual(result.events, replay(spec, series));
  result.overlays[0].points.forEach((p) =>
    assert.equal(
      p.value,
      value(result.overlays[0].operand, series, p.time) ?? null,
    ),
  );
  const changed = {
    ...series,
    "1h": [...series["1h"].slice(0, 3), bar(14400000, 99999)],
  };
  assert.deepEqual(
    preview(spec, changed).overlays[0].points.slice(0, -1),
    result.overlays[0].points.slice(0, -1),
  );
  assert.equal(result.timeline.length, 16);
});
test("preview retains insufficient-data gaps and deduplicates identical indicators", () => {
  const doubled = structuredClone(spec);
  doubled.entry = {
    kind: "GROUP",
    op: "AND",
    children: [spec.entry, spec.entry],
  };
  const result = preview(doubled, { "15m": [bar(900000, 1)] });
  assert.equal(result.overlays.length, 1);
  assert.equal(result.overlays[0].points[0].value, null);
  assert.equal(result.timeline[0].entry.result, "UNKNOWN");
  assert.equal(result.events.length, 0);
});
test('chart-only indicators cannot change alert events', () => {
  const series = {'15m':Array.from({length:40},(_,i)=>bar((i+1)*900000,100+i))};
  const plain = preview(spec,series);
  const decorated = preview(spec,series,[{kind:'INDICATOR',name:'RSI',period:14,timeframe:'15m'}]);
  assert.equal(decorated.overlays.length,plain.overlays.length+1);
  assert.deepEqual(decorated.events,plain.events);
  assert.deepEqual(decorated.timeline,plain.timeline);
});

test('switching chart timeframe preserves evaluation timeline and events', () => {
  const series = {
    '15m': Array.from({length:40}, (_,i)=>bar((i+1)*900000,100+i)),
    '1h': Array.from({length:10}, (_,i)=>bar((i+1)*3600000,100+i)),
  };
  const saved = JSON.stringify(spec);
  const original = preview(spec, series);
  const viewed = preview(spec, series, [], '1h');
  assert.equal(viewed.candles.length, 10);
  assert.equal(viewed.chartTimeframe, '1h');
  assert.equal(viewed.evaluationTimeframe, '15m');
  assert.deepEqual(viewed.timeline, original.timeline);
  assert.deepEqual(viewed.events, original.events);
  assert.equal(JSON.stringify(spec), saved);
  assert.ok(viewed.overlays.every(o => o.operand.kind === 'INDICATOR' && o.operand.timeframe === '1h'));
});
