import { test } from "node:test";
import assert from "node:assert/strict";
import { preview } from "../src/domain/preview.js";
import { explain, explainEntry } from "../src/domain/insights.js";
import {
  strategySchema,
  value,
  replay,
  strategyBranches,
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

test("preview explanations agree with entry, stage and signal-relative exit evidence", () => {
  const compare = { kind: "COMPARE", op: ">", left: { kind: "PRICE", field: "close", timeframe: "15m" }, right: { kind: "CONSTANT", value: 99 } };
  const setup = strategySchema.parse({
    ...spec, market: "Perpetual Futures", side: "BOTH", mirrorShort: true,
    entry: { kind: "GROUP", op: "AND", children: [compare, { ...compare, right: { kind: "CONSTANT", value: 101 } }] },
    entryMatchPercent: 50,
    stages: [{ withinBars: 3, condition: compare }],
    exit: { ...compare, left: { kind: "ENTRY_RETURN" }, right: { kind: "CONSTANT", value: 1 } },
    cancel: { ...compare, op: "<", right: { kind: "CONSTANT", value: 95 } },
  });
  const branches = strategyBranches(setup);
  const result = preview(setup, { "15m": [100, 101, 104, 94].map((close, i) => bar((i + 1) * 900000, close)) });
  assert.ok(result.events.some(event => event.kind === "ENTRY"));
  assert.ok(result.events.some(event => event.kind === "EXIT"));
  for (const row of result.timeline) row.branches.forEach((evidence, index) => {
    const branch = branches[index];
    assert.deepEqual(evidence.explanations, {
      entry: explainEntry(branch, evidence.entry),
      stages: branch.stages.map((stage, i) => explain(stage.condition, evidence.stages[i])),
      exit: explain(branch.exit!, evidence.exit!),
      cancel: explain(branch.cancel!, evidence.cancel!),
    });
  });
});
const bar = (time: number, close: number): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 10,
});
test('MACD chart includes engine signal and histogram without changing strategy evaluation', () => {
  const series={'15m':Array.from({length:80},(_,i)=>bar((i+1)*900000,100+Math.sin(i/4)*12+i/3))};
  const macd={kind:'INDICATOR' as const,name:'MACD',period:8,slow:21,signal:5,timeframe:'15m' as const};
  const before=JSON.stringify(spec);
  const plain=preview(spec,series,[],'15m');
  const result=preview(spec,series,[macd],'15m');
  assert.deepEqual(result.overlays.map(o=>o.operand.kind==='INDICATOR'&&o.operand.name),['MACD','MACD_HIST','MACD_SIGNAL']);
  for(const overlay of result.overlays) {
    for(const point of overlay.points) assert.equal(point.value,value(overlay.operand,series,point.time,undefined,'15m')??null);
    if(overlay.operand.kind==='INDICATOR' && overlay.operand.name!=='MACD') assert.deepEqual(overlay.chartOperand,macd);
  }
  assert.equal(result.overlays[1].points[0].value,null);
  assert.deepEqual(result.timeline,plain.timeline);
  assert.deepEqual(result.events,plain.events);
  assert.equal(JSON.stringify(spec),before);
  const explicit=preview(spec,series,[macd,{...macd,name:'MACD_SIGNAL'},{...macd,name:'MACD_HIST'}],'15m');
  assert.equal(explicit.overlays.length,3);
  assert.ok(explicit.overlays.every(o=>!o.chartOperand));
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
test("chart-only indicators cannot change alert events", () => {
  const series = {
    "15m": Array.from({ length: 40 }, (_, i) => bar((i + 1) * 900000, 100 + i)),
  };
  const plain = preview(spec, series);
  const decorated = preview(spec, series, [
    { kind: "INDICATOR", name: "RSI", period: 14, timeframe: "15m" },
  ]);
  assert.equal(decorated.overlays.length, plain.overlays.length + 1);
  assert.deepEqual(decorated.events, plain.events);
  assert.deepEqual(decorated.timeline, plain.timeline);
});

test("timeframe chart uses its own candles and indicators without changing replay", () => {
  const series = {
    "15m": Array.from({ length: 40 }, (_, i) => bar((i + 1) * 900000, 100 + i)),
    "1h": Array.from({ length: 10 }, (_, i) =>
      bar((i + 1) * 3600000, 100 + i * 4),
    ),
  };
  const original = structuredClone(spec);
  const base = preview(spec, series);
  const hour = preview(spec, series, [], "1h");
  assert.deepEqual(hour.candles, series["1h"]);
  assert.equal(hour.overlays.length, 1);
  hour.overlays[0].points.forEach((p) =>
    assert.equal(
      p.value,
      value(hour.overlays[0].operand, series, p.time, undefined, "1h") ?? null,
    ),
  );
  assert.deepEqual(hour.events, base.events);
  assert.ok(base.events.length > 0);
  assert.equal(hour.chartEvents.length, base.events.length);
  hour.chartEvents.forEach((e) => {
    assert.ok(hour.candles.some((c) => c.time === e.time));
    assert.ok(e.signalTime <= e.time && e.time - e.signalTime < 3600000);
  });
  assert.deepEqual(hour.timeline, base.timeline);
  assert.equal(hour.chartTimeline.length, hour.candles.length);
  assert.deepEqual(spec, original);
  assert.equal(preview(spec, series, [], "15m").overlays.length, 0);
});

test("selected chart includes indicators from exit, confirmation and independent short conditions only on their frame", () => {
  const multi = structuredClone(spec);
  const entry = spec.entry;
  assert.ok(entry.kind === "COMPARE");
  multi.side = "BOTH";
  multi.stages = [
    {
      withinBars: 3,
      condition: {
        ...structuredClone(entry),
        right: { kind: "INDICATOR", name: "RSI", period: 2, timeframe: "15m" },
      },
    },
  ];
  multi.exit = {
    ...structuredClone(entry),
    right: { kind: "INDICATOR", name: "SMA", period: 3, timeframe: "1h" },
  };
  multi.short = {
    entry: {
      ...structuredClone(entry),
      right: { kind: "INDICATOR", name: "EMA", period: 5, timeframe: "1h" },
    },
    stages: [],
    cooldownBars: 0,
  };
  const series = {
    "15m": Array.from({ length: 40 }, (_, i) => bar((i + 1) * 900000, 100 + i)),
    "1h": Array.from({ length: 10 }, (_, i) => bar((i + 1) * 3600000, 100 + i)),
  };
  const hour = preview(multi, series, [], "1h");
  assert.equal(hour.overlays.length, 3);
  assert.ok(
    hour.overlays.every(
      (o) => "timeframe" in o.operand && o.operand.timeframe === "1h",
    ),
  );
  assert.equal(preview(multi, series, [], "15m").overlays.length, 1);
  assert.deepEqual(hour.events, replay(multi, series));
});

test("chart evidence never uses a future or stale base evaluation", () => {
  const series = {
    "15m": [bar(900000, 100), bar(1800000, 101)],
    "1h": [bar(0, 100), bar(3600000, 110)],
  };
  const result = preview(spec, series, [], "1h");
  assert.deepEqual(result.chartTimeline, [null, null]);
});
test('progress and frame summary describe the next waiting condition on each independent side',()=>{
  const condition={kind:'COMPARE',op:'>',left:{kind:'PRICE',field:'close',timeframe:'15m'},right:{kind:'CONSTANT',value:0}};
  const both=strategySchema.parse({...spec,market:'Perpetual Futures',side:'BOTH',entry:condition,stages:[{condition:{...condition,right:{kind:'CONSTANT',value:500}},withinBars:10}],short:{entry:condition,stages:[{condition,withinBars:5},{condition,withinBars:5}],cooldownBars:0}});
  const data=preview(both,{'15m':[bar(900000,100)]});
  const [long,short]=data.timeline[0].branches;
  assert.equal(long.progress.totalStages,1);assert.equal(short.progress.totalStages,2);
  assert.match(long.timeframes[0].conditions[0].text,/500/);
  assert.equal(long.timeframes[0].conditions[0].result,'FALSE');
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
