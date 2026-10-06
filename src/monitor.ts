import { monitorQuotaBlocked } from './usage-policy.js';
import { lastClosedBoundary } from "../dist/timeframes.js";
import { PgBoss } from "pg-boss";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { transaction } from "./data/db.js";
import {
  advance,
  emptyLifecycle,
  frames,
  strategySchema,
  type Series,
  type Strategy,
  type Lifecycle,
  strategyBranches,
  signalSide,
  evaluate,
  evaluateEntry,
} from "./domain/engine.js";
import { seriesFreshness, progress, explain, explainEntry } from "./domain/insights.js";
import { strategySeries, invalidateCandles } from "./markets.js";
import { deliver } from "./destinations.js";
import { captureChart } from "./signal-chart.js";
import { RealtimeMarkets } from "./realtime.js";
import {
  monitorBatches,
  splitMonitorTargets,
  type MonitorBatch,
} from "./monitor-batches.js";

type Target = {
  ruleId: string;
  revision: number;
  exchange: Strategy["exchange"][number];
  pair: string;
};
/** Fetch outside the transaction; lock and recheck activation/revision before committing. */
export async function evaluateTarget(
  db: pg.Pool,
  target: Target,
  fetchSeries = strategySeries,
  now?: number,
) {
  const row = (
    await db.query(
      "SELECT * FROM rules WHERE id=$1 AND revision=$2 AND active",
      [target.ruleId, target.revision],
    )
  ).rows[0];
  if (!row) return;
  const spec = strategySchema.parse(row.spec);
  // The durable checkpoint also catches duplicate stream/recovery jobs after restart.
  const previous = (
    await db.query(
      "SELECT state FROM monitor_checkpoints WHERE rule_id=$1 AND revision=$2 AND exchange=$3 AND pair=$4",
      [row.id, target.revision, target.exchange, target.pair],
    )
  ).rows[0];
  const expectedClose =
    lastClosedBoundary(Date.now(), spec.timeframe);
  if (previous && Number(previous.state.lastTime) >= expectedClose) return;
  if (spec.market === "Perpetual Futures" && !spec.side) {
    await db.query(
      "INSERT INTO monitor_status VALUES($1,$2,$3,'DIRECTION_REQUIRED',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
      [row.id, target.exchange, target.pair],
    );
    return;
  }
  if (
    !spec.exchange.includes(target.exchange) ||
    !spec.pairs.includes(target.pair)
  )
    return;
  const blocked = await monitorQuotaBlocked(db, row.owner_id);
  if (blocked) {
    await db.query(
      "INSERT INTO monitor_status VALUES($1,$2,$3,'QUOTA_BLOCKED',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
      [row.id, target.exchange, target.pair],
    );
    return;
  }
  let series: Series;
  await db.query(
    "INSERT INTO monitor_status VALUES($1,$2,$3,'RECOVERING',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
    [row.id, target.exchange, target.pair],
  );
  try {
    series = await fetchSeries(spec, target.exchange, target.pair);
  } catch {
    await db.query(
      "INSERT INTO monitor_insights(rule_id,revision,exchange,pair,freshness) VALUES($1,$2,$3,$4,$5) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET revision=excluded.revision,freshness=excluded.freshness,progress=NULL WHERE monitor_insights.revision<=excluded.revision",
      [
        row.id,
        target.revision,
        target.exchange,
        target.pair,
        JSON.stringify(seriesFreshness(spec, {}, now ?? Date.now())),
      ],
    );
    await db.query(
      "INSERT INTO monitor_status VALUES($1,$2,$3,'DATA_UNAVAILABLE',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
      [row.id, target.exchange, target.pair],
    );
    return;
  }
  const checkedAt = now ?? Date.now();
  const freshness = seriesFreshness(spec, series, checkedAt);
  await db.query(
    "INSERT INTO monitor_insights(rule_id,revision,exchange,pair,freshness) VALUES($1,$2,$3,$4,$5) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET revision=excluded.revision,freshness=excluded.freshness,progress=NULL WHERE monitor_insights.revision<=excluded.revision",
    [
      row.id,
      target.revision,
      target.exchange,
      target.pair,
      JSON.stringify(freshness),
    ],
  );
  const latest = series[spec.timeframe]
    ?.filter((b) => b.time <= checkedAt)
    .at(-1)?.time;
  if (freshness.some((f) => f.status !== "CURRENT")) {
    for (const f of freshness)
      if (f.status !== "CURRENT")
        invalidateCandles(target.exchange, spec.market, target.pair, f.frame);
    await db.query(
      "INSERT INTO monitor_status VALUES($1,$2,$3,$4,now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
      [
        row.id,
        target.exchange,
        target.pair,
        freshness.some((f) => f.status === "INSUFFICIENT")
          ? "INSUFFICIENT"
          : "DELAYED",
      ],
    );
    return;
  }
  const deliveryIds: string[] = [];
  await transaction(db, async (c) => {
    const current = (
      await c.query(
        "SELECT * FROM rules WHERE id=$1 AND revision=$2 AND active FOR UPDATE",
        [row.id, target.revision],
      )
    ).rows[0];
    if (!current) return;
    if (await monitorQuotaBlocked(c, current.owner_id)) {
      await c.query(
        "INSERT INTO monitor_status VALUES($1,$2,$3,'QUOTA_BLOCKED',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
        [row.id, target.exchange, target.pair],
      );
      return;
    }
    const stored = (
      await c.query(
        "SELECT state FROM monitor_checkpoints WHERE rule_id=$1 AND revision=$2 AND exchange=$3 AND pair=$4",
        [row.id, target.revision, target.exchange, target.pair],
      )
    ).rows[0];
    let state: Lifecycle = stored?.state ?? emptyLifecycle();
    if (stored && latest && state.lastTime >= latest) return;
    const after = new Date(current.activated_at).getTime();
    if (!stored)
      state.lastTime =
        lastClosedBoundary(after, spec.timeframe);
    for (const bar of series[spec.timeframe] ?? []) {
      if (bar.time > checkedAt) continue;
      if (bar.time <= after || bar.time <= state.lastTime) continue;
      const result = advance(spec, series, bar, state);
      state = result.state;
      for (const event of result.events) {
        const id = randomUUID(),
          dedup = [
            row.id,
            target.revision,
            target.exchange,
            target.pair,
            event.time,
            event.kind,
            event.side,
          ].join(":");
        const inserted = await c.query(
          "INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup,chart_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(dedup) DO NOTHING RETURNING id",
          [
            id,
            row.owner_id,
            row.id,
            target.revision,
            target.exchange,
            target.pair,
            { ...event, recovered: event.time !== latest },
            dedup,
            captureChart(
              series[spec.timeframe] ?? [],
              event.time,
              spec.timeframe,
            ),
          ],
        );
        if (inserted.rowCount && event.kind !== 'EXPIRED' && event.time === latest && spec.destinations.length)
          deliveryIds.push(
            ...(
              await c.query(
                "INSERT INTO deliveries(id,signal_id,destination_id,status) SELECT gen_random_uuid(),$1,id,'PENDING' FROM destinations WHERE id=ANY($2::uuid[]) AND owner_id=$3 AND verified ON CONFLICT DO NOTHING RETURNING id",
                [id, spec.destinations, row.owner_id],
              )
            ).rows.map((r) => r.id),
          );
      }
    }
    await c.query(
      "INSERT INTO monitor_checkpoints VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(rule_id,revision,exchange,pair) DO UPDATE SET state=excluded.state,checked_at=now()",
      [row.id, target.revision, target.exchange, target.pair, state],
    );
    await c.query(
      "INSERT INTO monitor_status VALUES($1,$2,$3,'READY',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
      [row.id, target.exchange, target.pair],
    );
    const branchProgress = strategyBranches(spec).map((branch) => {
      const currentState =
        spec.side === "BOTH"
          ? ((branch.side === "SHORT"
              ? state.sides?.short
              : state.sides?.long) ?? emptyLifecycle())
          : state;
      const condition =
        currentState.active && branch.exit
          ? branch.exit
          : currentState.stage >= 0
            ? (branch.stages[currentState.stage]?.condition ?? branch.entry)
            : branch.entry;
      const pendingEntry = condition === branch.entry;
      const evidence = pendingEntry ? evaluateEntry(branch, series, latest!) : evaluate(
        condition,
        series,
        latest!,
        spec.timeframe,
        currentState.entryPrice,
        signalSide(branch),
      );
      return {
        side: signalSide(branch),
        ...progress(
          currentState,
          spec.timeframe,
          latest!,
          branch.stages.length,
          condition,
        ),
        explanations: pendingEntry ? explainEntry(branch, evidence) : explain(condition, evidence),
        result: evidence.result,
      };
    });
    await c.query(
      "UPDATE monitor_insights SET progress=$4 WHERE rule_id=$1 AND exchange=$2 AND pair=$3 AND revision=$5",
      [
        row.id,
        target.exchange,
        target.pair,
        JSON.stringify(branchProgress),
        target.revision,
      ],
    );
    if (branchProgress.some((p) => p.result === "UNKNOWN"))
      await c.query(
        "UPDATE monitor_status SET status='INSUFFICIENT' WHERE rule_id=$1 AND exchange=$2 AND pair=$3",
        [row.id, target.exchange, target.pair],
      );
  });
  return deliveryIds;
}
export async function startMonitor(
  db: pg.Pool,
  url: string,
  queueSchema = "pgboss",
) {
  const boss = new PgBoss({
    connectionString: url,
    schema: queueSchema,
    useListenNotify: true,
  });
  const measurements = {
    batches: 0,
    targets: 0,
    maxWaitMs: 0,
    maxDurationMs: 0,
  };
  boss.on("error", () => console.error("Queue operation failed"));
  await boss.start();
  await db.query("INSERT INTO service_heartbeats(service,checked_at) VALUES('monitor',now()) ON CONFLICT(service) DO UPDATE SET checked_at=now()");
  await boss.createQueue("scan");
  await boss.createQueue("evaluate", {
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
  });
  await boss.createQueue("deliver", { retryLimit: 3, retryDelay: 30 });
  await boss.createQueue("evaluate-market", {
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
  });
  await boss.updateQueue("evaluate-market", {
    deleteAfterSeconds: 3600,
    retentionSeconds: 86400,
  });
  await boss.updateQueue("evaluate-market", { notify: true });
  // Remove jobs left by the retired post-signal price tracker.
  if (await boss.getQueue("outcome")) await boss.deleteQueue("outcome");
  await boss.updateQueue("evaluate", { notify: true });
  await boss.updateQueue("deliver", { notify: true });
  const insertJobs = async (
    name: string,
    jobs: Parameters<PgBoss["insert"]>[1],
  ) => {
    for (let offset = 0; offset < jobs.length; offset += 250)
      await boss.insert(name, jobs.slice(offset, offset + 250));
  };
  const enqueueDeliveries = (ids: string[]) =>
    insertJobs(
      "deliver",
      ids.map((id) => ({
        data: { id },
        singletonKey: id,
        singletonSeconds: 55,
      })),
    );
  const realtime = new RealtimeMarkets(async (targets, closedAt) => {
    await insertJobs(
      "evaluate-market",
      splitMonitorTargets(targets).map((chunk) => ({
        data: { targets: chunk, queuedAt: Date.now() },
        singletonKey: [
          closedAt,
          ...chunk.map((t) =>
            [t.ruleId, t.revision, t.exchange, t.pair].join(":"),
          ),
        ].join("|"),
        singletonSeconds: 1,
        expireInSeconds: 900,
      })),
    );
  });
  await boss.work("scan", async () => {
    const scanStarted = Date.now();
    const rows = (
      await db.query(
        "SELECT r.id,r.revision,r.spec FROM rules r WHERE r.active",
      )
    ).rows;
    realtime.reconcile(rows);
    const checkpoints = new Map<string, number>(
      (
        await db.query(
          "SELECT c.rule_id,c.revision,c.exchange,c.pair,c.state->>'lastTime' AS last_time FROM monitor_checkpoints c JOIN rules r ON r.id=c.rule_id AND r.revision=c.revision WHERE r.active",
        )
      ).rows.map((c) => [
        [c.rule_id, c.revision, c.exchange, c.pair].join(":"),
        Number(c.last_time),
      ]),
    );
    const { groups, total } = monitorBatches(
      rows.map((row) => ({ ...row, spec: strategySchema.parse(row.spec) })),
      checkpoints,
    );
    let dueTargets = 0,
      queuedBatches = 0;
    const plannedJobs: Parameters<PgBoss["insert"]>[1] = [];
    for (const [key, targets] of groups) {
      dueTargets += targets.length;
      for (const [index, chunk] of splitMonitorTargets(targets).entries()) {
        plannedJobs.push({
          data: { targets: chunk, queuedAt: Date.now() },
          singletonKey: `${key}:${index}`,
          singletonSeconds: 55,
          expireInSeconds: 900,
        });
        queuedBatches++;
      }
    }
    await insertJobs("evaluate-market", plannedJobs);
    // Recover quota reservations left by a crashed process. A run has a 90-second deadline.
    await db.query(
      "UPDATE usage_ledger SET status='REFUNDED' WHERE status='RESERVED' AND created_at<now()-interval '5 minutes'",
    );
    await db.query(
      "UPDATE agent_runs SET status='FAILED' WHERE status='RUNNING' AND created_at<now()-interval '5 minutes'",
    );
    const pendingDeliveries = (
      await db.query(
        "SELECT id FROM deliveries WHERE status IN ('PENDING','RETRY') OR (status='USAGE_LIMIT' AND (usage_retry_at IS NULL OR usage_retry_at<=now())) ORDER BY CASE WHEN status='USAGE_LIMIT' THEN 1 ELSE 0 END,usage_retry_at NULLS FIRST,attempts,id LIMIT 500",
      )
    ).rows;
    await enqueueDeliveries(pendingDeliveries.map((row) => row.id));
    await db.query("INSERT INTO service_heartbeats(service,checked_at) VALUES('monitor',now()) ON CONFLICT(service) DO UPDATE SET checked_at=now()");
    console.info(
      JSON.stringify({
        event: "monitor_scan",
        totalTargets: total,
        dueTargets,
        queuedBatches,
        durationMs: Date.now() - scanStarted,
        ...measurements,
      }),
    );
    measurements.batches =
      measurements.targets =
      measurements.maxWaitMs =
      measurements.maxDurationMs =
        0;
  });
  await boss.work<MonitorBatch>(
    "evaluate-market",
    {
      localConcurrency: 3,
      batchSize: 8,
      burstWhenBatchFull: true,
      pollingIntervalSeconds: 0.5,
      notifyPollingIntervalSeconds: 5,
    },
    async (jobs) => {
      for (const job of jobs) {
        const started = Date.now();
        for (const target of job.data.targets) {
          const ids = await evaluateTarget(db, target);
          await enqueueDeliveries(ids ?? []);
        }
        measurements.batches++;
        measurements.targets += job.data.targets.length;
        measurements.maxWaitMs = Math.max(
          measurements.maxWaitMs,
          started - job.data.queuedAt,
        );
        measurements.maxDurationMs = Math.max(
          measurements.maxDurationMs,
          Date.now() - started,
        );
      }
    },
  );
  await boss.work<Target>(
    "evaluate",
    {
      localConcurrency: 5,
      pollingIntervalSeconds: 0.5,
      notifyPollingIntervalSeconds: 5,
    },
    async (jobs) => {
      for (const job of jobs) {
        const deliveryIds = await evaluateTarget(db, job.data);
        await enqueueDeliveries(deliveryIds ?? []);
      }
    },
  );
  await boss.work<{ id: string }>(
    "deliver",
    {
      localConcurrency: 2,
      pollingIntervalSeconds: 0.5,
      notifyPollingIntervalSeconds: 5,
    },
    async (jobs) => {
      for (const job of jobs) await deliver(db, job.data.id);
    },
  );
  await boss.schedule("scan", "* * * * *");
  await boss.send("scan");
  const stop = boss.stop.bind(boss);
  boss.stop = async (...args: Parameters<typeof stop>) => {
    await realtime.stop();
    return stop(...args);
  };
  return boss;
}
