import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { unseal } from "./vault.js";
import { transaction } from "./data/db.js";
import { mergeTrades } from "./domain/imports.js";

const DAY = 86400000;
/**
 * Merge synced trades into the single accumulated API import for a connection. The target is
 * the largest existing import (the accumulated one; manual snapshots are subsets of it), so
 * repeated syncs keep writing the same row instead of copying every trade into whichever row
 * currently has the oldest timestamp.
 */
export function accumulateImport<T extends { exchange: string; pair: string; id?: string; time: string }>(
  prior: { id: string; rows: T[] }[],
  incoming: T[],
) {
  const existing = prior.flatMap((x) => x.rows);
  const added = mergeTrades(existing, incoming).rows;
  const target = prior.reduce<(typeof prior)[number] | undefined>(
    (best, row) => (!best || row.rows.length > best.rows.length ? row : best),
    undefined,
  );
  const rows = mergeTrades([], existing)
    .rows.concat(added)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return { targetId: target?.id, added, rows };
}
/** Durable checkpoints; the UI never needs to choose a symbol or a date. */
export function automaticHistory(
  app: FastifyInstance,
  db: pg.Pool,
  deps: {
    client: (exchange: any, credentials: any, market: any) => any;
    verify: (exchange: any, api: any, market: any) => Promise<unknown>;
    fetch: (
      api: any,
      exchange: any,
      market: any,
      from: number,
      to: number,
    ) => Promise<any[]>;
    valid: (trades: any[], market: any, from: number, to: number) => any[];
    normalize: (trade: any, market: any, exchange: any, type: any) => any;
    error: (error: unknown, exchange: any) => Error;
  },
) {
  let busy = false,
    stopping = false;
  let activeTick:Promise<void>|undefined;
  async function persist(
    row: any,
    incoming: any[],
    details: any,
    status = "SYNCING",
  ) {
    await transaction(db, async (c) => {
      // Match manual sync lock order. Import FK checks also lock this owner.
      await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[row.owner_id]);
      const found = await c.query(
        "SELECT id FROM exchange_connections WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [row.id, row.owner_id],
      );
      if (!found.rowCount) throw new Error("DISCONNECTED");
      const prior = await c.query(
        "SELECT id,rows FROM imports WHERE owner_id=$1 AND account_scope=$2 ORDER BY created_at",
        [row.owner_id, row.id],
      );
      const { targetId, added, rows: combined } = accumulateImport(prior.rows, incoming);
      // One accumulated API import avoids filling the context with sync snapshots.
      if (added.length || !prior.rowCount) {
        const id = targetId ?? randomUUID();
        if (prior.rowCount)
          await c.query(
            "UPDATE imports SET rows=$1,created_at=now() WHERE id=$2",
            [JSON.stringify(combined), id],
          );
        else {
          await c.query(
            "INSERT INTO imports(id,owner_id,name,rows,account_scope) VALUES($1,$2,$3,$4,$5)",
            [
              id,
              row.owner_id,
              row.name + " · " + row.market + " API",
              JSON.stringify(combined),
              row.id,
            ],
          );
          await c.query(
            "INSERT INTO data_scopes(owner_id,kind,resource_id,workspace_ids) SELECT owner_id,'import',$3,workspace_ids FROM data_scopes WHERE owner_id=$1 AND kind='connection' AND resource_id=$2",
            [row.owner_id, row.id, id],
          );
        }
        // Existing snapshots remain for compatibility; no user data is deleted.
      }
      details.rows = combined.length;
      await c.query(
        "UPDATE exchange_connections SET status=$2,sync_details=$3,last_sync=CASE WHEN $2 IN ('SYNCED_WINDOW','PARTIAL_SYNC') THEN now() ELSE last_sync END WHERE id=$1",
        [row.id, status, JSON.stringify(details)],
      );
    });
  }
  async function run(row: any) {
    const api = deps.client(
      row.exchange,
      unseal(row.credentials, row.owner_id + ":" + row.id),
      row.market,
    );
    let details = row.sync_details ?? {};
    try {
      await deps.verify(row.exchange, api, row.market);
      await api.loadMarkets();
      const markets = Object.values(api.markets).filter((m: any) =>
        row.market === "Spot" ? m.spot : m.swap || m.future,
      ) as any[];
      markets.sort(
        (a, b) =>
          Number(b.base === "BTC") - Number(a.base === "BTC") ||
          a.symbol.localeCompare(b.symbol),
      );
      if (!details.to || details.done || details.version !== 1) {
        const to = Date.now();
        details = {
          version: 1,
          from:
            details.done && row.last_sync
              ? Math.max(to - 90 * DAY, Date.parse(row.last_sync) - DAY)
              : to - 90 * DAY,
          to,
          index: 0,
          period: 0,
          rows: details.rows ?? 0,
          limited: false,
        };
      }
      // Public instruments and read-only order history discover symbols;
      // no balance/asset API is used to find pairs.
      const groups =
        row.exchange === "Bybit"
          ? row.market === "Spot"
            ? ["spot"]
            : ["linear", "inverse"]
          : row.exchange === "OKX"
            ? row.market === "Spot"
              ? ["spot"]
              : ["swap", "future"]
            : null;
      let units = groups
        ? groups.map((type) => ({ type, symbol: undefined }))
        : markets;
      if (row.exchange === "MEXC" && row.market === "Futures") {
        if (!details.symbols) {
          const symbols = new Set<string>();
          for (let page = 1; page <= 100; page++) {
            const response = await api.contractPrivateGetOrderListHistoryOrders(
              {
                start_time: details.from,
                end_time: details.to,
                page_num: page,
                page_size: 100,
              },
            );
            if (
              response.success !== true ||
              Number(response.code) !== 0 ||
              !Array.isArray(response.data)
            )
              throw new Error("กระดานตอบประวัติออเดอร์ไม่สมบูรณ์");
            for (const order of response.data)
              if (typeof order.symbol === "string") symbols.add(order.symbol);
            if (response.data.length < 100) break;
            if (page === 100) details.limited = true;
          }
          details.symbols = [...symbols];
        }
        units = markets.filter((m) => details.symbols.includes(m.id));
        if (units.length < details.symbols.length) details.limited = true;
      }
      const periods = Math.ceil((details.to - details.from) / (7 * DAY));
      details.total = units.length * periods;
      await persist(row, [], details);
      for (let period = details.period; period < periods; period++) {
        const to = details.to - period * 7 * DAY,
          from = Math.max(details.from, to - 7 * DAY + 1);
        for (
          let index = period === details.period ? details.index : 0;
          index < units.length;
          index++
        ) {
          if (stopping) return;
          const live = await db.query(
            "SELECT id FROM exchange_connections WHERE id=$1 AND auto_sync=true",
            [row.id],
          );
          if (!live.rowCount) return;
          const unit = units[index];
          let requests = 0;
          const incoming: any[] = [];
          // Divide full pages into smaller time windows. This works with either
          // ascending or descending endpoints and never treats 100 fills as complete.
          async function read(start: number, end: number): Promise<void> {
            if (++requests > 64) {
              details.limited = true;
              return;
            }
            const trades = groups
              ? await api.fetchMyTrades(undefined, start, 100, {
                  until: end,
                  ...(row.exchange === "Bybit"
                    ? { category: unit.type }
                    : { type: unit.type }),
                })
              : await deps.fetch(api, row.exchange, unit, start, end);
            for (const trade of trades) {
              const market = api.markets[trade.symbol];
              if (
                !market ||
                (row.market === "Spot"
                  ? !market.spot
                  : !(market.swap || market.future))
              )
                continue;
              if (deps.valid([trade], market, start, end).length)
                incoming.push(
                  deps.normalize(trade, market, row.exchange, row.market),
                );
            }
            if (trades.length >= 100) {
              if (end <= start) {
                details.limited = true;
                return;
              }
              const mid = Math.floor((start + end) / 2);
              await read(mid + 1, end);
              await read(start, mid);
            }
          }
          try {
            await read(from, to);
          } catch (error) {
            if ((error as Error).name === "BadSymbol") {
              details.limited = true;
              details.unavailable = (details.unavailable ?? 0) + 1;
            } else throw error;
          }
          details.current = unit.symbol ?? unit.type;
          details.index = index + 1;
          details.period = period;
          details.completed = period * units.length + index + 1;
          await persist(row, incoming, details);
          // Resume the next period after a restart even at the exact boundary.
          if (index === units.length - 1) {
            details.index = 0;
            details.period = period + 1;
            await persist(row, [], details);
          }
        }
      }
      details.done = true;
      details.completed = details.total;
      // A bounded API window is never advertised as lifetime account history.
      await persist(
        row,
        [],
        details,
        details.limited ? "PARTIAL_SYNC" : "SYNCED_WINDOW",
      );
    } catch (error) {
      if ((error as Error).message === "DISCONNECTED") return;
      details.error = deps.error(error, row.exchange).message;
      await db.query(
        "UPDATE exchange_connections SET status='SYNC_FAILED',sync_details=$2 WHERE id=$1",
        [row.id, JSON.stringify(details)],
      );
    } finally {
      await api.close();
    }
  }
  async function tick() {
    if (busy || stopping) return;
    busy = true;
    let lock: pg.PoolClient | undefined;
    try {
      lock = await db.connect();
      const acquired = await lock.query(
        "SELECT pg_try_advisory_lock(73598211) AS acquired",
      );
      if (!acquired.rows[0].acquired) return;
      const rows = await db.query(
        "SELECT * FROM exchange_connections WHERE auto_sync=true AND (status IN ('VERIFIED','SYNCING') OR (status IN ('SYNCED_WINDOW','PARTIAL_SYNC') AND last_sync < now()-interval '6 hours')) ORDER BY last_sync NULLS FIRST",
      );
      for (const row of rows.rows) {
        if (stopping) break;
        await run(row);
      }
    } catch (error) {
      app.log.error({ err: error }, "Automatic trade history sync failed");
    } finally {
      if (lock) {
        await lock.query("SELECT pg_advisory_unlock(73598211)").catch(() => {});
        lock.release();
      }
      busy = false;
    }
  }
  function startTick(){
    if(!busy&&!stopping)activeTick=tick();
  }
  const timer = setInterval(startTick, 30000);
  timer.unref();
  app.addHook("onClose", async () => {
    stopping = true;
    clearInterval(timer);
    await activeTick;
  });
  return {
    async enable(owner: string, id?: string) {
      await db.query(
        "UPDATE exchange_connections SET auto_sync=true,status=CASE WHEN status IN ('VERIFIED','PARTIAL_SYNC') AND auto_sync=false THEN 'VERIFIED' ELSE status END WHERE owner_id=$1 AND ($2::uuid IS NULL OR id=$2)",
        [owner, id ?? null],
      );
      startTick();
    },
    async retry(owner: string, id: string) {
      await db.query(
        "UPDATE exchange_connections SET auto_sync=true,status='VERIFIED' WHERE owner_id=$1 AND id=$2 AND status<>'SYNCING'",
        [owner, id],
      );
      startTick();
    },
  };
}
