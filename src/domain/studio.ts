import { z } from "zod";
import {
  frames,
  timeframe,
  type Strategy,
  type Condition,
  type Series,
} from "./engine.js";
import { preview } from "./preview.js";
import { usedFrames } from "./insights.js";
import { availableTimeframes } from "../../dist/timeframes.js";
import { strategyTargets } from '../../dist/asset-catalog.js';

export const editorContextSchema = z
  .object({
    pair: z.string().min(1).max(81),
    exchange: z.enum(['Binance', 'Bybit', 'OKX', 'Bitget', 'MEXC', 'Gate']).optional(),
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
    (!context.exchange || strategyTargets(spec).some(t => t.exchange === context.exchange && t.pair === context.pair)) &&
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
    data.timeline.findLast((b) => b.time <= selectedTime) ?? null;
  const used = usedFrames(spec);
  return {
    selectedTime,
    evaluationTimeframe: spec.timeframe,
    evaluationClosedAtIso: bar ? new Date(bar.time).toISOString() : null,
    bar,
    references: used.map((timeframe) => {
      const candles = series[timeframe] ?? [];
      const reference = bar
        ? candles.findLast((c) => c.time <= bar.time)
        : undefined;
      return {
        timeframe,
        closedAt: reference?.time ?? null,
        closedAtIso: reference ? new Date(reference.time).toISOString() : null,
        stale:
          !reference ||
          (!!bar && bar.time - reference.time >= frames[timeframe]),
      };
    }),
    coverage: used.map((timeframe) => ({
      timeframe,
      bars: series[timeframe]?.length ?? 0,
      firstClosedAt: series[timeframe]?.[0]?.time ?? null,
      lastClosedAt: series[timeframe]?.at(-1)?.time ?? null,
      firstClosedAtIso: series[timeframe]?.[0] ? new Date(series[timeframe]![0].time).toISOString() : null,
      lastClosedAtIso: series[timeframe]?.length ? new Date(series[timeframe]!.at(-1)!.time).toISOString() : null,
    })),
    limitation:
      "Closed-candle signal evidence only; insufficient history may yield UNKNOWN. Not returns, executed orders or live monitoring.",
  };
}
