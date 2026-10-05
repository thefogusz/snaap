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
  strategyConditions,
  strategyBranches,
  signalSide,
  frames,
} from "./engine.js";
import { explain, explainEntry, progress, seriesFreshness, usedFrames } from "./insights.js";

// Rendering and alerts deliberately use the same evaluator, including closed-HTF rules.
export function preview(
  spec: Strategy,
  series: Series,
  extra: Operand[] = [],
  chartFrame?: keyof typeof frames,
  now = Date.now(),
) {
  const candles = series[spec.timeframe] ?? [];
  const chartCandles = chartFrame ? (series[chartFrame] ?? []) : candles;
  const operands = new Map<string, Operand>();
  extra.forEach((o) => {
    if (o.kind === "INDICATOR") operands.set(JSON.stringify(o), o);
  });
  const walk = (c: Condition) => {
    if (c.kind === "GROUP") c.children.forEach(walk);
    else if (c.kind === "HOLD") walk(c.condition);
    else
      for (const o of [c.left, c.right])
        if (o.kind === "INDICATOR") operands.set(JSON.stringify(o), o);
  };
  strategyConditions(spec).forEach(walk);
  const overlays = [...operands.values()]
    .filter(
      (o) => !chartFrame || ("timeframe" in o && o.timeframe === chartFrame),
    )
    .map((o) => ({
      operand: o,
      points: chartCandles.map((c) => ({
        time: c.time,
        value:
          value(o, series, c.time, undefined, chartFrame ?? spec.timeframe) ??
          null,
      })),
    }));
  let state = emptyLifecycle();
  const branchSpecs = strategyBranches(spec);
  const timeline = candles.map((bar) => {
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
  const chartTimeline = chartCandles.map((c) => {
    while (index + 1 < timeline.length && timeline[index + 1].time <= c.time)
      index++;
    const bar = timeline[index];
    return bar && c.time - bar.time < frames[spec.timeframe] ? bar : null;
  });
  const events = replay(spec, series);
  const chartEvents = events.flatMap((e) => {
    const bar = chartCandles.find((c) => c.time >= e.time);
    return bar && bar.time - e.time < frames[chartFrame ?? spec.timeframe]
      ? [{ ...e, time: bar.time, signalTime: e.time }]
      : [];
  });
  return {
    candles: chartCandles,
    overlays,
    timeline,
    chartTimeline,
    events,
    chartEvents,
    freshness: seriesFreshness(spec, series, now),
  };
}
