import {
  type Strategy,
  type Series,
  type Operand,
  type Condition,
  value,
  evaluate,
  advance,
  emptyLifecycle,
  replay,
  strategyConditions,
  strategyBranches,
  signalSide,
  frames,
} from "./engine.js";

// Rendering and alerts deliberately use the same evaluator, including closed-HTF rules.
export function preview(spec: Strategy, series: Series, extra: Operand[] = [], chartTimeframe?: Strategy["timeframe"], chartOnly = false) {
  const frame = chartTimeframe ?? spec.timeframe;
  const candles = series[frame] ?? [];
  const operands = new Map<string, Operand>();
  const evaluationFrames = new Set<string>([spec.timeframe]);
  extra.forEach((o) => {
    if (o.kind === "INDICATOR") operands.set(JSON.stringify(o), o);
  });
  const walk = (c: Condition) => {
    if (c.kind === "GROUP") c.children.forEach(walk);
    else if (c.kind === "HOLD") walk(c.condition);
    else
      for (const o of [c.left, c.right]) {
        if (o.kind === "INDICATOR" || o.kind === "PRICE") evaluationFrames.add(o.timeframe);
        if (o.kind === "INDICATOR") operands.set(JSON.stringify(o), o);
      }
  };
  if (!chartOnly) strategyConditions(spec).forEach(walk);
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
  if (chartOnly) return { candles, overlays, timeline: [], events: [], chartTimeframe: frame, evaluationTimeframe: spec.timeframe };
  let state = emptyLifecycle();
  const timeline = (series[spec.timeframe] ?? []).map((bar) => {
    const branches = strategyBranches(spec).map((branch) => {
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
        entry: check(branch.entry),
        stages: branch.stages.map((s) => check(s.condition)),
        exit: branch.exit ? check(branch.exit) : null,
        cancel: branch.cancel ? check(branch.cancel) : null,
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
      branches: branches.map((branch) => {
        const next =
          spec.side === "BOTH"
            ? branch.side === "SHORT"
              ? state.sides!.short
              : state.sides!.long
            : state;
        return {
          ...branch,
          waitingStage: next.stage,
          activeSignal: next.active,
        };
      }),
    };
  });
  return { candles, overlays, timeline, events: replay(spec, series), chartTimeframe: frame, evaluationTimeframe: spec.timeframe };
}
