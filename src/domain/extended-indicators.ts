import { IndicatorsSync } from "@ixjb94/indicators";
import {
  indicatorByName,
  type IndicatorDefinition,
} from "../../dist/indicator-catalog.js";
import type { Candle } from "./engine.js";
const library = new IndicatorsSync();
type ExtendedOperand = {
  name: string;
  period: number;
  source?: string;
  params?: Record<string, number>;
};
const cache = new WeakMap<Candle[], Map<string, number[]>>();
function average(values: number[], period: number, wilder = false) {
  const out = values.map(() => NaN);
  let state = NaN;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) {
      state = NaN;
      continue;
    }
    if (wilder && Number.isFinite(state)) state += (values[i] - state) / period;
    else {
      const tail = values.slice(Math.max(0, i - period + 1), i + 1);
      if (tail.length !== period || tail.some((x) => !Number.isFinite(x)))
        continue;
      state = tail.reduce((a, b) => a + b, 0) / period;
    }
    out[i] = state;
  }
  return out;
}
function rawStochastic(
  high: number[],
  low: number[],
  close: number[],
  period: number,
) {
  return close.map((c, i) => {
    if (i < period - 1) return NaN;
    const h = Math.max(...high.slice(i - period + 1, i + 1)),
      l = Math.min(...low.slice(i - period + 1, i + 1));
    return h === l ? 50 : (100 * (c - l)) / (h - l);
  });
}
function rsi(close: number[], period: number) {
  const changes = close.map((x, i) => (i ? x - close[i - 1] : NaN));
  const up = average(
      changes.map((x) => Math.max(0, x)),
      period,
      true,
    ),
    down = average(
      changes.map((x) => Math.max(0, -x)),
      period,
      true,
    );
  return up.map((u, i) =>
    !Number.isFinite(u)
      ? NaN
      : u === 0 && down[i] === 0
        ? 50
        : down[i] === 0
          ? 100
          : (100 * u) / (u + down[i]),
  );
}
function compute(
  rows: Candle[],
  definition: IndicatorDefinition,
  o: ExtendedOperand,
  frame: number,
): number[] {
  if (definition.method === 'volume') return rows.map(c => c.volume);
  const params = Object.fromEntries(
    definition.params.map((p) => [
      p.key,
      p.key === "period" ? o.period : (o.params?.[p.key] ?? p.value),
    ]),
  );
  const high = rows.map((c) => c.high),
    low = rows.map((c) => c.low),
    close = rows.map((c) => c.close),
    volume = rows.map((c) => c.volume);
  const source = rows.map((c) =>
    o.source === "hl2"
      ? (c.high + c.low) / 2
      : o.source === "hlc3"
        ? (c.high + c.low + c.close) / 3
        : o.source === "ohlc4"
          ? (c.open + c.high + c.low + c.close) / 4
          : c[(o.source ?? "close") as keyof Candle],
  );
  let outputs: number[] | number[][];
  if (definition.method === "sessionVwap") {
    let day = -1,
      sum = 0,
      vol = 0;
    outputs = rows.map((c) => {
      const next = Math.floor((c.time - frame) / 86400000);
      if (next !== day) {
        day = next;
        sum = 0;
        vol = 0;
      }
      sum += ((c.high + c.low + c.close) / 3) * c.volume;
      vol += c.volume;
      return vol ? sum / vol : NaN;
    });
  } else if (definition.method === "coppock") {
    const roc = (period: number) =>
      source.map((x, i) =>
        i < period || source[i - period] === 0
          ? NaN
          : 100 * (x / source[i - period] - 1),
      );
    const a = roc(params.fast),
      b = roc(params.slow),
      combined = a.map((x, i) => x + b[i]);
    outputs = combined.map((_, i) => {
      const tail = combined.slice(Math.max(0, i - params.smooth + 1), i + 1);
      return tail.length === params.smooth && tail.every(Number.isFinite)
        ? tail.reduce((s, x, j) => s + x * (j + 1), 0) /
            ((params.smooth * (params.smooth + 1)) / 2)
        : NaN;
    });
  } else if (definition.method === "kdj") {
    let k = 50,
      d = 50;
    const ks: number[] = [],
      ds: number[] = [],
      js: number[] = [];
    rawStochastic(high, low, close, o.period).forEach((x) => {
      if (Number.isFinite(x)) {
        k += (x - k) / params.smooth;
        d += (k - d) / params.signal;
        ks.push(k);
        ds.push(d);
        js.push(3 * k - 2 * d);
      } else {
        ks.push(NaN);
        ds.push(NaN);
        js.push(NaN);
      }
    });
    outputs = [ks, ds, js];
  } else if (definition.method === "stochRsi") {
    const rs = rsi(source, o.period),
      raw = rawStochastic(rs, rs, rs, params.stochPeriod);
    const k = average(raw, params.smooth);
    outputs = [k, average(k, params.signal)];
  } else if (definition.method === "ichimoku") {
    const mid = (period: number) =>
      close.map((_, i) =>
        i < period - 1
          ? NaN
          : (Math.max(...high.slice(i - period + 1, i + 1)) +
              Math.min(...low.slice(i - period + 1, i + 1))) /
            2,
      );
    const tenkan = mid(params.conversion),
      kijun = mid(params.base),
      b = mid(params.span);
    outputs = [
      tenkan,
      kijun,
      close.map((_, i) =>
        i < params.displacement
          ? NaN
          : (tenkan[i - params.displacement] + kijun[i - params.displacement]) /
            2,
      ),
      close.map((_, i) =>
        i < params.displacement ? NaN : b[i - params.displacement],
      ),
    ];
  } else if (definition.method === "supertrend") {
    const tr = rows.map((c, i) =>
      i
        ? Math.max(
            c.high - c.low,
            Math.abs(c.high - close[i - 1]),
            Math.abs(c.low - close[i - 1]),
          )
        : c.high - c.low,
    );
    const atr = average(tr, o.period, true),
      line: number[] = [],
      directions: number[] = [];
    let upper = NaN,
      lower = NaN,
      previous = NaN;
    rows.forEach((c, i) => {
      if (!Number.isFinite(atr[i])) {
        line.push(NaN);
        directions.push(NaN);
        return;
      }
      const basicUpper = (c.high + c.low) / 2 + params.factor * atr[i],
        basicLower = (c.high + c.low) / 2 - params.factor * atr[i];
      const oldUpper = upper;
      upper =
        !Number.isFinite(upper) || basicUpper < upper || close[i - 1] > upper
          ? basicUpper
          : upper;
      lower =
        !Number.isFinite(lower) || basicLower > lower || close[i - 1] < lower
          ? basicLower
          : lower;
      const bullish =
        Number.isFinite(previous) &&
        (previous === oldUpper ? c.close > upper : c.close >= lower);
      previous = bullish ? lower : upper;
      line.push(previous);
      directions.push(bullish ? 1 : -1);
    });
    outputs = [line, directions];
  } else {
    const inputs: Record<string, number[] | number> = {
      ...params,
      source,
      high,
      low,
      close,
      volume,
      open: rows.map((c) => c.open),
    };
    const method = library[definition.method as keyof IndicatorsSync] as (
      ...args: any[]
    ) => number[] | number[][];
    outputs = method.apply(
      library,
      definition.args.map((arg) => inputs[arg]),
    );
  }
  const selected =
    definition.output === null
      ? (outputs as number[])
      : (outputs as number[][])[definition.output];
  // Library series omit their warm-up prefix. Preserve that prefix as UNKNOWN.
  const pad = rows.length - selected.length;
  return rows.map((_, i) =>
    i < pad
      ? NaN
      : Number.isFinite(selected[i - pad])
        ? selected[i - pad]
        : NaN,
  );
}
export function extendedValue(
  o: ExtendedOperand,
  rows: Candle[],
  index: number,
  frame: number,
) {
  const definition = indicatorByName[o.name];
  if (!definition || index < 0) return;
  let values = cache.get(rows);
  if (!values) {
    values = new Map();
    cache.set(rows, values);
  }
  const key = JSON.stringify([
    o.name,
    o.period,
    o.source,
    o.params,
    frame,
    rows.length,
    rows.at(-1),
  ]);
  let result = values.get(key);
  if (!result) {
    result = [];
    let start = 0;
    // Restart recursive/cumulative indicators after missing bars. Never bridge gaps.
    for (let i = 1; i <= rows.length; i++)
      if (i === rows.length || rows[i].time - rows[i - 1].time !== frame) {
        result.push(...compute(rows.slice(start, i), definition, o, frame));
        start = i;
      }
    if (values.size >= 64) values.clear();
    values.set(key, result);
  }
  const answer = result[index];
  return Number.isFinite(answer) ? answer : undefined;
}
