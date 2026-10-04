import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { localDatabase } from "./postgres.js";
import { database } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { contextBundle } from "../src/context.js";
import { preview } from "../src/domain/preview.js";
import { strategySchema, type Candle } from "../src/domain/engine.js";
const postgres = await localDatabase(),
  db = database(postgres.url);
const { app } = await buildApp(db, { local: true, monitoring: true });
const owner = randomUUID(),
  other = randomUUID(),
  token = randomUUID(),
  otherToken = randomUUID();
const headers = {
  host: "127.0.0.1:4173",
  "x-snaap-client": "web",
  cookie: `snaap_session=${token}`,
};
const outsider = { ...headers, cookie: `snaap_session=${otherToken}` };
const findings: any[] = [];
const record = (name: string, data: unknown) => {
  findings.push({ name, data });
  console.log(JSON.stringify({ name, data }));
};
const spec = strategySchema.parse({
  schemaVersion: 2,
  name: "AUDIT isolated fixture",
  exchange: ["MEXC"],
  market: "Spot",
  pairs: ["AUDITNOTREAL/USDT"],
  timeframe: "15m",
  entry: {
    kind: "COMPARE",
    op: ">",
    left: { kind: "PRICE", field: "close", timeframe: "15m" },
    right: { kind: "CONSTANT", value: 100 },
  },
  stages: [],
  cooldownBars: 0,
  destinations: [],
});
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
  await db.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')",
    [hash(token), owner, hash(otherToken), other],
  );
  record(
    "health",
    (await app.inject({ url: "/api/v1/health", headers })).json(),
  );
  const rule = (
    await app.inject({
      url: "/api/v1/rules",
      method: "POST",
      headers,
      payload: spec,
    })
  ).json();
  const activation = await app.inject({
    url: `/api/v1/rules/${rule.id}/activation`,
    method: "POST",
    headers,
    payload: { active: true, confirmation: "ACTIVATE", expectedRevision: 1 },
  });
  assert.equal(activation.statusCode, 400);
  record("nonexistent instrument activation", {
    status: activation.statusCode,
    active: activation.json().active,
  });
  await db.query("UPDATE rules SET active=false WHERE id=$1", [rule.id]);
  for (let i = 0; i < 21; i++)
    await db.query(
      "INSERT INTO signals(id,owner_id,rule_id,revision,exchange,pair,event,dedup,created_at) VALUES($1,$2,$3,1,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        owner,
        rule.id,
        "MEXC",
        "BTC/USDT",
        {
          kind: "ENTRY",
          time: Date.parse(i === 0 ? "2026-01-02" : "2026-02-02"),
          referencePrice: 100,
        },
        randomUUID(),
        i === 0 ? "2026-01-02" : "2026-02-02",
      ],
    );
  const context = await contextBundle(db, owner, {
    ruleIds: [rule.id],
    from: "2026-01-01T00:00:00Z",
    to: "2026-01-03T00:00:00Z",
  });
  assert.equal(context.sources.filter((s) => s.type === "signal").length, 1);
  record("historical context window", {
    expectedSignals: 1,
    returnedSignals: context.sources.filter((s) => s.type === "signal").length,
  });
  const conv = (
    await app.inject({
      url: "/api/v1/conversations",
      method: "POST",
      headers,
      payload: { title: "AUDIT isolated conversation" },
    })
  ).json();
  await db.query(
    "INSERT INTO messages(id,conversation_id,role,content,sources,created_at) SELECT gen_random_uuid(),$1,'user','message-'||i,'[]',now()+i*interval '1 second' FROM generate_series(1,201) i",
    [conv.id],
  );
  const messages = (
    await app.inject({
      url: `/api/v1/conversations/${conv.id}/messages`,
      headers,
    })
  ).json();
  assert.equal(messages.at(-1)?.content, "message-201");
  const older = (
    await app.inject({
      url: `/api/v1/conversations/${conv.id}/messages?before=${messages[0].id}`,
      headers,
    })
  ).json();
  assert.equal(older.length, 1);
  assert.equal(older[0].content, "message-1");
  record("long conversation reload", {
    expected: 201,
    returned: messages.length,
    last: messages.at(-1)?.content,
  });
  record(
    "cross-account conversation",
    (
      await app.inject({
        url: `/api/v1/conversations/${conv.id}/messages`,
        headers: outsider,
      })
    ).json(),
  );
  record(
    "cross-account context",
    (
      await app.inject({
        url: "/api/v1/context",
        method: "POST",
        headers: outsider,
        payload: { ruleIds: [rule.id] },
      })
    ).json().sources.length,
  );
  const boundary = "SNAAP-AUDIT-BOUNDARY";
  for (const file of [
    {
      route: "images",
      name: "broken.png",
      mime: "image/png",
      body: "not an image",
    },
    {
      route: "imports/preview",
      name: "broken.csv",
      mime: "text/csv",
      body: 'time,exchange\n"unterminated',
    },
  ]) {
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n${file.body}\r\n--${boundary}--\r\n`,
    );
    const r = await app.inject({
      url: "/api/v1/" + file.route,
      method: "POST",
      headers: {
        ...headers,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    assert.equal(r.statusCode, 400);
    record(file.name, { status: r.statusCode, error: r.json().error });
  }
  const start = performance.now();
  const candles: Candle[] = Array.from({ length: 500 }, (_, i) => ({
    time: (i + 1) * 900000,
    open: 100 + i,
    high: 102 + i,
    low: 99 + i,
    close: 101 + i,
    volume: 100,
  }));
  const complex = strategySchema.parse({
    ...spec,
    entry: {
      kind: "GROUP",
      op: "AND",
      children: Array.from({ length: 12 }, (_, i) => ({
        kind: "COMPARE",
        op: ">",
        left: {
          kind: "INDICATOR",
          name: "MACD",
          period: 2 + i,
          slow: 26,
          timeframe: "15m",
        },
        right: { kind: "CONSTANT", value: 0 },
      })),
    },
  });
  const complexStart = performance.now();
  preview(complex, { "15m": candles });
  record("synchronous preview computation", {
    bars: 500,
    macdConditions: 12,
    elapsedMs: Math.round(performance.now() - complexStart),
  });
  record("history non-USDT sync validation", {
    status: (
      await app.inject({
        url: `/api/v1/connections/${randomUUID()}/sync`,
        method: "POST",
        headers,
        payload: { pair: "ETH/BTC", from: "2026-01-01T00:00:00Z" },
      })
    ).statusCode,
  });
  await mkdir(".local/reports", { recursive: true });
  await writeFile(
    ".local/reports/system-audit.json",
    JSON.stringify({ at: new Date().toISOString(), findings }, null, 2),
  );
} finally {
  for (const table of [
    "monitor_checkpoints",
    "monitor_status",
    "signals",
    "rule_revisions",
  ])
    await db.query(
      `DELETE FROM ${table} WHERE rule_id IN (SELECT id FROM rules WHERE owner_id=$1)`,
      [owner],
    );
  await db.query("DELETE FROM rules WHERE owner_id=$1", [owner]);
  await db.query(
    "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE owner_id=$1)",
    [owner],
  );
  await db.query("DELETE FROM conversations WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await app.close();
  await db.end();
  await postgres.stop();
}
