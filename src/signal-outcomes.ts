import type pg from "pg";
import { candles } from "./markets.js";
import { measureOutcome } from "./domain/outcomes.js";
import { isValidCandle } from "./domain/insights.js";
import {
  frames,
  type Candle,
  type Signal,
  type Strategy,
} from "./domain/engine.js";
import { transaction } from "./data/db.js";

/** Independent of activation/revision: an emitted signal keeps its original window. */
export async function updateSignalOutcome(
  db: pg.Pool,
  id: string,
  fetchCandles = candles,
  now = Date.now(),
) {
  const row = (
    await db.query(
      "SELECT o.*,s.event,s.exchange,s.pair,rv.spec FROM signal_outcomes o JOIN signals s ON s.id=o.signal_id JOIN rule_revisions rv ON rv.rule_id=s.rule_id AND rv.revision=s.revision WHERE o.signal_id=$1 AND NOT o.finalized",
      [id],
    )
  ).rows[0];
  if (!row) return;
  const frame = row.frame as keyof typeof frames,
    event = row.event as Signal;
  let incoming: Candle[] = [];
  try {
    incoming = await fetchCandles(
      row.exchange as Strategy["exchange"][number],
      row.spec.market,
      row.pair,
      frame,
    );
  } catch {
    /* retain observed bars, record incomplete coverage below */
  }
  await transaction(db, async (c) => {
    const current = (
      await c.query(
        "SELECT * FROM signal_outcomes WHERE signal_id=$1 AND NOT finalized FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!current) return;
    // First observation wins, so exchange corrections cannot silently rewrite measurements.
    const observed = [
      ...new Map(
        [...incoming, ...current.candles]
          .filter(
            (b: Candle) =>
              b.time > event.time &&
              b.time <= event.time + row.horizon * frames[frame] &&
              b.time <= now &&
              isValidCandle(b, frame),
          )
          .map((b: Candle) => [b.time, b]),
      ).values(),
    ] as Candle[];
    observed.sort((a, b) => a.time - b.time);
    const result = measureOutcome(
      event,
      frame,
      observed,
      current.risk_snapshot,
      row.horizon,
      now,
    );
    const finalized =
      result.status === "COMPLETE" || now >= result.endsAt + 2 * frames[frame];
    await c.query(
      "UPDATE signal_outcomes SET candles=$2,result=$3,finalized=$4,checked_at=now() WHERE signal_id=$1",
      [id, JSON.stringify(observed), result, finalized],
    );
  });
}
