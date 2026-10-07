import { z } from "zod";
import {
  extendedNames,
  indicatorByName,
} from "../../dist/indicator-catalog.js";
import { extendedValue } from "./extended-indicators.js";
import { mirrorBranch } from "../../dist/trade-direction.js";
import { MAX_SETUP_CONDITIONS } from "../../dist/setup-limits.js";
import { FRAME_MS, TIMEFRAMES, availableTimeframes } from "../../dist/timeframes.js";
export const frames = FRAME_MS;
export const timeframe = z.enum(TIMEFRAMES);
import { entryUnits, flexibilityCounts } from "../../dist/entry-flexibility.js";
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type Series = Partial<Record<keyof typeof frames, Candle[]>>;
export const operand = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("CONSTANT"), value: z.number().finite() })
    .strict(),
  z
    .object({
      kind: z.literal("PRICE"),
      field: z.enum(["open", "high", "low", "close", "volume"]),
      timeframe,
    })
    .strict(),
  z
    .object({
      kind: z.literal("INDICATOR"),
      source: z
        .enum(["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"])
        .optional(),
      name: z.enum([
        "CUSTOM",
        "EMA",
        "SMA",
        "RSI",
        "MACD",
        "MACD_SIGNAL",
        "MACD_HIST",
        "BB_UPPER",
        "BB_LOWER",
        "ATR",
        "VOLUME_RATIO",
        "WMA",
        "RMA",
        "VWMA",
        "ROC",
        "MOM",
        "STDDEV",
        "VARIANCE",
        "HIGHEST",
        "LOWEST",
        "DONCHIAN_UPPER",
        "DONCHIAN_LOWER",
        "DONCHIAN_MID",
        "STOCH_K",
        "WILLIAMS_R",
        "CCI",
        "MFI",
        "CMF",
        "BB_MIDDLE",
        "BB_WIDTH",
        "BB_PERCENT",
        "TR",
        ...extendedNames,
      ]),
      formula: z
        .object({
          title: z.string().min(1).max(80),
          version: z.literal(1),
          offset: z.number().finite().min(-1e9).max(1e9).default(0),
          terms: z
            .array(
              z
                .object({
                  name: z.enum([
                    "SMA",
                    "EMA",
                    "WMA",
                    "RMA",
                    "RSI",
                    "ATR",
                    "ROC",
                    "MOM",
                    "STDDEV",
                  ]),
                  period: z.number().int().min(2).max(500),
                  weight: z.number().finite().min(-1000).max(1000),
                })
                .strict(),
            )
            .min(1)
            .max(8),
        })
        .strict()
        .optional(),
      period: z.number().int().min(2).max(500),
      timeframe,
      slow: z.number().int().min(3).max(500).optional(),
      signal: z.number().int().min(2).max(100).optional(),
      deviation: z.number().min(0.1).max(10).optional(),
      params: z.record(z.string(), z.number().finite()).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("ENTRY_RETURN") }).strict(),
]);
export type Operand = z.infer<typeof operand>;
export type Condition =
  | {
      kind: "COMPARE";
      op: ">" | ">=" | "<" | "<=" | "CROSS_ABOVE" | "CROSS_BELOW";
      left: Operand;
      right: Operand;
    }
  | { kind: "GROUP"; op: "AND" | "OR"; children: Condition[] }
  | { kind: "HOLD"; bars: number; condition: Condition };
const condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z
      .object({
        kind: z.literal("COMPARE"),
        op: z.enum([">", ">=", "<", "<=", "CROSS_ABOVE", "CROSS_BELOW"]),
        left: operand,
        right: operand,
      })
      .strict(),
    z
      .object({
        kind: z.literal("GROUP"),
        op: z.enum(["AND", "OR"]),
        children: z.array(condition).min(1).max(20),
      })
      .strict(),
    z
      .object({
        kind: z.literal("HOLD"),
        bars: z.number().int().min(1).max(30),
        condition,
      })
      .strict(),
  ]),
);
export const entryMatchPercentSchema = z.number().int().min(1).max(100);
const strategyStructure = z
  .object({
    schemaVersion: z.literal(2),
    name: z.string().trim().min(1).max(100),
    exchange: z
      .array(z.enum(["Binance", "Bybit", "OKX", "Bitget", "MEXC"]))
      .min(1)
      .max(5),
    market: z.enum(["Spot", "Perpetual Futures"]),
    side: z.enum(["SPOT", "LONG", "SHORT", "BOTH"]).optional(),
    mirrorShort: z.boolean().optional(),
    short: z
      .object({
        entry: condition,
        exit: condition.optional(),
        cancel: condition.optional(),
        stages: z
          .array(
            z
              .object({
                condition,
                withinBars: z.number().int().min(1).max(100),
              })
              .strict(),
          )
          .max(5),
        cooldownBars: z.number().int().min(0).max(1000),
      })
      .strict()
      .optional(),
    pairs: z
      .array(
        z
          .string()
          .regex(
            /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,39}\/[\p{L}\p{N}][\p{L}\p{N}._-]{0,19}$/u,
          ),
      )
      .min(1)
      .max(10, "เลือกคู่เทรดได้สูงสุด 10 คู่ต่อเซ็ตอัพ"),
    timeframe,
    entry: condition,
    entryMatchPercent: entryMatchPercentSchema.optional(),
    exit: condition.optional(),
    cancel: condition.optional(),
    stages: z
      .array(
        z
          .object({ condition, withinBars: z.number().int().min(1).max(100) })
          .strict(),
      )
      .max(5),
    cooldownBars: z.number().int().min(0).max(1000),
    destinations: z.array(z.string().uuid()).max(5),
  })
  .strict()
  .superRefine((s, ctx) => {
    const supportedFrames = availableTimeframes(s.exchange, s.market);
    if (!supportedFrames.includes(s.timeframe))
      ctx.addIssue({ code: "custom", message: `กระดานและตลาดที่เลือกไม่รองรับ ${s.timeframe}` });
    if (s.market === "Spot" && s.side && s.side !== "SPOT")
      ctx.addIssue({
        code: "custom",
        message: "Spot setups use SPOT direction",
      });
    if (s.market === "Perpetual Futures" && s.side === "SPOT")
      ctx.addIssue({
        code: "custom",
        message: "Futures setups require LONG, SHORT or BOTH",
      });
    if (
      s.mirrorShort &&
      (s.market === "Spot" ||
        !["SHORT", "BOTH"].includes(s.side ?? "") ||
        s.short)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Mirrored Short requires SHORT or BOTH and cannot include an explicit short branch",
      });
    if (s.side === "BOTH" ? !s.mirrorShort && !s.short : !!s.short)
      ctx.addIssue({
        code: "custom",
        message:
          "BOTH requires mirrored or independent short conditions; other directions cannot include a short branch",
      });
    let count = 0;
    let comparisonCount = 0;
    const validateOperands = (c: Condition, entryContext: boolean) => {
      if (c.kind === "GROUP")
        return c.children.forEach((x) => validateOperands(x, entryContext));
      if (c.kind === "HOLD") return validateOperands(c.condition, entryContext);
      for (const o of [c.left, c.right]) {
        if ((o.kind === "PRICE" || o.kind === "INDICATOR") && !supportedFrames.includes(o.timeframe))
          ctx.addIssue({ code: "custom", message: `กระดานและตลาดที่เลือกไม่รองรับ ${o.timeframe}` });
        if (o.kind === "INDICATOR") {
          const definition = indicatorByName[o.name];
          if (o.params && !definition)
            ctx.addIssue({
              code: "custom",
              message: "This indicator does not accept extended parameters",
            });
          for (const [key, value] of Object.entries(o.params ?? {})) {
            const p = definition?.params.find(
              (p) => p.key === key && key !== "period",
            );
            if (
              !p ||
              value < p.min ||
              value > p.max ||
              (p.integer && !Number.isInteger(value))
            )
              ctx.addIssue({
                code: "custom",
                message: `Invalid ${o.name} parameter: ${key}`,
              });
          }
          if (
            definition?.params.some((p) => p.key === "fast") &&
            [
              "APO",
              "PPO",
              "CHAIKIN_OSC",
              "KVO",
              "VOLUME_OSC",
              "VIDYA",
            ].includes(o.name)
          ) {
            const get = (key: string) =>
              o.params?.[key] ??
              definition.params.find((p) => p.key === key)!.value;
            if (get("fast") >= get("slow"))
              ctx.addIssue({
                code: "custom",
                message: "Slow period must exceed fast period",
              });
          }
          if (
            o.name === "PSAR" &&
            (o.params?.acceleration ?? 0.02) > (o.params?.maximum ?? 0.2)
          )
            ctx.addIssue({
              code: "custom",
              message: "SAR acceleration must not exceed maximum",
            });
          if (o.name === "ULTOSC") {
            const q = o.params ?? {};
            if (
              (q.fast ?? 7) > (q.medium ?? 14) ||
              (q.medium ?? 14) > (q.slow ?? 28)
            )
              ctx.addIssue({
                code: "custom",
                message: "Ultimate Oscillator periods must be ordered",
              });
          }
          if (o.name.startsWith("KST_")) {
            const q = o.params ?? {};
            if (!(
              (q.roc1 ?? 10) < (q.roc2 ?? 15) &&
              (q.roc2 ?? 15) < (q.roc3 ?? 20) &&
              (q.roc3 ?? 20) < (q.roc4 ?? 30)
            ))
              ctx.addIssue({
                code: "custom",
                message: "KST ROC periods must increase from 1 to 4",
              });
          }
        }
        if (o.kind === "INDICATOR" && (o.name === "CUSTOM") !== !!o.formula)
          ctx.addIssue({
            code: "custom",
            message:
              "Custom indicators require a formula; built-ins cannot override formulas",
          });
        if (entryContext && o.kind === "ENTRY_RETURN")
          ctx.addIssue({
            code: "custom",
            message: "Entry and waiting stages cannot reference an entry price",
          });
        if (
          o.kind === "INDICATOR" &&
          o.name.startsWith("MACD") &&
          (o.slow ?? 26) <= o.period
        )
          ctx.addIssue({
            code: "custom",
            message: "MACD slow must exceed fast period",
          });
      }
    };
    validateOperands(s.entry, true);
    s.stages.forEach((x) => validateOperands(x.condition, true));
    if (s.exit) validateOperands(s.exit, false);
    if (s.cancel) validateOperands(s.cancel, false);
    if (s.short) {
      validateOperands(s.short.entry, true);
      s.short.stages.forEach((x) => validateOperands(x.condition, true));
      if (s.short.exit) validateOperands(s.short.exit, false);
      if (s.short.cancel) validateOperands(s.short.cancel, false);
    }
    const walk = (c: Condition, depth = 0) => {
      count++;
      if (c.kind === "COMPARE") comparisonCount++;
      if (depth > 5)
        ctx.addIssue({
          code: "custom",
          message: "Condition nesting exceeds 5",
        });
      if (c.kind === "GROUP") c.children.forEach((x) => walk(x, depth + 1));
      if (c.kind === "HOLD") walk(c.condition, depth + 1);
    };
    [
      s.entry,
      s.exit,
      s.cancel,
      ...s.stages.map((x) => x.condition),
      s.short?.entry,
      s.short?.exit,
      s.short?.cancel,
      ...(s.short?.stages.map((x) => x.condition) ?? []),
    ]
      .filter(Boolean)
      .forEach((c) => walk(c!));
    if (count > 60)
      ctx.addIssue({ code: "custom", message: "Maximum 60 conditions" });
    if (comparisonCount > MAX_SETUP_CONDITIONS)
      ctx.addIssue({
        code: "custom",
        message:
          `เซ็ตอัพมีได้สูงสุด ${MAX_SETUP_CONDITIONS} เงื่อนไข รวมเงื่อนไขเริ่มต้น รอยืนยัน ออก ยกเลิก และ Short ที่ตั้งแยก`,
      });
    if (
      new Set(s.exchange).size !== s.exchange.length ||
      new Set(s.pairs).size !== s.pairs.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate targets" });
  });
export const strategySchema = z.preprocess((input, ctx) => {
  const queue: { value: unknown; depth: number }[] = [
    { value: input, depth: 0 },
  ];
  let count = 0;
  while (queue.length) {
    const { value, depth } = queue.pop()!;
    if (++count > 3000 || depth > 22) {
      ctx.addIssue({
        code: "custom",
        message: "Strategy is too deeply nested or too large",
      });
      return z.NEVER;
    }
    if (value && typeof value === "object")
      for (const child of Object.values(value))
        queue.push({ value: child, depth: depth + 1 });
  }
  return input;
}, strategyStructure);
export type Strategy = z.infer<typeof strategySchema>;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
function ema(v: number[], n: number) {
  if (v.length < n) return undefined;
  let x = mean(v.slice(0, n));
  for (const p of v.slice(n)) x += ((p - x) * 2) / (n + 1);
  return x;
}
export function indicator(
  c: Candle[],
  name: string,
  n: number,
  slow = 26,
  signal = 9,
  deviation = 2,
): number | undefined {
  const v = c.map((x) => x.close);
  if (c.length < n) return undefined;
  const tail = v.slice(-n),
    sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const hi = Math.max(...c.slice(-n).map((x) => x.high)),
    lo = Math.min(...c.slice(-n).map((x) => x.low));
  if (name === "WMA")
    return sum(tail.map((x, i) => x * (i + 1))) / ((n * (n + 1)) / 2);
  if (name === "RMA") {
    let r = mean(v.slice(0, n));
    for (const x of v.slice(n)) r += (x - r) / n;
    return r;
  }
  if (name === "VWMA") {
    const rows = c.slice(-n),
      vol = sum(rows.map((x) => x.volume));
    return vol === 0
      ? undefined
      : sum(rows.map((x) => x.close * x.volume)) / vol;
  }
  if (name === "MOM" || name === "ROC") {
    if (v.length <= n) return;
    const old = v[v.length - n - 1];
    return name === "MOM"
      ? v.at(-1)! - old
      : old === 0
        ? undefined
        : 100 * (v.at(-1)! / old - 1);
  }
  if (name === "HIGHEST") return Math.max(...tail);
  if (name === "LOWEST") return Math.min(...tail);
  if (name === "DONCHIAN_UPPER") return hi;
  if (name === "DONCHIAN_LOWER") return lo;
  if (name === "DONCHIAN_MID") return (hi + lo) / 2;
  if (name === "STOCH_K")
    return hi === lo ? undefined : (100 * (v.at(-1)! - lo)) / (hi - lo);
  if (name === "WILLIAMS_R")
    return hi === lo ? undefined : (-100 * (hi - v.at(-1)!)) / (hi - lo);
  if (name === "STDDEV" || name === "VARIANCE") {
    const m = mean(tail),
      variance = mean(tail.map((x) => (x - m) ** 2));
    return name === "STDDEV" ? Math.sqrt(variance) : variance;
  }
  if (name === "CCI") {
    const m = mean(tail),
      dev = mean(tail.map((x) => Math.abs(x - m)));
    return dev === 0 ? undefined : (v.at(-1)! - m) / (0.015 * dev);
  }
  if (name === "CMF") {
    const rows = c.slice(-n),
      vol = sum(rows.map((x) => x.volume));
    return vol === 0
      ? undefined
      : sum(
          rows.map((x) =>
            x.high === x.low
              ? 0
              : ((2 * x.close - x.high - x.low) / (x.high - x.low)) * x.volume,
          ),
        ) / vol;
  }
  if (name === "MFI") {
    if (c.length <= n) return;
    let up = 0,
      down = 0;
    for (let i = c.length - n; i < c.length; i++) {
      const tp = (c[i].high + c[i].low + c[i].close) / 3,
        prev = (c[i - 1].high + c[i - 1].low + c[i - 1].close) / 3,
        m = tp * c[i].volume;
      if (tp > prev) up += m;
      else if (tp < prev) down += m;
    }
    return up + down === 0 ? undefined : (100 * up) / (up + down);
  }
  if (name === "TR") {
    if (c.length < 2) return;
    const x = c.at(-1)!,
      prev = c.at(-2)!.close;
    return Math.max(
      x.high - x.low,
      Math.abs(x.high - prev),
      Math.abs(x.low - prev),
    );
  }
  if (name === "BB_MIDDLE") return mean(tail);
  if (name === "BB_WIDTH" || name === "BB_PERCENT") {
    const m = mean(tail),
      sd = Math.sqrt(mean(tail.map((x) => (x - m) ** 2))),
      width = 2 * deviation * sd;
    return name === "BB_WIDTH"
      ? m === 0
        ? undefined
        : (width / m) * 100
      : width === 0
        ? undefined
        : (v.at(-1)! - (m - deviation * sd)) / width;
  }
  if (name === "SMA") return mean(v.slice(-n));
  if (name === "EMA") return ema(v, n);
  if (name === "BB_UPPER" || name === "BB_LOWER") {
    const s = v.slice(-n),
      m = mean(s),
      sd = Math.sqrt(mean(s.map((x) => (x - m) ** 2)));
    return m + (name === "BB_UPPER" ? 1 : -1) * deviation * sd;
  }
  if (name === "VOLUME_RATIO") {
    if (c.length < n + 1) return;
    const m = mean(c.slice(-n - 1, -1).map((x) => x.volume));
    return m === 0 ? undefined : c.at(-1)!.volume / m;
  }
  if (name === "RSI") {
    if (v.length < n + 1) return;
    let up = 0,
      down = 0;
    for (let i = 1; i <= n; i++) {
      const d = v[i] - v[i - 1];
      up += Math.max(0, d) / n;
      down += Math.max(0, -d) / n;
    }
    for (let i = n + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      up = (up * (n - 1) + Math.max(d, 0)) / n;
      down = (down * (n - 1) + Math.max(-d, 0)) / n;
    }
    return up === 0 && down === 0
      ? 50
      : down === 0
        ? 100
        : 100 - 100 / (1 + up / down);
  }
  if (name === "ATR") {
    if (c.length < n + 1) return;
    const tr = c
      .slice(1)
      .map((x, i) =>
        Math.max(
          x.high - x.low,
          Math.abs(x.high - c[i].close),
          Math.abs(x.low - c[i].close),
        ),
      );
    let a = mean(tr.slice(0, n));
    for (const x of tr.slice(n)) a = (a * (n - 1) + x) / n;
    return a;
  }
  if (name.startsWith("MACD")) {
    if (slow <= n || v.length < slow) return;
    const diffs: number[] = [];
    let fast = ema(v.slice(0, slow), n)!;
    let slowValue = mean(v.slice(0, slow));
    diffs.push(fast - slowValue);
    for (let i = slow; i < v.length; i++) {
      fast += ((v[i] - fast) * 2) / (n + 1);
      slowValue += ((v[i] - slowValue) * 2) / (slow + 1);
      diffs.push(fast - slowValue);
    }
    const macd = diffs.at(-1)!;
    if (name === "MACD") return macd;
    const sig = ema(diffs, signal);
    return sig === undefined
      ? undefined
      : name === "MACD_SIGNAL"
        ? sig
        : macd - sig;
  }
}
export type Truth = "TRUE" | "FALSE" | "UNKNOWN";
// Market history arrays are replaced when a new candle arrives. A WeakMap lets
// rules share the same closed prefix without retaining discarded history.
const closedPrefixes = new WeakMap<Candle[], Map<number, Candle[]>>();
function closedThrough(rows: Candle[], time: number) {
  let cached = closedPrefixes.get(rows);
  if (!cached) {
    cached = new Map();
    closedPrefixes.set(rows, cached);
  }
  const hit = cached.get(time);
  if (hit) return hit;
  const prefix = rows.filter((row) => row.time <= time);
  cached.set(time, prefix);
  if (cached.size > 16) cached.delete(cached.keys().next().value!);
  return prefix;
}
export type Evidence = {
  result: Truth;
  left?: number;
  right?: number;
  reason?: string;
  children?: Evidence[];
};
export function value(
  o: Operand,
  series: Series,
  time: number,
  entryPrice?: number,
  base: keyof typeof frames = "15m",
  side: "SPOT" | "LONG" | "SHORT" | "UNSPECIFIED" = "LONG",
): number | undefined {
  if (o.kind === "CONSTANT") return o.value;
  if (o.kind === "ENTRY_RETURN") {
    if (side === "UNSPECIFIED") return undefined;
    const c = closedThrough(series[base] ?? [], time).at(-1);
    return c && time - c.time < frames[base] && entryPrice
      ? (c.close / entryPrice - 1) * 100 * (side === "SHORT" ? -1 : 1)
      : undefined;
  }
  const c = closedThrough(series[o.timeframe] ?? [], time);
  if (!c.length || time - c.at(-1)!.time >= frames[o.timeframe]) return;
  if (o.kind === "INDICATOR" && indicatorByName[o.name]) {
    return extendedValue(
      o,
      series[o.timeframe]!,
      c.length - 1,
      frames[o.timeframe],
    );
  }
  const required =
    o.kind === "INDICATOR"
      ? Math.max(
          ...(o.formula?.terms.map((t) => t.period + 1) ?? [0]),
          o.period + 1,
          o.name.startsWith("MACD") ? (o.slow ?? 26) + (o.signal ?? 9) : 0,
        )
      : 1;
  for (let i = Math.max(1, c.length - required); i < c.length; i++)
    if (c[i].time - c[i - 1].time !== frames[o.timeframe]) return;
  if (o.kind === "PRICE") return c.at(-1)![o.field];
  const source = o.source ?? "close";
  const sourced =
    source === "close" ||
    [
      "ATR",
      "VOLUME_RATIO",
      "MFI",
      "CMF",
      "STOCH_K",
      "WILLIAMS_R",
      "DONCHIAN_UPPER",
      "DONCHIAN_LOWER",
      "DONCHIAN_MID",
      "TR",
    ].includes(o.name)
      ? c
      : c.map((x) => ({
          ...x,
          close:
            source === "hl2"
              ? (x.high + x.low) / 2
              : source === "hlc3"
                ? (x.high + x.low + x.close) / 3
                : source === "ohlc4"
                  ? (x.open + x.high + x.low + x.close) / 4
                  : x[source],
        }));
  if (o.name === "CUSTOM") {
    if (!o.formula) return;
    let total = o.formula.offset;
    for (const term of o.formula.terms) {
      const v = indicator(
        term.name === "ATR" ? c : sourced,
        term.name,
        term.period,
      );
      if (v === undefined || !Number.isFinite(v)) return;
      total += term.weight * v;
    }
    return Number.isFinite(total) ? total : undefined;
  }
  return indicator(sourced, o.name, o.period, o.slow, o.signal, o.deviation);
}
export function evaluate(
  c: Condition,
  series: Series,
  time: number,
  base: keyof typeof frames = "15m",
  entryPrice?: number,
  side: "SPOT" | "LONG" | "SHORT" | "UNSPECIFIED" = "LONG",
): Evidence {
  if (c.kind === "GROUP" || c.kind === "HOLD") {
    const children =
      c.kind === "GROUP"
        ? c.children.map((x) =>
            evaluate(x, series, time, base, entryPrice, side),
          )
        : Array.from({ length: c.bars }, (_, i) =>
            evaluate(
              c.condition,
              series,
              time - i * frames[base],
              base,
              entryPrice,
              side,
            ),
          );
    const or = c.kind === "GROUP" && c.op === "OR";
    const result: Truth = children.some(
      (x) => x.result === (or ? "TRUE" : "FALSE"),
    )
      ? or
        ? "TRUE"
        : "FALSE"
      : children.some((x) => x.result === "UNKNOWN")
        ? "UNKNOWN"
        : or
          ? "FALSE"
          : "TRUE";
    return { result, children };
  }
  const left = value(c.left, series, time, entryPrice, base, side),
    right = value(c.right, series, time, entryPrice, base, side);
  if (
    left === undefined ||
    right === undefined ||
    !Number.isFinite(left) ||
    !Number.isFinite(right)
  )
    return { result: "UNKNOWN", reason: "ข้อมูลไม่พอหรือมีช่วงขาด" };
  let matched = false;
  if (c.op.startsWith("CROSS")) {
    const a = value(
        c.left,
        series,
        time - frames[base],
        entryPrice,
        base,
        side,
      ),
      b = value(c.right, series, time - frames[base], entryPrice, base, side);
    if (a === undefined || b === undefined)
      return {
        result: "UNKNOWN",
        left,
        right,
        reason: "ไม่มีค่าก่อนหน้าสำหรับตรวจการตัด",
      };
    matched =
      c.op === "CROSS_ABOVE" ? a <= b && left > right : a >= b && left < right;
  } else
    matched =
      c.op === ">"
        ? left > right
        : c.op === ">="
          ? left >= right
          : c.op === "<"
            ? left < right
            : left <= right;
  return { result: matched ? "TRUE" : "FALSE", left, right };
}
/** Each AND entry unit has equal weight. OR/HOLD remain atomic, lifecycle checks stay strict. */
export function evaluateEntry(spec: Strategy, series: Series, time: number): Evidence {
  const side = signalSide(spec),
    base = spec.timeframe;
  const percent = spec.entryMatchPercent ?? 100;
  if (percent === 100) return evaluate(spec.entry, series, time, base, undefined, side);
  const children = entryUnits(spec.entry).map(c =>
    evaluate(c, series, time, base, undefined, side),
  );
  const { total, needed } = flexibilityCounts(spec.entry, percent);
  const matched = children.filter(x => x.result === "TRUE").length;
  const unknown = children.filter(x => x.result === "UNKNOWN").length;
  const result: Truth = matched >= needed ? "TRUE"
    : matched + unknown < needed ? "FALSE" : "UNKNOWN";
  return {
    result,
    children,
    reason: `ผ่าน ${matched}/${total} ข้อ · ต้องผ่านอย่างน้อย ${needed} ข้อ (${percent}%)`,
  };
}
export type Signal = {
  market: Strategy["market"];
  side: "SPOT" | "LONG" | "SHORT" | "UNSPECIFIED";
  time: number;
  kind: "ENTRY" | "EXIT" | "CANCEL" | "EXPIRED";
  referencePrice: number;
  evidence: Evidence;
  stage: number;
};
export type Lifecycle = {
  sides?: { long: Lifecycle; short: Lifecycle };
  lastTime: number;
  active: boolean;
  entryPrice?: number;
  stage: number;
  deadline: number;
  cooldownUntil: number;
  latched: boolean;
};
export const emptyLifecycle = (): Lifecycle => ({
  lastTime: 0,
  active: false,
  stage: -1,
  deadline: 0,
  cooldownUntil: 0,
  latched: false,
});
/** Same closed-bar transition for replay and durable monitoring. Repeated bars are no-ops. */
function advanceSingle(
  spec: Strategy,
  series: Series,
  bar: Candle,
  previous: Lifecycle,
): { state: Lifecycle; events: Signal[] } {
  const state = { ...previous },
    events: Signal[] = [],
    time = bar.time,
    step = frames[spec.timeframe];
  if (time <= state.lastTime) return { state, events };
  const gap = state.lastTime > 0 && time - state.lastTime !== step;
  state.lastTime = time;
  const emit = (
    kind: Signal["kind"],
    evidence: Evidence,
    stage = state.stage,
  ) =>
    events.push({
      time,
      kind,
      referencePrice: bar.close,
      evidence,
      stage,
      market: spec.market,
      side: signalSide(spec),
    });
  const check = (c: Condition) =>
    evaluate(
      c,
      series,
      time,
      spec.timeframe,
      state.entryPrice,
      signalSide(spec),
    );
  const reset = () => {
    state.active = false;
    state.stage = -1;
    delete state.entryPrice;
    state.latched = true;
  };
  if (gap) {
    if (state.active || state.stage >= 0)
      emit("CANCEL", {
        result: "UNKNOWN",
        reason: "ข้อมูลขาด ต้องเริ่มวงจรสัญญาณใหม่",
      });
    reset();
    return { state, events };
  }
  if (spec.cancel && (state.active || state.stage >= 0)) {
    const evidence = check(spec.cancel);
    if (evidence.result === "TRUE") {
      emit("CANCEL", evidence);
      reset();
      return { state, events };
    }
  }
  if (state.active) {
    if (spec.exit) {
      const evidence = check(spec.exit);
      if (evidence.result === "TRUE") {
        emit("EXIT", evidence);
        reset();
        state.cooldownUntil = time + spec.cooldownBars * step;
      }
    }
    return { state, events };
  }
  const enter = (evidence: Evidence, stage: number) => {
    emit("ENTRY", evidence, stage);
    state.stage = -1;
    state.active = !!spec.exit;
    state.entryPrice = bar.close;
    state.cooldownUntil = time + spec.cooldownBars * step;
    state.latched = true;
  };
  if (state.stage >= 0) {
    if (time > state.deadline) {
      const waiting = spec.stages[state.stage];
      const condition = waiting.condition;
      const operandName = (value: Operand): string =>
        value.kind === 'INDICATOR' ? (value.name === 'MACD_SIGNAL' ? 'เส้นสัญญาณ MACD' : value.name)
          : value.kind === 'PRICE' ? 'ราคา' : value.kind === 'CONSTANT' ? String(value.value) : 'ผลตอบแทน';
      const description = condition.kind === 'COMPARE'
        ? `${operandName(condition.left)} ${condition.op === 'CROSS_ABOVE' ? 'ตัดขึ้น' : condition.op === 'CROSS_BELOW' ? 'ตัดลง' : condition.op} ${operandName(condition.right)}`
        : `ขั้นที่ ${state.stage + 1}`;
      emit("EXPIRED", { result: "FALSE", reason: `เงื่อนไข ${description} ไม่ครบภายใน ${waiting.withinBars} แท่ง (${spec.timeframe})` });
      reset();
      return { state, events };
    }
    const evidence = check(spec.stages[state.stage].condition);
    if (evidence.result === "TRUE") {
      state.stage++;
      if (state.stage < spec.stages.length)
        state.deadline = time + spec.stages[state.stage].withinBars * step;
      else enter(evidence, spec.stages.length);
    }
    return { state, events };
  }
  const evidence = evaluateEntry(spec, series, time);
  if (evidence.result === "FALSE") state.latched = false;
  if (
    evidence.result !== "TRUE" ||
    state.latched ||
    time <= state.cooldownUntil
  )
    return { state, events };
  if (spec.stages.length) {
    state.stage = 0;
    state.deadline = time + spec.stages[0].withinBars * step;
    state.latched = true;
  } else enter(evidence, 0);
  return { state, events };
}
export function signalSide(spec: Strategy): Signal["side"] {
  return spec.market === "Spot"
    ? "SPOT"
    : spec.side === "LONG" || spec.side === "SHORT"
      ? spec.side
      : "UNSPECIFIED";
}
export function strategyBranches(spec: Strategy): Strategy[] {
  if (spec.mirrorShort) {
    const { short, mirrorShort, ...common } = spec;
    const mirrored = {
      ...common,
      ...mirrorBranch(common),
      side: "SHORT" as const,
    };
    return spec.side === "BOTH"
      ? [{ ...common, side: "LONG" }, mirrored]
      : [mirrored];
  }
  if (spec.side !== "BOTH" || !spec.short) return [spec];
  const { short, ...common } = spec;
  // Explicitly remove long optional conditions before constructing the short branch.
  const { entry, exit, cancel, stages, cooldownBars, ...shared } = common;
  return [
    { ...common, side: "LONG" },
    { ...shared, ...short, side: "SHORT" },
  ];
}
export function strategyConditions(spec: Strategy): Condition[] {
  return strategyBranches(spec).flatMap((s) =>
    [s.entry, s.exit, s.cancel, ...s.stages.map((x) => x.condition)].filter(
      (c): c is Condition => !!c,
    ),
  );
}
export function strategyOperands(spec: Strategy): Operand[] {
  const collect = (condition: Condition): Operand[] => {
    if (condition.kind === "GROUP") return condition.children.flatMap(collect);
    if (condition.kind === "HOLD") return collect(condition.condition);
    return [condition.left, condition.right];
  };
  return strategyConditions(spec).flatMap(collect);
}
export function advance(
  spec: Strategy,
  series: Series,
  bar: Candle,
  previous: Lifecycle,
): { state: Lifecycle; events: Signal[] } {
  if (bar.time <= previous.lastTime) return { state: previous, events: [] };
  if (spec.side !== "BOTH")
    return advanceSingle(strategyBranches(spec)[0], series, bar, previous);
  const [longSpec, shortSpec] = strategyBranches(spec);
  const long = advanceSingle(
    longSpec,
    series,
    bar,
    previous.sides?.long ?? emptyLifecycle(),
  );
  const short = advanceSingle(
    shortSpec,
    series,
    bar,
    previous.sides?.short ?? emptyLifecycle(),
  );
  return {
    state: {
      ...emptyLifecycle(),
      lastTime: bar.time,
      active: long.state.active || short.state.active,
      sides: { long: long.state, short: short.state },
    },
    events: [...long.events, ...short.events],
  };
}
export function replay(spec: Strategy, series: Series): Signal[] {
  let state = emptyLifecycle();
  const events: Signal[] = [];
  for (const bar of series[spec.timeframe] ?? []) {
    const result = advance(spec, series, bar, state);
    state = result.state;
    events.push(...result.events);
  }
  return events;
}
