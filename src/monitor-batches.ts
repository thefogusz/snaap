import { frames, type Strategy } from "./domain/engine.js";

export type MonitorTarget = {
  ruleId: string;
  revision: number;
  exchange: Strategy["exchange"][number];
  pair: string;
};
export type MonitorBatch = { targets: MonitorTarget[]; queuedAt: number };

/** Group public market work; tenant lifecycle state is never shared. */
export function monitorBatches(
  rows: { id: string; revision: number; spec: Strategy }[],
  checkpoints: Map<string, number>,
  now = Date.now(),
) {
  const groups = new Map<string, MonitorTarget[]>();
  let total = 0;
  for (const row of rows) {
    const spec = row.spec;
    const close =
      Math.floor(now / frames[spec.timeframe]) * frames[spec.timeframe];
    for (const exchange of spec.exchange)
      for (const pair of spec.pairs) {
        total++;
        const key = [row.id, row.revision, exchange, pair].join(":");
        if ((checkpoints.get(key) ?? -1) >= close) continue;
        const marketKey = [exchange, spec.market, pair, spec.timeframe].join(
          ":",
        );
        const targets = groups.get(marketKey) ?? [];
        targets.push({
          ruleId: row.id,
          revision: row.revision,
          exchange,
          pair,
        });
        groups.set(marketKey, targets);
      }
  }
  return { groups, total };
}

// Bounded payloads and short batches prevent one popular pair monopolising a worker.
export function splitMonitorTargets(targets: MonitorTarget[], size = 32) {
  const chunks: MonitorTarget[][] = [];
  for (let offset = 0; offset < targets.length; offset += size)
    chunks.push(targets.slice(offset, offset + size));
  return chunks;
}
