import type pg from "pg";
function tradeSummary(rows: any[]) {
  const pairs = new Map<string, number>();
  const days = new Set<string>();
  let buys = 0,
    sells = 0;
  let longFills = 0,
    shortFills = 0;
  const times: number[] = [];
  for (const row of rows) {
    pairs.set(row.pair, (pairs.get(row.pair) ?? 0) + 1);
    if (row.side === "buy") buys++;
    if (row.side === "sell") sells++;
    if (row.positionSide === "LONG") longFills++;
    if (row.positionSide === "SHORT") shortFills++;
    const time = Date.parse(row.time);
    if (Number.isFinite(time)) {
      times.push(time);
      days.add(new Date(time).toISOString().slice(0, 10));
    }
  }
  times.sort((a, b) => a - b);
  return {
    scope: "ALL_FILTERED_IMPORTED_FILLS",
    observedFills: rows.length,
    buyFills: buys,
    sellFills: sells,
    longFills,
    shortFills,
    directionUnknownFills: rows.length - longFills - shortFills,
    uniquePairs: pairs.size,
    activeTradingDays: days.size,
    tradingDayTimezone: "UTC",
    firstFill: times.length ? new Date(times[0]).toISOString() : null,
    lastFill: times.length ? new Date(times.at(-1)!).toISOString() : null,
    mostTradedPairs: [...pairs]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([pair, fills]) => ({ pair, fills })),
    warning:
      "These summary metrics cover all filtered imported fills, not only the raw-row sample. Fills are execution records, not distinct orders or completed positions. They alone do not establish holding duration, intentional scaling, leverage, risk tolerance or entry intent.",
  };
}
export async function sourceIds(
  db: pg.Pool,
  owner: string,
  workspaceId?: string,
) {
  const rows = (
    await db.query(
      `SELECT id FROM rules WHERE owner_id=$1 AND ($2::uuid IS NULL OR workspace_id=$2)
       UNION ALL SELECT id FROM imports WHERE owner_id=$1 AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=imports.id AND s.owner_id=$1 AND s.kind='import' AND s.workspace_ids IS NOT NULL AND NOT ($2=ANY(s.workspace_ids))))
       UNION ALL SELECT id FROM signals WHERE owner_id=$1 AND ($2::uuid IS NULL OR rule_id IN (SELECT id FROM rules WHERE owner_id=$1 AND workspace_id=$2))
       UNION ALL SELECT id FROM assets WHERE owner_id=$1 AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=assets.id AND s.owner_id=$1 AND s.kind='image' AND s.workspace_ids IS NOT NULL AND NOT ($2=ANY(s.workspace_ids))))`,
      [owner, workspaceId ?? null],
    )
  ).rows;
  return new Set(rows.map((r) => r.id));
}
export async function contextBundle(
  db: pg.Pool,
  owner: string,
  selection: {
    ruleIds?: string[];
    importIds?: string[];
    from?: string;
    to?: string;
  } = {},
  workspaceId?: string,
) {
  const rules = (
    await db.query(
      "SELECT id,revision,spec,updated_at FROM rules WHERE owner_id=$1 AND ($3::uuid IS NULL OR workspace_id=$3) AND ($2::uuid[] IS NULL OR id=ANY($2)) ORDER BY updated_at DESC LIMIT 12",
      [owner, selection.ruleIds ?? null, workspaceId ?? null],
    )
  ).rows;
  const imports = (
    await db.query(
      "SELECT i.id,i.name,i.rows,i.created_at,i.account_scope,c.last_sync,c.status AS sync_status FROM imports i LEFT JOIN exchange_connections c ON c.id::text=i.account_scope AND c.owner_id=i.owner_id WHERE i.owner_id=$1 AND ($3::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=i.id AND s.owner_id=$1 AND s.kind='import' AND s.workspace_ids IS NOT NULL AND NOT ($3=ANY(s.workspace_ids)))) AND ($2::uuid[] IS NULL OR i.id=ANY($2)) ORDER BY i.created_at DESC LIMIT 5",
      [owner, selection.importIds ?? null, workspaceId ?? null],
    )
  ).rows;
  const signals = (
    await db.query(
      "SELECT id,rule_id,revision,exchange,pair,event,created_at,count(*) OVER() AS total FROM signals WHERE owner_id=$1 AND ($5::uuid IS NULL OR rule_id IN (SELECT id FROM rules WHERE owner_id=$1 AND workspace_id=$5)) AND ($2::uuid[] IS NULL OR rule_id=ANY($2)) AND ($3::timestamptz IS NULL OR created_at >= $3) AND ($4::timestamptz IS NULL OR created_at <= $4) ORDER BY created_at DESC,id DESC LIMIT 100",
      [
        owner,
        selection.ruleIds ?? null,
        selection.from ?? null,
        selection.to ?? null,
        workspaceId ?? null,
      ],
    )
  ).rows;
  const from = selection.from ? Date.parse(selection.from) : -Infinity,
    to = selection.to ? Date.parse(selection.to) : Infinity;
  return {
    asOf: new Date().toISOString(),
    coverage: {
      signals: {
        total: Number(signals[0]?.total ?? 0),
        included: signals.length,
        truncated: Number(signals[0]?.total ?? 0) > signals.length,
      },
    },
    sources: [
      ...rules.map((r) => ({
        id: r.id,
        type: "rule",
        revision: r.revision,
        asOf: r.updated_at,
        facts: r.spec,
      })),
      ...imports
        .filter(
          (r, index) =>
            !r.sync_status ||
            imports.findIndex(
              (other) => other.account_scope === r.account_scope,
            ) === index,
        )
        .map((r) => {
          const rows = r.rows.filter(
            (x: any) => Date.parse(x.time) >= from && Date.parse(x.time) <= to,
          );
          return {
            id: r.id,
            type: "import",
            name: r.name,
            asOf: r.created_at,
            facts: {
              rows: rows.slice(-30),
              summary: tradeSummary(rows),
              summaryCoversAllFilteredImportedRows: true,
              rawRowsScope: "LATEST_30_FILTERED_FILLS_SAMPLE",
              total: rows.length,
              includedRows: Math.min(30, rows.length),
              truncated: rows.length > 30,
              accountScope: r.account_scope,
              lastSync: r.last_sync ?? null,
              syncStatus: r.sync_status ?? "FILE_IMPORT",
              completeAccountHistory: false,
              warning: "Trade fills do not establish entry/exit intent",
            },
          };
        }),
      ...signals
        .filter(
          (r) =>
            Date.parse(r.created_at) >= from && Date.parse(r.created_at) <= to,
        )
        .map((r) => ({
          id: r.id,
          type: "signal",
          asOf: r.created_at,
          facts: {
            ruleId: r.rule_id,
            revision: r.revision,
            exchange: r.exchange,
            pair: r.pair,
            event: r.event,
          },
        })),
    ],
    limitations: [
      "Describe observable trading activity when asked about trading style; do not infer personality or emotions. This is not a reason to refuse a trading-pattern summary.",
      "No live account scope unless an integration reports a successful sync",
      "Previous AI responses are not evidence of user intent",
    ],
  };
}
