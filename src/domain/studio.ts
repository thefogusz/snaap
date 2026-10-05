import { z } from "zod";
import {
  frames,
  timeframe,
  strategyConditions,
  type Strategy,
  type Condition,
  type Series,
} from "./engine.js";
import { preview } from "./preview.js";
import { availableTimeframes } from "../../dist/timeframes.js";

export const editorContextSchema = z
  .object({
    pair: z.string().min(1).max(81),
    chartTimeframe: timeframe,
    conditionPath: z.string().max(240).optional(),
    selectedBarTime: z.number().int().nonnegative().optional(),
  })
  .strict();

export function conditionAtPath(
  spec: Strategy,
  path: string,
): Condition | undefined {
  if (
    !/^(?:short\.)?(?:entry|exit|cancel|stages\.\d+\.condition)(?:\.(?:children\.\d+|condition))*$/.test(
      path,
    )
  )
    return;
  let node: any = spec;
  for (const key of path.split(".")) {
    if (!node || typeof node !== "object" || !Object.hasOwn(node, key)) return;
    node = node[key];
  }
  return ["COMPARE", "GROUP", "HOLD"].includes(node?.kind) ? node : undefined;
}

export function validEditorContext(
  spec: Strategy | undefined,
  context: z.infer<typeof editorContextSchema>,
) {
  return (
    !!spec &&
    spec.pairs.includes(context.pair) &&
    availableTimeframes(spec.exchange, spec.market).includes(context.chartTimeframe) &&
    (!context.conditionPath || !!conditionAtPath(spec, context.conditionPath))
  );
}

// Read evidence from the lifecycle-aware preview, including signal-relative exits.
export function inspectSetupBar(
  spec: Strategy,
  series: Series,
  selectedTime: number,
) {
  const data = preview(spec, series);
  const bar =
    data.timeline.filter((b) => b.time <= selectedTime).at(-1) ?? null;
  const used = new Set<keyof typeof frames>([spec.timeframe]);
  function walk(c: Condition) {
    if (c.kind === "GROUP") c.children.forEach(walk);
    else if (c.kind === "HOLD") walk(c.condition);
    else
      for (const o of [c.left, c.right])
        if (o.kind === "PRICE" || o.kind === "INDICATOR") used.add(o.timeframe);
  }
  strategyConditions(spec).forEach(walk);
  return {
    selectedTime,
    evaluationTimeframe: spec.timeframe,
    bar,
    references: [...used].map((timeframe) => {
      const candles = series[timeframe] ?? [];
      const reference = bar
        ? candles.filter((c) => c.time <= bar.time).at(-1)
        : undefined;
      return {
        timeframe,
        closedAt: reference?.time ?? null,
        stale:
          !reference ||
          (!!bar && bar.time - reference.time >= frames[timeframe]),
      };
    }),
    coverage: [...used].map((timeframe) => ({
      timeframe,
      bars: series[timeframe]?.length ?? 0,
      firstClosedAt: series[timeframe]?.[0]?.time ?? null,
      lastClosedAt: series[timeframe]?.at(-1)?.time ?? null,
    })),
    limitation:
      "Closed-candle signal evidence only; insufficient history may yield UNKNOWN. Not returns, executed orders or live monitoring.",
  };
}
