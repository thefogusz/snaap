import { lastClosedBoundary } from "../../dist/timeframes.js";
import {
  frames,
  strategyOperands,
  type Candle,
  type Condition,
  type Evidence,
  type Lifecycle,
  type Operand,
  type Series,
  type Strategy,
} from "./engine.js";
import { entryUnits } from "../../dist/entry-flexibility.js";
import { indicatorByName } from "../../dist/indicator-catalog.js";

export function isValidCandle(c: Candle, frame: keyof typeof frames) {
  return (
    Object.values(c).every(Number.isFinite) &&
    lastClosedBoundary(c.time, frame) === c.time &&
    Math.min(c.open, c.high, c.low, c.close) > 0 &&
    c.volume >= 0 &&
    c.low <= Math.min(c.open, c.close) &&
    c.high >= Math.max(c.open, c.close)
  );
}

/**
 * Bars each timeframe's indicators read, per operand. Fetching adds a 500-bar floor on top;
 * gap checks use these windows directly because indicators never bridge older gaps.
 */
export function indicatorWarmup(operands: Operand[]) {
  const warmup = new Map<keyof typeof frames, number>();
  for (const o of operands) {
    if (o.kind !== "INDICATOR") continue;
    const definition = indicatorByName[o.name];
    const extendedWarmup = definition
      ? 4 *
          Math.max(
            o.period,
            ...definition.params
              .filter((p) => p.integer)
              .map((p) =>
                p.key === "period" ? o.period : (o.params?.[p.key] ?? p.value),
              ),
          ) +
        32
      : 0;
    warmup.set(
      o.timeframe,
      Math.max(
        warmup.get(o.timeframe) ?? 0,
        extendedWarmup,
        o.period + 32,
        ...(o.formula?.terms.map((t) => t.period + 32) ?? [0]),
        (o.slow ?? 0) + (o.signal ?? 9) + 32,
      ),
    );
  }
  return warmup;
}

/** `window` limits the gap check to the most recent closed bars; omitted, the whole series counts. */
export function freshness(
  frame: keyof typeof frames,
  candles: Candle[],
  now: number,
  window?: number,
) {
  const step = frames[frame],
    expectedClose = lastClosedBoundary(now, frame);
  const closed = candles.filter((c) => c.time <= expectedClose);
  const latestClose = closed.at(-1)?.time ?? null;
  const recent = window === undefined ? closed : closed.slice(-window);
  const gap = recent.some(
    (c, i) => i > 0 && c.time - recent[i - 1].time !== step,
  );
  const invalid = closed.some((c) => !isValidCandle(c, frame));
  const status =
    !closed.length || gap || invalid
      ? "INSUFFICIENT"
      : latestClose! < expectedClose
        ? "DELAYED"
        : "CURRENT";
  return { frame, status, latestClose, expectedClose, checkedAt: now, gap };
}
export function usedFrames(spec: Strategy) {
  const result = new Set<keyof typeof frames>([spec.timeframe]);
  for (const operand of strategyOperands(spec))
    if ("timeframe" in operand) result.add(operand.timeframe);
  return [...result];
}
export function seriesFreshness(
  spec: Strategy,
  series: Series,
  now = Date.now(),
) {
  // A gap older than the bars the setup reads cannot change a result, so it must not stall
  // the rule and force refetches until it scrolls out of the fetched history.
  const warmup = indicatorWarmup(strategyOperands(spec));
  return usedFrames(spec).map((frame) =>
    freshness(frame, series[frame] ?? [], now, Math.max(3, (warmup.get(frame) ?? 0) + 1)),
  );
}
const label = (o: Operand): string =>
  o.kind === "CONSTANT"
    ? String(o.value)
    : o.kind === "PRICE"
      ? `${{ open: "ราคาเปิด", high: "ราคาสูงสุด", low: "ราคาต่ำสุด", close: "ราคาปิด", volume: "วอลุ่ม" }[o.field]} (${o.timeframe})`
      : o.kind === "INDICATOR"
        ? `${o.name} ${o.period} (${o.timeframe})`
        : "การเปลี่ยนแปลงจากราคาเข้า (%)";
const number = (v: number | undefined) =>
  v === undefined
    ? "ไม่มีข้อมูล"
    : Number(v.toFixed(6)).toLocaleString("th-TH");
export type Explanation = {
  result: Evidence["result"];
  text: string;
  frames: string[];
};
export function explain(c: Condition, e: Evidence): Explanation[] {
  if (c.kind === "GROUP") {
    const children = c.children.flatMap((child, i) =>
      explain(child, e.children?.[i] ?? { result: "UNKNOWN" }),
    );
    return [
      {
        result: e.result,
        text:
          c.op === "AND" ? "ต้องผ่านทุกเงื่อนไข" : "ผ่านอย่างน้อยหนึ่งเงื่อนไข",
        frames: [...new Set(children.flatMap((child) => child.frames))],
      },
      ...children,
    ];
  }
  if (c.kind === "HOLD") {
    const current = explain(
      c.condition,
      e.children?.[0] ?? { result: "UNKNOWN" },
    );
    return [
      {
        result: e.result,
        text: `ต้องผ่านต่อเนื่อง ${c.bars} แท่ง · ผ่าน ${e.children?.filter((child) => child.result === "TRUE").length ?? 0}/${c.bars} แท่ง`,
        frames: [...new Set(current.flatMap((child) => child.frames))],
      },
      ...current,
    ];
  }
  const op = {
    ">": "มากกว่า",
    ">=": "มากกว่าหรือเท่ากับ",
    "<": "น้อยกว่า",
    "<=": "น้อยกว่าหรือเท่ากับ",
    CROSS_ABOVE: "ตัดขึ้นเหนือ",
    CROSS_BELOW: "ตัดลงใต้",
  }[c.op];
  return [
    {
      result: e.result,
      text: `${label(c.left)} = ${number(e.left)} · ต้อง${op} ${c.right.kind === "CONSTANT" ? number(e.right) : `${label(c.right)} = ${number(e.right)}`}${e.result === "FALSE" ? " · ยังไม่ผ่าน" : e.result === "UNKNOWN" ? " · ข้อมูลไม่พอ" : ""}${e.reason ? ` (${e.reason})` : ""}`,
      frames: [
        ...new Set(
          [c.left, c.right].flatMap((o) =>
            "timeframe" in o ? [o.timeframe] : [],
          ),
        ),
      ],
    },
  ];
}
export function explainEntry(spec: Strategy, evidence: Evidence): Explanation[] {
  if ((spec.entryMatchPercent ?? 100) === 100) return explain(spec.entry, evidence);
  const children = entryUnits(spec.entry).flatMap((condition: Condition, index: number) =>
    explain(condition, evidence.children?.[index] ?? { result: "UNKNOWN" }),
  );
  return [{
    result: evidence.result,
    text: evidence.reason ?? "รอเงื่อนไขเข้าตามความยืดหยุ่นที่กำหนด",
    frames: [...new Set(children.flatMap((child: Explanation) => child.frames))],
  }, ...children];
}
export function progress(
  state: Lifecycle,
  frame: keyof typeof frames,
  time: number,
  totalStages: number,
  condition?: Condition,
) {
  let label: string | undefined;
  if (condition?.kind === "HOLD")
    label = `รอปิดยืนยันต่อเนื่อง ${condition.bars} แท่ง`;
  if (condition?.kind === "GROUP" && condition.op === "AND") {
    const touch = condition.children.find(
      (c) =>
        c.kind === "COMPARE" &&
        c.left.kind === "PRICE" &&
        ["low", "high"].includes(c.left.field) &&
        c.right.kind === "CONSTANT",
    );
    const close = condition.children.find(
      (c) =>
        c.kind === "COMPARE" &&
        c.left.kind === "PRICE" &&
        c.left.field === "close" &&
        c.right.kind === "CONSTANT",
    );
    if (
      touch?.kind === "COMPARE" &&
      close?.kind === "COMPARE" &&
      touch.right.kind === "CONSTANT" &&
      close.right.kind === "CONSTANT" &&
      touch.right.value === close.right.value &&
      ((touch.op === "<=" && close.op === ">") ||
        (touch.op === ">=" && close.op === "<"))
    )
      label = `รอกลับทดสอบระดับ ${number(touch.right.value)}`;
  }
  if (
    condition?.kind === "COMPARE" &&
    condition.left.kind === "PRICE" &&
    condition.right.kind === "CONSTANT" &&
    condition.op.startsWith("CROSS")
  )
    label = `รอทะลุระดับ ${number(condition.right.value)}`;
  return {
    label,
    phase: state.active
      ? "ACTIVE"
      : state.stage >= 0
        ? "WAITING_STAGE"
        : state.cooldownUntil >= time
          ? "COOLDOWN"
          : state.latched
            ? "WAITING_RESET"
            : "WAITING_ENTRY",
    stage: state.stage,
    totalStages,
    deadline: state.stage >= 0 ? state.deadline : null,
    remainingBars:
      state.stage >= 0
        ? Math.max(0, Math.floor((state.deadline - time) / frames[frame]))
        : null,
  };
}
