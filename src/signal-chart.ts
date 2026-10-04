import sharp from "sharp";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { Candle } from "./domain/engine.js";
import type { Signal } from "./notification-format.js";

export type ChartSnapshot = {
  timeframe: string;
  candles: Pick<Candle, "time" | "open" | "high" | "low" | "close">[];
};
export function captureChart(
  bars: Candle[],
  at: number,
  timeframe: string,
): ChartSnapshot | undefined {
  const candles = bars
    .filter(
      (b) =>
        b.time <= at &&
        [b.time, b.open, b.high, b.low, b.close].every(Number.isFinite) &&
        b.low > 0 &&
        b.high >= Math.max(b.open, b.close) &&
        b.low <= Math.min(b.open, b.close),
    )
    .sort((a, b) => a.time - b.time)
    .slice(-60)
    .map(({ time, open, high, low, close }) => ({
      time,
      open,
      high,
      low,
      close,
    }));
  return candles.length ? { timeframe, candles } : undefined;
}
const escape = (text: unknown) =>
  String(text ?? "")
    .slice(0, 100)
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
export function chartToken(
  id: string,
  accent: string,
  key = process.env.DATA_ENCRYPTION_KEY ?? "",
) {
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(`snaap-chart:${id}:${accent}`)
    .digest("hex");
}
export function chartUrl(
  id: string,
  accent: string,
  origin: string | undefined,
) {
  if (!origin || !/^[a-f0-9]{64}$/i.test(process.env.DATA_ENCRYPTION_KEY ?? ""))
    return undefined;
  return `${origin}/signal-charts/${id}/${accent}/${chartToken(id, accent)}.png`;
}
export async function chartPng(
  signal: Signal,
  accent: string,
): Promise<Buffer | undefined> {
  if (!signal.chart || !Array.isArray(signal.chart.candles)) return;
  const chart = captureChart(
    signal.chart.candles.map((c) => ({ ...c, volume: 0 })),
    signal.event.time,
    signal.chart.timeframe,
  );
  if (!chart) return;
  const bars = chart.candles,
    width = 1200,
    height = 720,
    left = 65,
    right = 1040,
    top = 145,
    bottom = 590;
  const max = Math.max(...bars.map((b) => b.high), signal.event.referencePrice),
    min = Math.min(...bars.map((b) => b.low), signal.event.referencePrice);
  const range = Math.max(max - min, Math.abs(max) * 0.001),
    low = min - range * 0.1,
    high = max + range * 0.1;
  const y = (price: number) =>
    bottom - ((price - low) / (high - low)) * (bottom - top);
  const start = bars[0].time,
    end = bars.at(-1)!.time;
  const x = (time: number) =>
    bars.length === 1
      ? (left + right) / 2
      : left +
        20 +
        ((time - start) / Math.max(end - start, 1)) * (right - left - 40);
  const color =
    (
      { lime: "#d0f64c", cyan: "#65dceb", violet: "#c8b5ff" } as Record<
        string,
        string
      >
    )[accent] ?? "#d0f64c";
  const ticks = Array.from({ length: 5 }, (_, i) => {
    const value = low + ((high - low) * i) / 4;
    return `<path d="M${left} ${y(value)}H${right}" stroke="#353c44"/><text x="1060" y="${y(value) + 6}" fill="#c3ccd6" font-size="20">${value.toLocaleString("en-US", { maximumFractionDigits: 5 })}</text>`;
  }).join("");
  const candleWidth = Math.max(
    5,
    Math.min(24, ((right - left) / bars.length) * 0.55),
  );
  const candles = bars
    .map((b) => {
      const fill = b.close >= b.open ? "#67e2b1" : "#ff909a";
      return `<path d="M${x(b.time)} ${y(b.high)}V${y(b.low)}" stroke="${fill}" stroke-width="2"/><rect x="${x(b.time) - candleWidth / 2}" y="${Math.min(y(b.open), y(b.close))}" width="${candleWidth}" height="${Math.max(3, Math.abs(y(b.open) - y(b.close)))}" rx="1" fill="${fill}"/>`;
    })
    .join("");
  const stamp = (time: number) =>
    new Date(time).toLocaleString("en-GB", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="1200" height="720" rx="22" fill="#181d24"/><g font-family="Arial,sans-serif"><text x="65" y="63" font-size="34" font-weight="700" fill="${color}">Snaap*</text><text x="65" y="110" font-size="28" font-weight="700" fill="#f6f8fb">${escape(signal.pair)} · ${escape(signal.exchange)} · ${escape(signal.setup_market ?? signal.event.market)} · ${escape(chart.timeframe)}</text><text x="1115" y="63" text-anchor="end" font-size="22" fill="${color}">${signal.test ? "DEMO · " : ""}${escape(signal.event.kind)} ${escape(signal.event.side ?? signal.setup_side)}</text>${ticks}${candles}<path d="M${left} ${y(signal.event.referencePrice)}H${right}" stroke="${color}" stroke-width="2" stroke-dasharray="8 6"/><circle cx="${x(end)}" cy="${y(signal.event.referencePrice)}" r="7" fill="${color}"/><text x="65" y="640" fill="#c3ccd6" font-size="21">${escape(stamp(start))}</text><text x="1040" y="640" text-anchor="end" fill="#c3ccd6" font-size="21">${escape(stamp(end))} · UTC+7</text><text x="65" y="687" fill="${color}" font-size="20">${signal.test ? "DEMO CANDLES" : "CLOSED CANDLES"} · ${bars.length} bars · Reference ${signal.event.referencePrice.toLocaleString("en-US", { maximumFractionDigits: 8 })}</text></g></svg>`;
  return sharp(Buffer.from(svg)).resize({width:1024,withoutEnlargement:true}).png().toBuffer();
}
export function demoChart(at: number): ChartSnapshot {
  let price = 67410;
  const candles = Array.from({ length: 60 }, (_, i) => {
    const open = price;
    price += Math.sin(i * 0.74) * 120 + 18;
    const close = i === 59 ? 68420.5 : price;
    return {
      time: at - (59 - i) * 3600000,
      open,
      close,
      high: Math.max(open, close) + 55 + (i % 3) * 17,
      low: Math.min(open, close) - 55 - (i % 4) * 9,
    };
  });
  return { timeframe: "1h", candles };
}
export function registerSignalCharts(app: FastifyInstance, db: pg.Pool) {
  app.get("/signal-charts/:id/:accent/:token.png", async (req, reply) => {
    const input = z
      .object({
        id: z.union([z.string().uuid(), z.string().regex(/^demo-[0-9]{13}$/)]),
        accent: z.enum(["lime", "cyan", "violet"]),
        token: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(req.params);
    if (
      !/^[a-f0-9]{64}$/i.test(process.env.DATA_ENCRYPTION_KEY ?? "") ||
      !timingSafeEqual(
        Buffer.from(input.token),
        Buffer.from(chartToken(input.id, input.accent)),
      )
    )
      return reply.code(404).send({ error: "NOT_FOUND" });
    const demoTime = input.id.startsWith("demo-")
      ? Number(input.id.slice(5))
      : undefined;
    const row = demoTime
      ? {
          signal_id: input.id,
          event: {
            kind: "ENTRY",
            side: "LONG",
            market: "futures",
            time: demoTime,
            referencePrice: 68420.5,
          },
          pair: "BTC/USDT",
          exchange: "binance",
          revision: 1,
          test: true,
          chart: demoChart(demoTime),
        }
      : (
          await db.query(
            "SELECT id AS signal_id,event,pair,exchange,revision,chart_snapshot AS chart FROM signals WHERE id=$1",
            [input.id],
          )
        ).rows[0];
    const png = row ? await chartPng(row, input.accent) : undefined;
    if (!png) return reply.code(404).send({ error: "NOT_FOUND" });
    return reply.type("image/png").send(png);
  });
}
