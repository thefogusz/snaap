import { z } from "zod";
import { isValidCandle } from "./insights.js";
import {
  frames,
  value,
  type Candle,
  type Series,
  type Signal,
} from "./engine.js";
export const riskPlanSchema = z
  .object({
    enabled: z.boolean().default(false),
    atrPeriod: z.number().int().min(2).max(100).default(14),
    stopAtr: z.number().min(0.1).max(20).default(1.5),
    rewardRisk: z.number().min(0.1).max(20).default(2),
  })
  .strict();
export type RiskPlan = z.infer<typeof riskPlanSchema>;
export type RiskSnapshot = {
  status: "READY" | "INSUFFICIENT";
  config: RiskPlan;
  time: number;
  referencePrice: number;
  atr?: number;
  stopLoss?: number;
  takeProfit?: number;
  reason?: string;
};
export function freezeRisk(
  config: RiskPlan | null | undefined,
  event: Signal,
  series: Series,
  frame: keyof typeof frames,
): RiskSnapshot | null {
  if (!config?.enabled || event.kind !== "ENTRY") return null;
  const atr = value(
    {
      kind: "INDICATOR",
      name: "ATR",
      period: config.atrPeriod,
      timeframe: frame,
    },
    series,
    event.time,
    undefined,
    frame,
  );
  const snapshot = {
    config: { ...config },
    time: event.time,
    referencePrice: event.referencePrice,
  };
  if (atr === undefined || atr <= 0)
    return { ...snapshot, status: "INSUFFICIENT", reason: "ATR ไม่พร้อม" };
  const direction = event.side === "SHORT" ? -1 : 1,
    distance = atr * config.stopAtr;
  const stopLoss = event.referencePrice - direction * distance,
    takeProfit =
      event.referencePrice + direction * distance * config.rewardRisk;
  if (
    stopLoss <= 0 ||
    takeProfit <= 0 ||
    !Number.isFinite(stopLoss + takeProfit)
  )
    return {
      ...snapshot,
      status: "INSUFFICIENT",
      reason: "ระดับราคาอยู่นอกช่วงที่ใช้ได้",
    };
  return { ...snapshot, status: "READY", atr, stopLoss, takeProfit };
}
export function measureOutcome(
  event: Signal,
  frame: keyof typeof frames,
  candles: Candle[],
  risk: RiskSnapshot | null,
  horizon = 20,
  now = Date.now(),
) {
  const step = frames[frame],
    end = event.time + horizon * step;
  const bars = [
    ...new Map(
      candles
        .filter(
          (c) =>
            c.time > event.time &&
            c.time <= end &&
            c.time <= now &&
            isValidCandle(c, frame),
        )
        .map((c) => [c.time, c]),
    ).values(),
  ].sort((a, b) => a.time - b.time);
  const expected = Math.max(
    0,
    Math.min(horizon, Math.floor((now - event.time) / step)),
  );
  const missing = Array.from(
    { length: expected },
    (_, i) => event.time + (i + 1) * step,
  ).some((t) => !bars.some((c) => c.time === t));
  let favorable = 0,
    adverse = 0,
    firstTouch: "NONE" | "SL" | "TP" | "AMBIGUOUS" | "UNKNOWN" = "NONE",
    touchTime: number | null = null;
  for (const c of bars) {
    const short = event.side === "SHORT";
    favorable = Math.max(
      favorable,
      short ? event.referencePrice - c.low : c.high - event.referencePrice,
    );
    adverse = Math.max(
      adverse,
      short ? c.high - event.referencePrice : event.referencePrice - c.low,
    );
    if (risk?.status === "READY" && firstTouch === "NONE") {
      const sl = short ? c.high >= risk.stopLoss! : c.low <= risk.stopLoss!,
        tp = short ? c.low <= risk.takeProfit! : c.high >= risk.takeProfit!;
      if (sl || tp) {
        firstTouch = sl && tp ? "AMBIGUOUS" : sl ? "SL" : "TP";
        touchTime = c.time;
      }
    }
  }
  // A gap before the observed touch makes the actual first touch unknowable.
  if (
    missing &&
    (!touchTime ||
      bars.filter((c) => c.time <= touchTime!).length <
        (touchTime - event.time) / step)
  )
    firstTouch = "UNKNOWN";
  return {
    status: missing
      ? "INCOMPLETE"
      : expected < horizon
        ? "PENDING"
        : "COMPLETE",
    horizon,
    observedBars: bars.length,
    expectedBars: expected,
    endsAt: end,
    checkedAt: now,
    favorablePct: (100 * favorable) / event.referencePrice,
    adversePct: (100 * adverse) / event.referencePrice,
    firstTouch,
    touchTime,
    riskAvailable: risk?.status === "READY",
  };
}
