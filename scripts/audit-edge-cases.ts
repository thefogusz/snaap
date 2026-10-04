import { value } from "../src/domain/engine.js";
// Read-only regression probe; intentionally demonstrates an unresolved gap policy.
const bars = Array.from({ length: 16 }, (_, i) => ({
  time: (i < 10 ? i + 1 : i + 2) * 900000,
  open: i < 10 ? 1000 : 100,
  high: i < 10 ? 1002 : 102,
  low: i < 10 ? 999 : 99,
  close: i < 10 ? 1000 : 100,
  volume: 1,
}));
const o = {
  kind: "INDICATOR" as const,
  name: "EMA" as const,
  period: 3,
  timeframe: "15m" as const,
};
console.log({
  case: "gap then six contiguous candles",
  fullHistory: value(o, { "15m": bars }, bars.at(-1)!.time),
  contiguousOnly: value(o, { "15m": bars.slice(10) }, bars.at(-1)!.time),
});
const raw = JSON.stringify({
  sources: Array.from({ length: 100 }, (_, id) => ({
    id,
    facts: "x".repeat(250),
  })),
});
try {
  JSON.parse(raw.slice(0, 18000));
  console.log("Context valid");
} catch {
  console.log("Context cut in middle of JSON by current 18000-char policy");
}
