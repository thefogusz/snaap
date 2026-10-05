import ccxt from "ccxt";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import { preview } from "./domain/preview.js";
import { indicatorByName } from "../dist/indicator-catalog.js";
import { availableTimeframes, lastClosedBoundary } from "../dist/timeframes.js";
import {
  frames,
  timeframe,
  replay,
  evaluate,
  advance,
  emptyLifecycle,
  strategySchema,
  strategyConditions,
  type Candle,
  type Series,
  type Condition,
  operand,
  type Strategy,
} from "./domain/engine.js";
const ids = {
  Binance: "binance",
  Bybit: "bybit",
  OKX: "okx",
  Bitget: "bitget",
  MEXC: "mexc",
} as const;
const clients = new Map<string, any>(),
  cache = new Map<string, { at: number; data: Candle[] }>(),
  pending = new Map<string, Promise<Candle[]>>();
function marketClient(exchange: keyof typeof ids, market: string) {
  const key = exchange + market;
  if (clients.has(key)) return clients.get(key);
  const spot = market === "Spot";
  const types =
    exchange === "MEXC"
      ? { spot, swap: { linear: !spot, inverse: false } }
      : [
          spot
            ? "spot"
            : exchange === "Binance" || exchange === "Bybit"
              ? "linear"
              : "swap",
        ];
  const Constructor = (ccxt as any)[ids[exchange]];
  const client = new Constructor({
    enableRateLimit: true,
    timeout: 12000,
    options: { defaultType: spot ? "spot" : "swap", fetchMarkets: { types } },
  });
  clients.set(key, client);
  return client;
}
const streamCandles = new Map<string, Candle[]>();
const candleKey = (
  exchange: string,
  market: string,
  pair: string,
  frame: string,
) => [exchange, market, pair, frame].join(":");
// REST pages can supply up to 2,400 bars. Some accepted indicators (for example
// TEMA 500) need more than 1,000 bars; keep their requested warmup when merging.
const maxCandleHistory = 2400;
const mergeCandles = (a: Candle[], b: Candle[], retain = 1000) =>
  [...new Map([...a, ...b].map((c) => [c.time, c])).values()]
    .sort((a, b) => a.time - b.time)
    .slice(-Math.min(maxCandleHistory, Math.max(1000, retain)));
export function invalidateCandles(
  exchange: string,
  market: string,
  pair: string,
  frame: string,
) {
  const prefix = [exchange, market, pair, frame].join(":") + ":";
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
  streamCandles.delete(candleKey(exchange, market, pair, frame));
}
export function ingestClosedCandles(
  exchange: string,
  market: string,
  pair: string,
  frame: keyof typeof frames,
  closed: Candle[],
) {
  if (!closed.length) return;
  const streamKey = candleKey(exchange, market, pair, frame);
  streamCandles.set(
    streamKey,
    mergeCandles(streamCandles.get(streamKey) ?? [], closed),
  );
  const prefix = [exchange, market, pair, frame].join(":") + ":";
  for (const [key, hit] of cache)
    if (key.startsWith(prefix))
      cache.set(key, {
        at: Date.now(),
        data: mergeCandles(hit.data, closed, hit.data.length),
      });
}
export const marketHealth = new Map<
  string,
  { status: string; lastSuccess?: string; message?: string }
>();
const catalogs = new Map<
  string,
  { at: number; items: { symbol: string; supported: boolean }[] }
>();
const catalogPending = new Map<
  string,
  Promise<{ at: number; items: { symbol: string; supported: boolean }[] }>
>();
export async function instruments(
  exchange: keyof typeof ids,
  market: string,
  refresh = false,
) {
  const key = exchange + market;
  const running = catalogPending.get(key);
  if (running) return running;
  const hit = catalogs.get(key);
  if (!refresh && hit && Date.now() - hit.at < 300000) return hit;
  const client = marketClient(exchange, market);
  const work = (async () => {
    try {
      const markets = await client.loadMarkets(true);
      const items = Object.values(markets)
        .filter(
          (m: any) =>
            m.active === true && (market === "Spot" ? m.spot : m.swap),
        )
        .map((m: any) => ({
          symbol: m.symbol.split(":")[0],
          supported:
            !!client.has.fetchOHLCV &&
            (market === "Spot" || (m.linear && m.settle === "USDT")),
        }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      const result = {
        at: Date.now(),
        exchange,
        market,
        items: [
          ...new Map(
            items
              .sort((a, b) => Number(a.supported) - Number(b.supported))
              .map((m) => [m.symbol, m]),
          ).values(),
        ].sort((a, b) => a.symbol.localeCompare(b.symbol)),
      };
      catalogs.set(key, result);
      return result;
    } catch {
      throw new ApiError(
        502,
        "CATALOG_UNAVAILABLE",
        `โหลดคู่เทรดจาก ${exchange} ไม่สำเร็จ ลองอีกครั้ง`,
      );
    }
  })();
  catalogPending.set(key, work);
  try {
    return await work;
  } finally {
    catalogPending.delete(key);
  }
}
export async function candles(
  exchange: keyof typeof ids,
  market: string,
  pair: string,
  frame: keyof typeof frames,
  requiredBars = 500,
): Promise<Candle[]> {
  if (!availableTimeframes([exchange], market).includes(frame))
    throw new ApiError(400, "TIMEFRAME_UNSUPPORTED", `${exchange} ไม่รองรับไทม์เฟรม ${frame} ในตลาดนี้`);
  const key = [exchange, market, pair, frame, requiredBars].join(":");
  const hit = cache.get(key);
  const expectedClose = lastClosedBoundary(Date.now(), frame);
  const completeHistory = hit?.data.every(
    (bar, index, bars) =>
      index === 0 || bar.time - bars[index - 1].time === frames[frame],
  );
  if (hit && completeHistory && hit.data.at(-1)!.time >= expectedClose)
    return hit.data;
  if (pending.has(key)) return pending.get(key)!;
  const work = (async () => {
    const clientKey = exchange + market;
    const client = marketClient(exchange, market);
    try {
      await client.loadMarkets();
      const symbol = market === "Spot" ? pair : `${pair}:USDT`;
      const instrument = client.markets[symbol];
      if (
        !instrument ||
        instrument.active !== true ||
        (market === "Spot"
          ? !instrument.spot
          : !instrument.swap ||
            !instrument.linear ||
            instrument.settle !== "USDT")
      )
        throw new Error("UNSUPPORTED_INSTRUMENT");
      if (!client.has.fetchOHLCV) throw new Error("OHLCV_UNSUPPORTED");
      const now = Date.now();
      const raw: number[][] = [];
      // Reuse confirmed history; overlap one closed bar to pick up corrections.
      const reusable =
        completeHistory &&
        hit &&
        expectedClose - hit.data.at(-1)!.time < requiredBars * frames[frame];
      let since = reusable
        ? hit.data.at(-1)!.time - frames[frame]
        : lastClosedBoundary(now, frame) -
          requiredBars * frames[frame];
      for (let page = 0; page < 8; page++) {
        const batch: number[][] = await client.fetchOHLCV(
          symbol,
          frame,
          since,
          Math.min(300, requiredBars + 1),
        );
        if (!batch.length) break;
        raw.push(...batch);
        const next = Math.max(...batch.map((r) => r[0])) + frames[frame];
        if (next <= since || next >= now) break;
        since = next;
      }
      const data: Candle[] = raw
        .map((r: number[]) => ({
          time: r[0] + frames[frame],
          open: r[1],
          high: r[2],
          low: r[3],
          close: r[4],
          volume: r[5],
        }))
        .filter(
          (r: Candle) =>
            r.time <= now && Object.values(r).every(Number.isFinite),
        );
      data.sort((a, b) => a.time - b.time);
      const dedup = mergeCandles(
        mergeCandles(hit?.data ?? [], data, requiredBars),
        streamCandles.get(candleKey(exchange, market, pair, frame)) ?? [],
        requiredBars,
      );
      if (!dedup.length || now - dedup.at(-1)!.time > frames[frame] * 2)
        throw new Error("STALE");
      cache.set(key, { at: now, data: dedup });
      if (cache.size > 500) cache.delete(cache.keys().next().value!);
      marketHealth.set(clientKey, {
        status: "READY",
        lastSuccess: new Date().toISOString(),
      });
      return dedup;
    } catch (error) {
      const message =
        error instanceof Error &&
        ["UNSUPPORTED_INSTRUMENT", "OHLCV_UNSUPPORTED", "STALE"].includes(
          error.message,
        )
          ? error.message
          : "เชื่อมต่อกระดานไม่สำเร็จ";
      marketHealth.set(clientKey, { status: "UNAVAILABLE", message });
      throw new ApiError(502, "MARKET_UNAVAILABLE", `${exchange}: ${message}`);
    }
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
export function neededFrames(spec: Strategy) {
  const result = new Set<keyof typeof frames>([spec.timeframe]);
  const walk = (c: Condition) => {
    if (c.kind === "GROUP") c.children.forEach(walk);
    else if (c.kind === "HOLD") walk(c.condition);
    else
      for (const o of [c.left, c.right])
        if ("timeframe" in o) result.add(o.timeframe);
  };
  strategyConditions(spec)
    .filter(Boolean)
    .forEach((c) => walk(c!));
  return [...result];
}
export async function strategySeries(
  spec: Strategy,
  exchange: keyof typeof ids,
  pair: string,
  extra: import("./domain/engine.js").Operand[] = [],
) {
  const series: Series = {};
  const warmup = new Map<string, number>();
  const collect = (o: import("./domain/engine.js").Operand) => {
    if (o.kind === "INDICATOR") {
      const definition = indicatorByName[o.name];
      const extendedWarmup = definition
        ? 4 *
            Math.max(
              o.period,
              ...definition.params
                .filter((p) => p.integer)
                .map((p) =>
                  p.key === "period"
                    ? o.period
                    : (o.params?.[p.key] ?? p.value),
                ),
            ) +
          32
        : 0;
      warmup.set(
        o.timeframe,
        Math.max(
          warmup.get(o.timeframe) ?? 500,
          extendedWarmup,
          o.period + 32,
          ...(o.formula?.terms.map((t) => t.period + 32) ?? [0]),
          (o.slow ?? 0) + (o.signal ?? 9) + 32,
        ),
      );
    }
  };
  const walk = (c: Condition) => {
    if (c.kind === "GROUP") c.children.forEach(walk);
    else if (c.kind === "HOLD") walk(c.condition);
    else {
      collect(c.left);
      collect(c.right);
    }
  };
  strategyConditions(spec).forEach(walk);
  extra.forEach(collect);
  const requestedFrames = new Set(neededFrames(spec));
  for (const o of extra) if (o.kind === "INDICATOR" || o.kind === "PRICE") requestedFrames.add(o.timeframe);
  for (const frame of requestedFrames)
    series[frame] = await candles(
      exchange,
      spec.market,
      pair,
      frame,
      warmup.get(frame) ?? 500,
    );
  return series;
}
export function registerMarkets(
  app: FastifyInstance,
  db: pg.Pool,
  monitoring: boolean,
) {
  app.post("/api/v1/indicators/validate", async (req) => {
    const o = operand.parse(req.body);
    if (o.kind !== "INDICATOR" || o.name !== "CUSTOM" || !o.formula)
      throw new ApiError(
        400,
        "FORMULA_REQUIRED",
        "เลือกสูตร SNAAP JSON v1 ที่รองรับ",
      );
    return o;
  });
  app.get("/api/v1/instruments", async (req) => {
    const query = z
      .object({
        exchange: z.enum(["Binance", "Bybit", "OKX", "Bitget", "MEXC"]),
        market: z.enum(["Spot", "Perpetual Futures"]),
        refresh: z.enum(["true", "false"]).optional(),
      })
      .parse(req.query);
    return instruments(query.exchange, query.market, query.refresh === "true");
  });
  app.post("/api/v1/preview", async (req) => {
    const input = z
      .object({
        spec: strategySchema,
        indicators: z.array(operand).max(8).default([]),
        chartTimeframe: timeframe.optional(),
      })
      .strict()
      .parse(req.body);
    const spec = input.spec;
    const chartFrame = input.chartTimeframe ?? spec.timeframe;
    if (!availableTimeframes(spec.exchange, spec.market).includes(chartFrame))
      throw new ApiError(400, "TIMEFRAME_UNSUPPORTED", `กระดานและตลาดที่เลือกไม่รองรับ ${chartFrame}`);
    if (spec.exchange.length !== 1 || spec.pairs.length !== 1)
      throw new ApiError(
        400,
        "PREVIEW_TARGET",
        "เลือกหนึ่งกระดานและหนึ่งคู่เทรดสำหรับกราฟนี้",
      );
    for (const o of input.indicators) {
      if (
        o.kind !== "INDICATOR" ||
        o.timeframe !== chartFrame ||
        (o.name === "CUSTOM") !== !!o.formula
      )
        throw new ApiError(
          400,
          "INDICATOR_FRAME",
          "อินดิเคเตอร์เสริมใช้กรอบเวลาของกราฟ",
        );
      // Chart-only operands obey the same semantic checks as saved conditions.
      strategySchema.parse({
        ...spec, exchange: ["Binance"], market: "Spot", side: "SPOT", short: undefined, mirrorShort: undefined,
        entry: { kind: "COMPARE", op: ">", left: o, right: { kind: "CONSTANT", value: 0 } },
        stages: [], exit: undefined, cancel: undefined,
      });
    }
    const series = await strategySeries(
      spec,
      spec.exchange[0],
      spec.pairs[0],
      [...input.indicators, { kind: "INDICATOR", name: "SMA", period: 2, timeframe: chartFrame }],
    );
    return {
      ...preview(spec, series, input.indicators, input.chartTimeframe),
      source: {
        exchange: spec.exchange[0],
        pair: spec.pairs[0],
        frame: chartFrame,
        evaluationTimeframe: spec.timeframe,
        asOf: new Date().toISOString(),
      },
    };
  });
  app.get("/api/v1/markets", async () =>
    Object.entries(ids).map(([name]) => ({
      name,
      spot: marketHealth.get(name + "Spot") ?? { status: "NOT_CHECKED" },
      perpetual: marketHealth.get(name + "Perpetual Futures") ?? {
        status: "NOT_CHECKED",
      },
      mode: "WebSocket closed candles + REST recovery",
      continuousMonitoring: monitoring,
    })),
  );
  app.post("/api/v1/replay", async (req) => {
    const input = z
      .object({
        spec: strategySchema,
        exchange: z.enum(["Binance", "Bybit", "OKX", "Bitget", "MEXC"]),
        pair: z
          .string()
          .regex(/^[A-Z0-9][A-Z0-9._-]{0,39}\/[A-Z0-9][A-Z0-9._-]{0,19}$/),
      })
      .strict()
      .parse(req.body);
    if (
      !input.spec.exchange.includes(input.exchange) ||
      !input.spec.pairs.includes(input.pair)
    )
      throw new ApiError(400, "TARGET_MISMATCH", "เลือกคู่และกระดานในกฎ");
    const series = await strategySeries(input.spec, input.exchange, input.pair);
    const simulation = preview(input.spec, series);
    const result = {
      id: randomUUID(),
      events: simulation.events,
      candles: series[input.spec.timeframe],
      timeline: simulation.timeline.slice(-100),
      source: {
        exchange: input.exchange,
        pair: input.pair,
        frame: input.spec.timeframe,
        asOf: new Date().toISOString(),
      },
      limitations: [
        "Replay สัญญาณจากแท่งย้อนหลังที่ดึงได้ ไม่ใช่ผลตอบแทนหรือสถานะถือจริง",
        "อาจมีข้อมูลตั้งต้นไม่พอสำหรับอินดิเคเตอร์ระยะยาว",
      ],
    };
    await db.query(
      "INSERT INTO replay_runs(id,owner_id,spec,result) VALUES($1,$2,$3,$4)",
      [result.id, req.userId, input.spec, result],
    );
    return result;
  });
  app.get("/api/v1/replays/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const row = (
      await db.query(
        "SELECT result FROM replay_runs WHERE id=$1 AND owner_id=$2",
        [id, req.userId],
      )
    ).rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "ไม่พบ replay");
    return row.result;
  });
  app.post("/api/v1/strategies/validate", async (req) => ({
    valid: true,
    spec: strategySchema.parse(req.body),
  }));
}
