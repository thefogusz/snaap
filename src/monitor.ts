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
} from "./domain/engine.js";
import { strategySeries } from "./markets.js";
import { deliver } from "./destinations.js";
import { captureChart } from "./signal-chart.js";
import { RealtimeMarkets } from "./realtime.js";

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
) {
  const row = (
    await db.query(
      "SELECT * FROM rules WHERE id=$1 AND revision=$2 AND active",
      [target.ruleId, target.revision],
    )
  ).rows[0];
  if (!row) return;
  const spec = strategySchema.parse(row.spec);
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
  const blocked = (
    await db.query(
      "SELECT (SELECT count(*) FROM rules WHERE owner_id=$1 AND active)>CASE WHEN EXISTS(SELECT 1 FROM entitlements WHERE owner_id=$1 AND pro_until>now()) THEN 20 ELSE 3 END AS blocked",
      [row.owner_id],
    )
  ).rows[0].blocked;
  if (blocked) {
    await db.query(
      "INSERT INTO monitor_status VALUES($1,$2,$3,'QUOTA_BLOCKED',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
      [row.id, target.exchange, target.pair],
    );
    return;
  }
  let series: Series;
  try {
    series = await fetchSeries(spec, target.exchange, target.pair);
  } catch {
    await db.query(
      "INSERT INTO monitor_status VALUES($1,$2,$3,'DATA_UNAVAILABLE',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
      [row.id, target.exchange, target.pair],
    );
    return;
  }
  const latest = series[spec.timeframe]?.at(-1)?.time;
  if (
    latest &&
    Object.entries(series).some(
      ([frame, bars]) =>
        (bars?.at(-1)?.time ?? 0) <
        Math.floor(latest / frames[frame as keyof typeof frames]) *
          frames[frame as keyof typeof frames],
    )
  ) {
    await db.query(
      "INSERT INTO monitor_status VALUES($1,$2,$3,'DATA_UNAVAILABLE',now()) ON CONFLICT(rule_id,exchange,pair) DO UPDATE SET status=excluded.status,checked_at=now()",
      [row.id, target.exchange, target.pair],
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
    const allowance = !!(
      await c.query(
        "SELECT 1 FROM entitlements WHERE owner_id=$1 AND pro_until>now()",
        [current.owner_id],
      )
    ).rowCount
      ? 20
      : 3;
    if (
      Number(
        (
          await c.query(
            "SELECT count(*) AS n FROM rules WHERE owner_id=$1 AND active",
            [current.owner_id],
          )
        ).rows[0].n,
      ) > allowance
    ) {
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
    const after = new Date(current.activated_at).getTime();
    if (!stored)
      state.lastTime =
        Math.floor(after / frames[spec.timeframe]) * frames[spec.timeframe];
    for (const bar of series[spec.timeframe] ?? []) {
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
            event,
            dedup,
            captureChart(
              series[spec.timeframe] ?? [],
              event.time,
              spec.timeframe,
            ),
          ],
        );
        if (inserted.rowCount)
          for (const destination of spec.destinations)
            deliveryIds.push(
              ...(
                await c.query(
                  "INSERT INTO deliveries(id,signal_id,destination_id,status) SELECT $1,$2,id,'PENDING' FROM destinations WHERE id=$3 AND owner_id=$4 AND verified ON CONFLICT DO NOTHING RETURNING id",
                  [randomUUID(), id, destination, row.owner_id],
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
  boss.on("error", () => console.error("Queue operation failed"));
  await boss.start();
  await boss.createQueue("scan");
  await boss.createQueue("evaluate", {
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
  });
  await boss.createQueue("deliver", { retryLimit: 3, retryDelay: 30 });
  await boss.updateQueue("evaluate", { notify: true });
  await boss.updateQueue("deliver", { notify: true });
  const realtime = new RealtimeMarkets(async (targets, closedAt) => {
    for (const target of targets)
      await boss.send("evaluate", target, {
        singletonKey: [
          target.ruleId,
          target.revision,
          target.exchange,
          target.pair,
          closedAt,
        ].join(":"),
        singletonSeconds: 1,
        expireInSeconds: 120,
      });
  });
  await boss.work("scan", async () => {
    const rows = (
      await db.query(
        "SELECT r.id,r.revision,r.spec FROM rules r WHERE r.active",
      )
    ).rows;
    realtime.reconcile(rows);
    for (const row of rows) {
      const spec = strategySchema.parse(row.spec);
      for (const exchange of spec.exchange)
        for (const pair of spec.pairs)
          await boss.send(
            "evaluate",
            { ruleId: row.id, revision: row.revision, exchange, pair },
            {
              singletonKey: [row.id, row.revision, exchange, pair].join(":"),
              singletonSeconds: 55,
              expireInSeconds: 120,
            },
          );
    }
    // Recover quota reservations left by a crashed process. A run has a 90-second deadline.
    await db.query(
      "UPDATE usage_ledger SET status='REFUNDED' WHERE status='RESERVED' AND created_at<now()-interval '5 minutes'",
    );
    await db.query(
      "UPDATE agent_runs SET status='FAILED' WHERE status='RUNNING' AND created_at<now()-interval '5 minutes'",
    );
    for (const row of (
      await db.query(
        "SELECT id FROM deliveries WHERE status IN ('PENDING','RETRY') LIMIT 500",
      )
    ).rows)
      await boss.send(
        "deliver",
        { id: row.id },
        { singletonKey: row.id, singletonSeconds: 55 },
      );
  });
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
        for (const id of deliveryIds ?? [])
          await boss.send(
            "deliver",
            { id },
            { singletonKey: id, singletonSeconds: 55 },
          );
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
