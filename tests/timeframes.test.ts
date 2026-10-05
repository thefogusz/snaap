import { test } from "node:test";
import assert from "node:assert/strict";
import { availableTimeframes, lastClosedBoundary, TIMEFRAMES } from "../dist/timeframes.js";
import { strategySchema, value, evaluate, frames } from "../src/domain/engine.js";
import { closedStreamCandles } from "../src/realtime.js";
import { monitorBatches } from "../src/monitor-batches.js";

const makeSpec = (exchange = "Binance", market = "Spot", frame = "1w") => ({schemaVersion:2,name:"Weekly",exchange:[exchange],market,side:market === "Spot" ? "SPOT" : "LONG",pairs:["BTC/USDT"],timeframe:frame,entry:{kind:"COMPARE",op:">",left:{kind:"PRICE",field:"close",timeframe:frame},right:{kind:"CONSTANT",value:90}},stages:[],cooldownBars:0,destinations:[]});

test("standard timeframes are bounded and market-specific in the strategy contract", () => {
  assert.equal(TIMEFRAMES[0], "5m"); assert.equal(TIMEFRAMES.at(-1), "1w");
  for (const frame of TIMEFRAMES) assert.ok(strategySchema.safeParse(makeSpec("Binance","Spot",frame)).success);
  for (const frame of ["1m", "3m", "1M", "10m"]) assert.equal(strategySchema.safeParse(makeSpec("Binance","Spot",frame)).success,false);
  assert.equal(availableTimeframes(["Bitget"],"Spot").includes("2h"),false);
  assert.ok(availableTimeframes(["Bitget"],"Perpetual Futures").includes("2h"));
  assert.equal(strategySchema.safeParse(makeSpec("Bybit","Spot","8h")).success,false);
  assert.equal(strategySchema.safeParse(makeSpec("MEXC","Spot","8h")).success,false);
  assert.ok(strategySchema.safeParse(makeSpec("MEXC","Perpetual Futures","8h")).success);
  assert.equal(availableTimeframes(["Binance","Bybit"]).includes("8h"),false);
  const badOperand = makeSpec("MEXC"); badOperand.entry.left.timeframe="2h";
  assert.equal(strategySchema.safeParse(badOperand).success,false);
});

test("weekly closes use Monday UTC for streams and monitoring, including the exact boundary", () => {
  const monday = Date.parse("2026-10-05T00:00:00Z"), previous=monday-frames["1w"];
  assert.equal(lastClosedBoundary(monday-1,"1w"),previous);
  assert.equal(lastClosedBoundary(monday,"1w"),monday);
  assert.equal(lastClosedBoundary(Date.parse("2026-10-08T12:00:00Z"),"1w"),monday);
  const stream=closedStreamCandles([[previous,100,110,95,105,10],[monday,105,115,100,110,10]],"1w",monday);
  assert.equal(stream.length,1); assert.equal(stream[0].time,monday);
  const spec=strategySchema.parse(makeSpec());
  const key="weekly:1:Binance:BTC/USDT";
  assert.equal(monitorBatches([{id:"weekly",revision:1,spec}],new Map([[key,previous]]),monday-1).groups.size,0);
  assert.equal(monitorBatches([{id:"weekly",revision:1,spec}],new Map([[key,previous]]),monday).groups.size,1);
});

test("weekly evidence uses the latest closed candle and keeps missing-data distinct", () => {
  const monday=Date.parse("2026-10-05T00:00:00Z"),spec=strategySchema.parse(makeSpec());
  const candle={time:monday,open:100,high:110,low:95,close:105,volume:10};
  assert.equal(value(spec.entry.kind === "COMPARE" ? spec.entry.left : {kind:"CONSTANT",value:0},{"1w":[candle]},monday-1),undefined);
  assert.equal(evaluate(spec.entry,{"1w":[candle]},monday).result,"TRUE");
  assert.equal(evaluate(spec.entry,{"1w":[candle]},monday+frames["1w"]).result,"UNKNOWN");
});
