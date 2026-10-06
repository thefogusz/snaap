/** Accelerated workflow simulation. Synthetic market data; no AI or external delivery. */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { evaluateTarget } from "../src/monitor.js";
import { contextBundle } from "../src/context.js";
import {
  strategySchema,
  frames,
  type Candle,
  type Series,
  type Condition,
  type Operand,
} from "../src/domain/engine.js";

const people = [
  ["เริ่มต้น", "ต้องการแจ้งเตือนง่ายๆ ไม่ปรับทุกวัน", "MEXC", "15m"],
  ["ระหว่างทำงาน", "รอเข้าแล้วออกตามเป้าราคา", "Binance", "1h"],
  ["สายเร็ว", "ติดตามจังหวะถี่และทบทวนแจ้งเตือนเก่า", "Bybit", "15m"],
  ["สวิง", "รอหลายแท่ง ไม่รีบเข้า", "OKX", "4h"],
  ["หลายกรอบเวลา", "ใช้แนวโน้มใหญ่กรองจังหวะเล็ก", "Bitget", "15m"],
  ["รอสองขั้น", "A เกิดแล้วรอ B มีหมดอายุ", "MEXC", "15m"],
  ["ระวังความเสี่ยง", "ยกเลิกเมื่อหลุดเงื่อนไข", "Binance", "1h"],
  ["ชอบทดลอง", "ปรับเซตอัปบ่อยจากสองแท็บ", "Bybit", "15m"],
  ["หลายเซตอัป", "Pro หมดอายุระหว่างติดตาม 4 เซตอัป", "OKX", "15m"],
  ["คุยละเอียด", "คุยต่อทุกวันและย้อนดูเหตุผลสัปดาห์แรก", "MEXC", "15m"],
] as const;
const start = Date.UTC(2026, 0, 1),
  dayMs = 86400000;
const constant = (value: number): Operand => ({ kind: "CONSTANT", value });
const price = (timeframe: any): Operand => ({
  kind: "PRICE",
  field: "close",
  timeframe,
});
const indi = (name: any, period: number, timeframe: any): Operand => ({
  kind: "INDICATOR",
  name,
  period,
  timeframe,
});
const compare = (left: Operand, op: any, right: Operand): Condition => ({
  kind: "COMPARE",
  left,
  op,
  right,
});
function setup(i: number) {
  const [name, , exchange, timeframe] = people[i];
  let entry: Condition = compare(price(timeframe), ">", constant(100));
  if (i === 1)
    entry = compare(
      price(timeframe),
      "CROSS_ABOVE",
      indi("EMA", 12, timeframe),
    );
  if (i === 2) entry = compare(price(timeframe), "CROSS_ABOVE", constant(100));
  if (i === 3)
    entry = {
      kind: "HOLD",
      bars: 2,
      condition: compare(price(timeframe), ">", indi("SMA", 5, timeframe)),
    };
  if (i === 4)
    entry = {
      kind: "GROUP",
      op: "AND",
      children: [
        compare(price("15m"), "CROSS_ABOVE", indi("EMA", 8, "15m")),
        compare(price("4h"), ">", indi("SMA", 5, "4h")),
      ],
    };
  if (i === 5) entry = compare(price(timeframe), "<", constant(99));
  if (i === 6)
    entry = compare(indi("RSI", 7, timeframe), "CROSS_ABOVE", constant(40));
  const exit = [1, 3, 4, 6].includes(i)
    ? {
        kind: "GROUP" as const,
        op: "OR" as const,
        children: [
          compare({ kind: "ENTRY_RETURN" }, ">=", constant(2)),
          compare({ kind: "ENTRY_RETURN" }, "<=", constant(-1)),
        ],
      }
    : undefined;
  return strategySchema.parse({
    schemaVersion: 2,
    name,
    exchange: [exchange],
    market: i === 2 ? "Perpetual Futures" : "Spot",
    pairs: ["BTC/USDT"],
    timeframe,
    entry,
    exit,
    cancel: i === 6 ? compare(price(timeframe), "<", constant(96)) : undefined,
    stages:
      i === 5
        ? [
            {
              condition: compare(price(timeframe), ">", constant(101)),
              withinBars: 3,
            },
          ]
        : [],
    cooldownBars: i === 2 ? 0 : 2,
    destinations: [],
  });
}
function market(seed: number): Series {
  let x = seed + 11,
    prev = 100;
  const raw: Candle[] = Array.from({ length: 14 * 96 + 192 }, (_, j) => {
    x = (1664525 * x + 1013904223) >>> 0;
    const close =
      100 +
      3 * Math.sin(j * 0.7) +
      2 * Math.sin(j * 0.047) +
      (seed - 1) * j * 0.001 +
      (x / 4294967296 - 0.5);
    const b = {
      time: start + (j - 191) * 900000,
      open: prev,
      high: Math.max(prev, close) + 0.4,
      low: Math.min(prev, close) - 0.4,
      close,
      volume: 100 + (x % 90),
    };
    prev = close;
    return b;
  });
  const out: Series = { "15m": raw };
  for (const frame of ["1h", "4h", "1d"] as const) {
    const count = frames[frame] / 900000,
      rows: Candle[] = [];
    for (let end = count - 1; end < raw.length; end += count) {
      const chunk = raw.slice(end - count + 1, end + 1);
      rows.push({
        time: chunk.at(-1)!.time,
        open: chunk[0].open,
        close: chunk.at(-1)!.close,
        high: Math.max(...chunk.map((b) => b.high)),
        low: Math.min(...chunk.map((b) => b.low)),
        volume: chunk.reduce((n, b) => n + b.volume, 0),
      });
    }
    out[frame] = rows;
  }
  return out;
}
const pg = await localDatabase(),
  admin = database(pg.url),
  name = "snaap_personas_" + randomUUID().replaceAll("-", "");
await admin.query(
  `CREATE DATABASE "${name}" WITH TEMPLATE template0 ENCODING 'UTF8'`,
);
const url = new URL(pg.url);
url.pathname = "/" + name;
const db = database(url.href);
const started = performance.now();
const checks: any[] = [],
  days: any[] = [],
  summaries: any[] = [];
let requests = 0,
  monitorCalls = 0;
let app: Awaited<ReturnType<typeof buildApp>>["app"] | undefined;
const check = (name: string, ok: boolean, detail: unknown) =>
  checks.push({ name, ok, detail });
try {
  await migrate(db);
  // This simulation explicitly exercises the optional plan enforcement mode.
  await db.query('UPDATE usage_policy SET policy=$1 WHERE id=1', [{mode:'plans'}]);
  app = (
    await buildApp(db, {
      local: true,
      monitoring: true,
      validateMarket: async () => {},
    })
  ).app;
  for (let round = 0; round < 3; round++) {
    const full = market(round);
    for (let person = 0; person < 10; person++) {
      const owner = randomUUID(),
        token = randomUUID(),
        headers = {
          host: "127.0.0.1:4173",
          "x-snaap-client": "web",
          cookie: `snaap_session=${token}`,
        };
      await db.query("INSERT INTO users(id) VALUES($1)", [owner]);
      await db.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')",
        [hash(token), owner],
      );
      if (person === 8)
        await db.query(
          "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '30 days')",
          [owner],
        );
      const call = async (method: any, path: string, payload?: any) => {
        requests++;
        const r = await app!.inject({
          method,
          url: "/api/v1/" + path,
          headers,
          payload,
        });
        if (r.statusCode >= 500 || r.statusCode === 429)
          throw new Error(`${path}: ${r.statusCode}`);
        return { status: r.statusCode, body: r.json() };
      };
      let spec = setup(person),
        rule = (await call("POST", "rules", spec)).body;
      const activate = async (on: boolean, at: number) => {
        const r = await call("POST", `rules/${rule.id}/activation`, {
          active: on,
          expectedRevision: rule.revision,
          confirmation: "ACTIVATE",
        });
        if (r.status !== 200) throw Error("Activation failed");
        rule = r.body;
        if (on)
          await db.query("UPDATE rules SET activated_at=$2 WHERE id=$1", [
            rule.id,
            new Date(at),
          ]);
      };
      await activate(true, start);
      if (person === 8)
        for (let j = 0; j < 3; j++) {
          const extra = (
            await call("POST", "rules", {
              ...spec,
              name: "เซตอัปเพิ่มเติม " + j,
            })
          ).body;
          await call("POST", `rules/${extra.id}/activation`, {
            active: true,
            expectedRevision: 1,
            confirmation: "ACTIVATE",
          });
        }
      const conv = (
        await call("POST", "conversations", { title: people[person][0] })
      ).body;
      let staleRejected = 0,
        pauseNoSignals = true,
        duplicateFree = true,
        expiredSuppression: any = null;
      for (let day = 1; day <= 14; day++) {
        const until = start + day * dayMs,
          from = until - dayMs;
        if (person === 7 && (day === 5 || day === 10)) {
          const old = rule.revision;
          spec = { ...spec, cooldownBars: day };
          const edited = await call("PUT", `rules/${rule.id}`, {
            expectedRevision: old,
            spec,
          });
          rule = edited.body;
          check("edit pauses until confirmed", rule.active === false, {
            round,
            person,
            day,
          });
          staleRejected +=
            (
              await call("PUT", `rules/${rule.id}`, {
                expectedRevision: old,
                spec,
              })
            ).status === 409
              ? 1
              : 0;
          await activate(true, from);
        }
        if (day === 8) await activate(false, from);
        if (day === 9) await activate(true, from);
        if (person === 8 && day === 11)
          await db.query(
            "UPDATE entitlements SET pro_until=now()-interval '1 second' WHERE owner_id=$1",
            [owner],
          );
        const series = Object.fromEntries(
          Object.entries(full).map(([f, b]) => [
            f,
            b!.filter((b) => b.time <= until),
          ]),
        ) as Series;
        const target = {
          ruleId: rule.id,
          revision: rule.revision,
          exchange: spec.exchange[0],
          pair: spec.pairs[0],
        };
        const count = async () =>
          Number(
            (
              await db.query(
                "SELECT count(*) AS n FROM signals WHERE rule_id=$1",
                [rule.id],
              )
            ).rows[0].n,
          );
        const before = await count();
        if (day === 7 && person % 3 === 0) {
          await evaluateTarget(db, target, async () => {
            throw Error("SIMULATED_OUTAGE");
          });
          monitorCalls++;
          check(
            "outage visible",
            (
              await db.query(
                "SELECT status FROM monitor_status WHERE rule_id=$1",
                [rule.id],
              )
            ).rows[0]?.status === "DATA_UNAVAILABLE",
            { round, person },
          );
        }
        await evaluateTarget(db, target, async () => series);
        monitorCalls++;
        const after = await count();
        await evaluateTarget(db, target, async () => series);
        monitorCalls++;
        duplicateFree &&= (await count()) === after;
        if (day === 8) pauseNoSignals &&= after === before;
        // Fixture timestamps track virtual insertion day; candle event time remains independently stored.
        await db.query(
          "UPDATE signals SET created_at=to_timestamp((event->>'time')::double precision/1000) WHERE rule_id=$1",
          [rule.id],
        );
        if (person === 8 && day === 11) {
          const cp = (
            await db.query(
              "SELECT state FROM monitor_checkpoints WHERE rule_id=$1",
              [rule.id],
            )
          ).rows[0];
          expiredSuppression = {
            newSignals: after - before,
            active: rule.active,
            lastTime: cp?.state.lastTime,
            expectedUntil: until,
          };
        }
        await call("GET", "rules");
        await call("GET", "signals");
        const messages = person === 9 ? 16 : 2;
        await db.query(
          "INSERT INTO messages(id,conversation_id,role,content,sources,created_at) SELECT gen_random_uuid(),$1,'user','fixture day '||$2::text||' message '||i,'[]', $3::timestamptz+i*interval '1 second' FROM generate_series(1,$4::int) i",
          [conv.id, day, new Date(from), messages],
        );
        const loaded = (await call("GET", `conversations/${conv.id}/messages`))
          .body;
        days.push({
          round,
          person,
          day,
          newSignals: after - before,
          loadedMessages: loaded.length,
        });
      }
      check("duplicate evaluation emits no duplicates", duplicateFree, {
        round,
        person,
      });
      check("paused setup emits no signals", pauseNoSignals, { round, person });
      if (person === 7)
        check("stale editor updates rejected", staleRejected === 2, {
          round,
          person,
          staleRejected,
        });
      const saved = (
        await db.query(
          "SELECT event,revision FROM signals WHERE rule_id=$1 ORDER BY created_at",
          [rule.id],
        )
      ).rows;
      check(
        "signals reference existing revisions",
        (
          await db.query(
            "SELECT count(*)::int AS n FROM signals s LEFT JOIN rule_revisions v ON v.rule_id=s.rule_id AND v.revision=s.revision WHERE s.rule_id=$1 AND v.rule_id IS NULL",
            [rule.id],
          )
        ).rows[0].n === 0,
        { round, person },
      );
      const ctx = await contextBundle(db, owner, {
        ruleIds: [rule.id],
        from: new Date(start).toISOString(),
        to: new Date(start + 7 * dayMs).toISOString(),
      });
      const expected = saved.filter(
        (s) => s.event.time >= start && s.event.time <= start + 7 * dayMs,
      ).length;
      const actual = ctx.sources.filter((s) => s.type === "signal").length;
      check("week-one context complete", actual === expected, {
        round,
        person,
        expected,
        actual,
      });
      let history = (await call("GET", "signals")).body;
      let page = history;
      while (page.length === 100) {
        page = (await call("GET", "signals?before=" + page.at(-1).id)).body;
        history.push(...page);
      }
      check(
        "all two-week signals reachable with pagination",
        history.length === saved.length,
        { round, person, stored: saved.length, returned: history.length },
      );
      const loaded = (await call("GET", `conversations/${conv.id}/messages`))
        .body;
      check(
        "latest conversation message visible",
        loaded.at(-1)?.content.includes("day 14 "),
        { round, person, returned: loaded.length },
      );
      if (expiredSuppression) {
        const status = (await call("GET", "monitor")).body.find(
          (s: any) => s.rule_id === rule.id,
        );
        const listing = (await call("GET", "rules")).body.find(
          (r: any) => r.id === rule.id,
        );
        check(
          "expired Pro visibly blocked",
          status?.status === "QUOTA_BLOCKED" && listing.quota_blocked === true,
          { round, person },
        );
        const extra = (await call("GET", "rules")).body.find(
          (r: any) => r.id !== rule.id,
        );
        await call("POST", `rules/${extra.id}/activation`, {
          active: false,
          confirmation: "ACTIVATE",
          expectedRevision: extra.revision,
        });
        await evaluateTarget(
          db,
          {
            ruleId: rule.id,
            revision: rule.revision,
            exchange: spec.exchange[0],
            pair: spec.pairs[0],
          },
          async () => full,
        );
        monitorCalls++;
        check(
          "monitor resumes after user resolves quota",
          (await call("GET", "monitor")).body.find(
            (s: any) => s.rule_id === rule.id,
          )?.status === "READY",
          { round, person },
        );
      }
      summaries.push({
        round,
        persona: people[person][0],
        goal: people[person][1],
        exchange: spec.exchange[0],
        timeframe: spec.timeframe,
        signals: saved.length,
        eventKinds: saved.reduce(
          (a, s) => ((a[s.event.kind] = (a[s.event.kind] ?? 0) + 1), a),
          {},
        ),
        revision: rule.revision,
      });
      console.log(JSON.stringify(summaries.at(-1)));
    }
  }
  const result = {
    at: new Date().toISOString(),
    method:
      "3 deterministic synthetic market paths x 10 scripted personas x 14 virtual days. Real API/DB/monitor; daily catch-up batches with repeated evaluation attempts. No live AI, no external notifications, no real-time soak. Chat entries are fixtures, not generated answers. No browser usability measurement.",
    virtualUserDays: 420,
    requests,
    monitorCalls,
    elapsedMs: Math.round(performance.now() - started),
    checks,
    summaries,
    days,
  };
  await mkdir(".local/reports", { recursive: true });
  await writeFile(
    ".local/reports/persona-simulation.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      virtualUserDays: 420,
      requests,
      monitorCalls,
      checks: checks.length,
      failedChecks: checks.filter((c) => !c.ok).length,
      elapsedMs: result.elapsedMs,
    }),
  );
  if (checks.some((c) => !c.ok))
    throw new Error("Persona regression checks failed; see report");
} finally {
  await app?.close();
  await db.end();
  await admin.query(`DROP DATABASE "${name}"`);
  await admin.end();
  await pg.stop();
}
