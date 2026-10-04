import type pg from "pg";
export function lineLimits() {
  const count = (value: string | undefined, fallback: number) =>
    value !== undefined && /^\d+$/.test(value)
      ? Math.min(Number(value), 10000000)
      : fallback;
  return {
    user: count(process.env.LINE_MONTHLY_USER_LIMIT, 30),
    total: count(process.env.LINE_MONTHLY_TOTAL_LIMIT, 250),
  };
}
export function lineMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}
/** Reserve before external I/O. Failed/ambiguous requests consume a slot conservatively. */
export async function reserveLine(
  client: pg.PoolClient,
  owner: string,
  id: string,
) {
  const month = lineMonth(),
    limit = lineLimits();
  if (limit.user === 0 || limit.total === 0) return false;
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('snaap-line-quota'))",
  );
  const existing = await client.query(
    "SELECT owner_id,month FROM notification_quota WHERE request_id=$1",
    [id],
  );
  if (
    existing.rowCount &&
    existing.rows[0].owner_id === owner &&
    existing.rows[0].month === month
  )
    return true;
  const used = (
    await client.query(
      "SELECT count(*)::integer AS total,count(*) FILTER (WHERE owner_id=$1)::integer AS own FROM notification_quota WHERE month=$2",
      [owner, month],
    )
  ).rows[0];
  if (used.own >= limit.user || used.total >= limit.total) return false;
  // A retry across a month boundary consumes a new slot as the provider may accept it again.
  await client.query(
    "INSERT INTO notification_quota(request_id,owner_id,month) VALUES($1,$2,$3) ON CONFLICT(request_id) DO UPDATE SET month=EXCLUDED.month",
    [id, owner, month],
  );
  return true;
}
