import ccxt from "ccxt";
import { lastClosedBoundary } from "../dist/timeframes.js";
import {
  frames,
  strategySchema,
  type Strategy,
  type Candle,
} from "./domain/engine.js";
import {
  neededFrames,
  ingestClosedCandles,
  invalidateCandles,
  marketHealth,
} from "./markets.js";

type Frame = keyof typeof frames;
type Target = {
  ruleId: string;
  revision: number;
  exchange: Strategy["exchange"][number];
  pair: string;
};
type Subscription = {
  exchange: Target["exchange"];
  market: Strategy["market"];
  pair: string;
  frame: Frame;
  targets: Target[];
};
type Client = {
  has: Record<string, unknown>;
  watchOHLCV: (pair: string, frame: string) => Promise<number[][]>;
  close: () => Promise<unknown>;
};
type Group = {
  client: Client;
  alive: boolean;
  subscriptions: Map<string, Subscription>;
};
const ids = {
  Binance: "binance",
  Bybit: "bybit",
  OKX: "okx",
  Bitget: "bitget",
  MEXC: "mexc",
} as const;

/** A following candle is evidence that an earlier candle finished. Wall clock alone is not. */
export function closedStreamCandles(
  rows: number[][],
  frame: Frame,
  now = Date.now(),
): Candle[] {
  const valid = rows
    .filter(
      (r) =>
        r.length >= 6 &&
        r.slice(0, 6).every(Number.isFinite) &&
        lastClosedBoundary(r[0], frame) === r[0],
    )
    .sort((a, b) => a[0] - b[0]);
  const nextStart = valid.at(-1)?.[0];
  if (nextStart === undefined) return [];
  return [
    ...new Map(
      valid
        .filter(
          (r) =>
            r[0] + frames[frame] <= nextStart && r[0] + frames[frame] <= now,
        )
        .map((r) => [
          r[0],
          {
            time: r[0] + frames[frame],
            open: r[1],
            high: r[2],
            low: r[3],
            close: r[4],
            volume: r[5],
          },
        ]),
    ).values(),
  ];
}

export function subscriptionsFor(
  rows: { id: string; revision: number; spec: unknown }[],
) {
  const subscriptions = new Map<string, Subscription>();
  for (const row of rows) {
    const parsed = strategySchema.safeParse(row.spec);
    if (!parsed.success) continue;
    const spec = parsed.data;
    for (const exchange of spec.exchange)
      for (const pair of spec.pairs)
        for (const frame of neededFrames(spec)) {
          const key = [exchange, spec.market, pair, frame].join(":");
          const sub = subscriptions.get(key) ?? {
            exchange,
            market: spec.market,
            pair,
            frame,
            targets: [],
          };
          sub.targets.push({
            ruleId: row.id,
            revision: row.revision,
            exchange,
            pair,
          });
          subscriptions.set(key, sub);
        }
  }
  return subscriptions;
}

export class RealtimeMarkets {
  private groups = new Map<string, Group>();
  private stopped = false;
  constructor(
    private onClose: (targets: Target[], time: number) => Promise<unknown>,
    private factory: (
      exchange: Target["exchange"],
      market: Strategy["market"],
    ) => Client = (exchange, market) => {
      const Constructor = (ccxt.pro as any)[ids[exchange]];
      return new Constructor({
        enableRateLimit: true,
        timeout: 12000,
        newUpdates: false,
        options: { defaultType: market === "Spot" ? "spot" : "swap" },
      });
    },
  ) {}

  reconcile(rows: { id: string; revision: number; spec: unknown }[]) {
    if (this.stopped) return;
    const wanted = new Map<string, Map<string, Subscription>>();
    for (const [key, sub] of subscriptionsFor(rows)) {
      const groupKey = sub.exchange + sub.market;
      if (!wanted.has(groupKey)) wanted.set(groupKey, new Map());
      wanted.get(groupKey)!.set(key, sub);
    }
    for (const [key, group] of this.groups) {
      const subs = wanted.get(key);
      if (
        subs &&
        JSON.stringify([...subs.keys()].sort()) ===
          JSON.stringify([...group.subscriptions.keys()].sort())
      ) {
        group.subscriptions = subs;
        wanted.delete(key);
        continue;
      }
      group.alive = false;
      for (const sub of group.subscriptions.values())
        invalidateCandles(sub.exchange, sub.market, sub.pair, sub.frame);
      void group.client.close().catch(() => {});
      this.groups.delete(key);
    }
    for (const [key, subscriptions] of wanted) {
      const sub = subscriptions.values().next().value!;
      const group = {
        client: this.factory(sub.exchange, sub.market),
        alive: true,
        subscriptions,
      };
      this.groups.set(key, group);
      for (const streamKey of subscriptions.keys())
        void this.listen(group, streamKey);
    }
  }

  private async listen(group: Group, key: string) {
    let lastClosed = 0,
      failures = 0;
    while (group.alive && !this.stopped) {
      const sub = group.subscriptions.get(key)!;
      try {
        if (!group.client.has.watchOHLCV) throw new Error("STREAM_UNSUPPORTED");
        const rows = await group.client.watchOHLCV(
          sub.market === "Spot" ? sub.pair : `${sub.pair}:USDT`,
          sub.frame,
        );
        if (!group.alive || this.stopped) return;
        const closed = closedStreamCandles(rows, sub.frame);
        const time = closed.at(-1)?.time;
        ingestClosedCandles(
          sub.exchange,
          sub.market,
          sub.pair,
          sub.frame,
          closed,
        );
        marketHealth.set(sub.exchange + sub.market, {
          status: "READY",
          lastSuccess: new Date().toISOString(),
          message: "WebSocket · ใช้ REST เมื่อแท่งปิดยังไม่ครบ",
        });
        failures = 0;
        if (time && time > lastClosed) {
          await this.onClose(group.subscriptions.get(key)!.targets, time);
          lastClosed = time;
        }
      } catch {
        if (!group.alive || this.stopped) return;
        invalidateCandles(sub.exchange, sub.market, sub.pair, sub.frame);
        marketHealth.set(sub.exchange + sub.market, {
          status: "REST_FALLBACK",
          message: "WebSocket ขาดการเชื่อมต่อ · ตรวจด้วย REST ทุกนาที",
        });
        failures++;
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(30000, 1000 * 2 ** Math.min(failures, 5)),
          ).unref(),
        );
      }
    }
  }

  async stop() {
    this.stopped = true;
    await Promise.allSettled(
      [...this.groups.values()].map((group) => {
        group.alive = false;
        return group.client.close();
      }),
    );
    this.groups.clear();
  }
}
