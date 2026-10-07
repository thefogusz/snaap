import {
  type Strategy,
  type Series,
  type Operand,
  type Condition,
  value,
  evaluate,
  evaluateEntry,
  advance,
  emptyLifecycle,
  replay,
  strategyOperands,
  strategyBranches,
  signalSide,
  frames,
} from "./engine.js";
import { explain, explainEntry, progress, seriesFreshness, usedFrames } from "./insights.js";

// Rendering and alerts deliberately use the same evaluator, including closed-HTF rules.
export function preview(spec: Strategy, series: Series, extra: Operand[] = [], chartTimeframe?: Strategy["timeframe"], chartOnlyOrNow: boolean | number = false, now = Date.now()) {
  const chartOnly = typeof chartOnlyOrNow === "boolean" ? chartOnlyOrNow : false;
  if (typeof chartOnlyOrNow === "number") now = chartOnlyOrNow;
  const frame = chartTimeframe ?? spec.timeframe;
  const candles = series[frame] ?? [];
  const operands = new Map<string, Operand>();
  const evaluationFrames = new Set<string>([spec.timeframe]);
  extra.forEach((o) => {
    if (o.kind === "INDICATOR") operands.set(JSON.stringify(o), o);
  });
  if (!chartOnly) {
    for (const o of strategyOperands(spec)) {
      if (o.kind === "INDICATOR" || o.kind === "PRICE") evaluationFrames.add(o.timeframe);
      if (o.kind === "INDICATOR") operands.set(JSON.stringify(o), o);
    }
  }
  const chartOperands = [...operands.values()].filter(o => !chartTimeframe || (o.kind === "INDICATOR" && o.timeframe === frame));
  const studies: {operand: Operand; chartOperand?: Operand}[] = chartOperands.map(operand => ({operand}));
  // Complete the familiar MACD chart without adding strategy operands or conditions.
  for (const operand of chartOperands) {
    if (operand.kind !== 'INDICATOR' || operand.name !== 'MACD') continue;
    for (const name of ['MACD_HIST', 'MACD_SIGNAL'] as const) {
      const companion = {...operand,name};
      const exists = chartOperands.some(o => o.kind === 'INDICATOR' && o.name === name &&
        o.timeframe === operand.timeframe && o.period === operand.period &&
        (o.slow ?? 26) === (operand.slow ?? 26) && (o.signal ?? 9) === (operand.signal ?? 9) &&
        (o.source ?? 'close') === (operand.source ?? 'close'));
      if (!exists) studies.push({operand:companion,chartOperand:operand});
    }
  }
  const overlays = studies.map(({operand:o,chartOperand}) => ({
    operand: o,
    ...(chartOperand ? {chartOperand} : {}),
    points: candles.map((c) => ({
      time: c.time,
      value: value(o, series, c.time, undefined, frame) ?? null,
    })),
  }));
  if (chartOnly) return { candles, overlays, timeline: [], chartTimeline: [], events: [], chartEvents: [], freshness: [], chartTimeframe: frame, evaluationTimeframe: spec.timeframe };
  let state = emptyLifecycle();
  const branchSpecs = strategyBranches(spec);
  const timeline = (series[spec.timeframe] ?? []).map((bar) => {
    const branches = branchSpecs.map((branch) => {
      const prior =
        spec.side === "BOTH"
          ? ((branch.side === "SHORT"
              ? state.sides?.short
              : state.sides?.long) ?? emptyLifecycle())
          : state;
      const check = (c: Condition) =>
        evaluate(
          c,
          series,
          bar.time,
          spec.timeframe,
          prior.entryPrice,
          signalSide(branch),
        );
      return {
        side: signalSide(branch),
        entry: evaluateEntry(branch, series, bar.time),
        stages: branch.stages.map((s) => check(s.condition)),
        exit: branch.exit ? check(branch.exit) : null,
        cancel: branch.cancel ? check(branch.cancel) : null,
        explanations: {
          entry: explainEntry(branch, evaluateEntry(branch, series, bar.time)),
          stages: branch.stages.map((s) =>
            explain(s.condition, check(s.condition)),
          ),
          exit: branch.exit ? explain(branch.exit, check(branch.exit)) : [],
          cancel: branch.cancel
            ? explain(branch.cancel, check(branch.cancel))
            : [],
        },
      };
    });
    const { entry, stages, exit, cancel } = branches[0];
    state = advance(spec, series, bar, state).state;
    return {
      time: bar.time,
      references: Object.entries(series).filter(([timeframe]) => evaluationFrames.has(timeframe)).map(([timeframe, candles]) => {
        const reference = candles?.findLast(c => c.time <= bar.time);
        return { timeframe, closedAt: reference?.time ?? null, stale: !reference || bar.time - reference.time >= frames[timeframe as keyof typeof frames] };
      }),
      entry,
      stages,
      exit,
      cancel,
      waitingStage: state.stage,
      activeSignal: state.active,
      branches: branches.map((branch, index) => {
        const next =
          spec.side === "BOTH"
            ? branch.side === "SHORT"
              ? state.sides!.short
              : state.sides!.long
            : state;
        const branchSpec = branchSpecs[index];
        const pending =
          next.active && branchSpec.exit
            ? branchSpec.exit
            : next.stage >= 0
              ? (branchSpec.stages[next.stage]?.condition ?? branchSpec.entry)
              : branchSpec.entry;
        const pendingEntry = pending === branchSpec.entry;
        const lines = pendingEntry ? explainEntry(branchSpec, evaluateEntry(branchSpec, series, bar.time)) : explain(
          pending,
          evaluate(
            pending,
            series,
            bar.time,
            spec.timeframe,
            next.entryPrice,
            branch.side,
          ),
        );
        return {
          ...branch,
          waitingStage: next.stage,
          activeSignal: next.active,
          progress: progress(
            next,
            spec.timeframe,
            bar.time,
            branchSpec.stages.length,
            pending,
          ),
          timeframes: usedFrames(branchSpec).map((frame) => ({
            frame,
            latestClose:
              series[frame]?.filter((c) => c.time <= bar.time).at(-1)?.time ??
              null,
            conditions: lines.filter(
              (e) =>
                e.frames.includes(frame) ||
                (!e.frames.length && frame === spec.timeframe),
            ),
          })),
        };
      }),
    };
  });
  // Viewing another timeframe must never change the strategy's evaluation clock.
  let index = -1;
  const chartTimeline = candles.map((c) => {
    while (index + 1 < timeline.length && timeline[index + 1].time <= c.time)
      index++;
    const bar = timeline[index];
    return bar && c.time - bar.time < frames[spec.timeframe] ? bar : null;
  });
  const events = replay(spec, series);
  const chartEvents = events.flatMap((e) => {
    const bar = candles.find((c) => c.time >= e.time);
    return bar && bar.time - e.time < frames[frame]
      ? [{ ...e, time: bar.time, signalTime: e.time }]
      : [];
  });
  return {
    candles: candles,
    overlays,
    timeline,
    chartTimeline,
    events,
    chartEvents,
    chartTimeframe: frame, evaluationTimeframe: spec.timeframe,
    freshness: seriesFreshness(spec, series, now),
  };
}
