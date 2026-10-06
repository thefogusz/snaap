import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { localDatabase } from "./postgres.js";
import { migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { buildPreset } from "../dist/preset-catalog.js";
import { strategySchema, frames } from "../src/domain/engine.js";
import { preview } from "../src/domain/preview.js";
import { runUserJourneys } from "./user-journeys.js";

const serve = process.argv.includes("--serve");
const requests: any[] = [];
const catalog = async () => ({
  at: Date.now(),
  items: ["BTC/USDT", "ETH/USDT"].map((symbol) => ({
    symbol,
    supported: true,
  })),
});
const series = async () =>
  Object.fromEntries(
    Object.entries(frames).map(([frame, step]) => {
      const end = Math.floor(Date.now() / step) * step;
      return [
        frame,
        Array.from({ length: 120 }, (_, i) => ({
          time: end - (119 - i) * step,
          open: 100 + (i % 10),
          high: 113,
          low: 95,
          close: 100 + ((i + 1) % 10),
          volume: 1000 + i,
        })),
      ];
    }),
  );
function specFor(text: string, current: any = null) {
  let draft =
    current ??
    strategySchema.parse(
      buildPreset("rebound", {
        exchange: "Binance",
        market: "Spot",
        side: "SPOT",
        pair: "BTC/USDT",
        timeframe: "1h",
      }),
    );
  draft = structuredClone(draft);
  if (/short/i.test(text))
    draft = strategySchema.parse(
      buildPreset("rebound", {
        exchange: "Binance",
        market: "Perpetual Futures",
        side: "SHORT",
        pair: "BTC/USDT",
        timeframe: "15m",
      }),
    );
  if (/both|สองฝั่ง/i.test(text))
    draft = strategySchema.parse(
      buildPreset("cross", {
        exchange: "Binance",
        market: "Perpetual Futures",
        side: "BOTH",
        pair: "BTC/USDT",
        timeframe: "1h",
      }),
    );
  if (/break|ทะลุ/i.test(text))
    draft = strategySchema.parse(
      buildPreset("break-retest", {
        exchange: "Binance",
        market: "Spot",
        side: "SPOT",
        pair: "BTC/USDT",
        timeframe: "1h",
        level: 105,
      }),
    );
  if (/complex|ซับซ้อน|maximum/i.test(text)) {
    const compare = (timeframe: string, value: number) => ({
      kind: "COMPARE",
      left: { kind: "PRICE", field: "close", timeframe },
      op: ">",
      right: { kind: "CONSTANT", value },
    });
    draft.entry = {
      kind: "GROUP",
      op: "AND",
      children: [compare("1h", 100), compare("4h", 99)],
    };
    draft.stages = [
      {
        condition: { kind: "HOLD", bars: 2, condition: compare("1h", 101) },
        withinBars: 5,
      },
    ];
    draft.exit = compare("1h", 110);
    draft.cancel = compare("1d", 120);
    if (/maximum/i.test(text)) {
      draft.market = "Perpetual Futures";
      draft.side = "BOTH";
      draft.mirrorShort = true;
      draft.entry = {
        kind: "HOLD",
        bars: 2,
        condition: {
          kind: "GROUP",
          op: "AND",
          children: [
            compare("5m", 100),
            {
              kind: "GROUP",
              op: "OR",
              children: [compare("15m", 99), compare("1h", 98)],
            },
          ],
        },
      };
      draft.stages = [
        {
          condition: { kind: "HOLD", bars: 2, condition: compare("4h", 101) },
          withinBars: 5,
        },
      ];
      draft.entry.condition.children.push(...Array.from({ length: 14 }, (_, i) => compare("5m", 100 + i / 100)));
    }
  }
  if (/15m/.test(text)) {
    draft.timeframe = "15m";
    draft.entry.left && (draft.entry.left.timeframe = "15m");
  }
  draft.name = "แชททดสอบ · " + text.slice(0, 50);
  return draft;
}
function response(output: any[], status = "completed") {
  return {
    id: "resp_" + randomUUID(),
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: "local-fixture",
    status,
    incomplete_details:
      status === "incomplete" ? { reason: "max_output_tokens" } : null,
    output,
    usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
  };
}
const prose = (text: string, status = "completed") =>
  response(
    [
      {
        id: "msg_" + randomUUID(),
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    status,
  );
const tool = (name: string, args: any) => ({
  id: "fc_" + randomUUID(),
  type: "function_call",
  call_id: "call_" + randomUUID(),
  name,
  arguments: typeof args === "string" ? args : JSON.stringify(args),
  status: "completed",
});
const provider = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const text =
      body.input
        .filter((m: any) => m.role === "user")
        .at(-1)
        ?.content?.find?.((c: any) => c.type === "input_text")
        ?.text?.split("\n")[0] ?? "text-only";
    if (text === "slow" && body.input.at(-1)?.type !== "function_call_output")
      await new Promise((resolve) => setTimeout(resolve, 2000));
    if (text === "provider-error") {
      res.writeHead(500);
      res.end("{}");
      return;
    }
    let result;
    if (body.input.at(-1)?.type === "function_call_output")
      result = prose(
        body.input.some(
          (m: any) =>
            m.type === "function_call_output" &&
            JSON.parse(m.output).valid === true,
        )
          ? "ปรับร่างแล้ว ตรวจสรุปและบันทึกในแชทได้เลย"
          : "ยังปรับร่างไม่ได้ กรุณาระบุเงื่อนไขที่ถูกต้อง",
      );
    else if (text === "incomplete") result = prose("partial", "incomplete");
    else if (text === "empty") result = prose("");
    else if (text === "text-only")
      result = prose("เล่าไอเดียหรือเงื่อนไขที่อยากติดตามได้เลย");
    else if (text === "badjson")
      result = response([tool("propose_strategy", "{broken")]);
    else if (text === "tool-overflow")
      result = response(
        Array.from({ length: 7 }, () =>
          tool("read_skill", { name: "indicator-guide" }),
        ),
      );
    else if (text === "unknown-tool")
      result = response([tool("unknown_tool", {})]);
    else if (text === "skill-budget")
      result = response(
        ["indicator-guide", "risk-review", "trade-journal"].map((name) =>
          tool("read_skill", { name }),
        ),
      );
    else {
      const current = JSON.parse(
        body.instructions
          .split("Current editable draft (not activated): ")[1]
          .split("\nEdit the current draft")[0],
      );
      const draft = specFor(text, current);
      if (text === "unsupported") draft.pairs = ["NOTREAL/USDT"];
      if (text === "too-many-conditions")
        draft.entry = {
          kind: "GROUP",
          op: "AND",
          children: Array.from({ length: 21 }, () => draft.entry),
        };
      if (text === "foreign-destination") draft.destinations = [randomUUID()];
      result = response([
        tool("read_skill", { name: "indicator-guide" }),
        tool("find_instruments", {
          exchange: draft.exchange[0],
          market: draft.market,
          query: "BTCUSDT",
        }),
        tool("propose_strategy", { spec: draft }),
        tool("replay_strategy", { spec: draft }),
      ]);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  } catch {
    res.writeHead(500);
    res.end("{}");
  }
});
await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
process.env.AI_BASE_URL = `http://127.0.0.1:${(provider.address() as any).port}/v1`;
process.env.AI_API_KEY = "local-fixture";
process.env.AI_STANDARD_INPUT_USD_PER_MILLION = "0.25";
process.env.AI_STANDARD_OUTPUT_USD_PER_MILLION = "2";
process.env.AI_STANDARD_MAX_USD = "0.03";
const postgres = await localDatabase(),
  admin = new pg.Pool({ connectionString: postgres.url });
const schema = "harness_smoke_" + Date.now();
const imagePath = path.resolve(".local", schema + ".png");
await admin.query(`CREATE SCHEMA ${schema}`);
const db = new pg.Pool({
  connectionString: postgres.url,
  options: `-c search_path=${schema}`,
});
await migrate(db);
const { app } = await buildApp(db, {
  local: true,
  developerPro: true,
  monitoring: true,
  origin: "http://127.0.0.1:4175",
  validateMarket: async () => {},
  presetInstruments: catalog,
  harnessDependencies: { instruments: catalog, strategySeries: series },
});
if (serve)
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/api/v1/instruments"))
      return reply.send(await catalog());
    if (req.url === "/api/v1/preview") {
      const spec = strategySchema.parse((req.body as any).spec);
      return reply.send({
        ...preview(spec, await series(), (req.body as any).indicators ?? [], (req.body as any).chartFrame),
        source: {
          exchange: spec.exchange[0],
          pair: spec.pairs[0],
          frame: spec.timeframe,
          evaluationFrame: spec.timeframe,
          asOf: new Date().toISOString(),
        },
      });
    }
  });
const owner = serve ? "00000000-0000-4000-8000-000000000001" : randomUUID(),
  space = randomUUID(),
  token = randomUUID();
const headers = {
  host: "127.0.0.1:4175",
  cookie: `snaap_session=${token}`,
  "x-snaap-client": "web",
  "x-snaap-workspace": space,
};
async function call(
  url: string,
  method: any = "GET",
  payload?: any,
  status = 200,
) {
  const r = await app.inject({
    url: "/api/v1" + url,
    method,
    payload,
    headers,
  });
  assert.equal(r.statusCode, status, `${url}: ${r.body}`);
  return r.json();
}
async function cleanup() {
  await app.close();
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
  await postgres.stop();
  await new Promise<void>((resolve) => provider.close(() => resolve()));
  await unlink(imagePath).catch(() => {});
}
try {
  await db.query("INSERT INTO users(id,email) VALUES($1,$2)", [
    owner,
    "local@snaap.invalid",
  ]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 hour')", [
    hash(token),
    owner,
  ]);
  await db.query(
    "INSERT INTO entitlements(owner_id,pro_until) VALUES($1,now()+interval '1 day')",
    [owner],
  );
  await db.query(
    "INSERT INTO workspaces(id,owner_id,name,is_default) VALUES($1,$2,'Harness smoke',true)",
    [space, owner],
  );
  const conv = await call(
    "/conversations",
    "POST",
    { title: "Harness matrix" },
    201,
  );
  const turn = (text: string, extra: any = {}, status = 200) =>
    call(
      `/conversations/${conv.id}/turns`,
      "POST",
      { text, mode: "standard", ...extra },
      status,
    );
  assert.equal(
    (await turn("text-only", { draft: null })).draft,
    null,
    "fresh client null draft is supported",
  );
  for (const text of [
    "simple",
    "short",
    "both",
    "break",
    "complex",
    "maximum",
  ]) {
    const result = await turn(text);
    assert.ok(result.draft, text);
    strategySchema.parse(result.draft);
    assert.ok(result.changes.length);
    const last = requests
      .at(-1)
      .input.filter((m: any) => m.type === "function_call_output")
      .slice(-4)
      .map((m: any) => JSON.parse(m.output));
    assert.equal(last[0].loaded, true);
    assert.equal(last[1].items.length, 1);
    assert.equal(last[2].valid, true);
    assert.equal(last[3].coverage.bars, 120);
    assert.equal(last[3].spec.side, result.draft.side);
  }
  for (const text of [
    "badjson",
    "unknown-tool",
    "unsupported",
    "too-many-conditions",
    "foreign-destination",
  ])
    assert.equal((await turn(text)).draft, null, text);
  // Match the recent-conversations client: summaries contain no draft, so resume
  // from an authorized detail and carry its exact draft/revision into the harness.
  const accepted = (await turn('complex')).draft;
  await call(`/conversations/${conv.id}/draft`, 'PUT', {spec: accepted, expectedRevision: 0});
  const summary = (await call('/conversations?view=summary')).find((row: any) => row.id === conv.id);
  assert.ok(summary && !Object.hasOwn(summary, 'draft'));
  const detail = await call(`/conversations/${conv.id}`);
  assert.deepEqual(detail.draft, accepted);
  const analysis = await turn('text-only', {draft: detail.draft});
  assert.equal(analysis.draft, null);
  const supplied = JSON.parse(requests.at(-1).instructions.split('Current editable draft (not activated): ')[1].split('\nEdit the current draft')[0]);
  assert.deepEqual(supplied, strategySchema.parse(detail.draft));
  assert.equal((await call(`/conversations/${conv.id}`)).draft_revision, detail.draft_revision, 'analysis cannot mutate the saved draft');
  const revised = await turn('short', {draft: detail.draft});
  assert.ok(revised.draft && revised.changes.length);
  const saved = await call(`/conversations/${conv.id}/draft`, 'PUT', {spec: revised.draft, expectedRevision: detail.draft_revision});
  assert.equal(saved.draft_revision, detail.draft_revision + 1);
  await call(`/conversations/${conv.id}/draft`, 'PUT', {spec: detail.draft, expectedRevision: detail.draft_revision}, 409);
  assert.deepEqual((await call(`/conversations/${conv.id}`)).draft, revised.draft);
  assert.deepEqual((await call('/conversations')).find((row: any) => row.id === conv.id).draft, revised.draft);
  console.log('PASS: summary -> fresh detail -> harness analysis/edit -> revision-safe save preserves the exact accepted draft and legacy list');
  await turn("skill-budget");
  assert.equal(
    JSON.parse(
      requests
        .at(-1)
        .input.filter((m: any) => m.type === "function_call_output")
        .at(-1).output,
    ).error,
    "Specialist skill budget reached; narrow the task",
  );
  for (const [text, code] of [
    ["provider-error", "AI_UNAVAILABLE"],
    ["incomplete", "AI_INCOMPLETE"],
    ["empty", "AI_EMPTY"],
    ["tool-overflow", "AI_TOOL_LIMIT"],
  ])
    assert.equal((await turn(text, {}, 502)).error.code, code);
  await turn("text-only", { mode: "deep" }, 503);
  const beforeInvalid = requests.length;
  await turn("text-only", { imageIds: [randomUUID()] }, 404);
  await turn("x".repeat(4001), {}, 400);
  assert.equal(
    requests.length,
    beforeInvalid,
    "invalid requests never reach provider",
  );
  await mkdir(path.dirname(imagePath), { recursive: true });
  await sharp({
    create: { width: 64, height: 32, channels: 3, background: "#ccff55" },
  })
    .png()
    .toFile(imagePath);
  const imageId = randomUUID();
  await db.query(
    "INSERT INTO assets(id,owner_id,name,mime,storage_path,metadata,purpose,conversation_id) VALUES($1,$2,'local fixture','image/png',$3,$4,'chat',$5)",
    [imageId, owner, imagePath, { width: 64, height: 32 }, conv.id],
  );
  for (const crop of [undefined, { left: 0, top: 0, width: 32, height: 16 }]) {
    await turn("text-only", { imageIds: [imageId], ...(crop ? { crop } : {}) });
    const image = requests
      .at(-1)
      .input.at(-1)
      .content.find((item: any) => item.type === "input_image");
    assert.ok(image.image_url.startsWith("data:image/webp;base64,"));
    const metadata = await sharp(
      Buffer.from(image.image_url.split(",")[1], "base64"),
    ).metadata();
    assert.equal(metadata.width, crop ? 32 : 64);
  }
  for (let i = 0; i < 3; i++) assert.ok((await turn("complex")).draft);
  const statuses = (
    await db.query(
      "SELECT status,count(*)::int AS n FROM usage_ledger GROUP BY status",
    )
  ).rows;
  assert.ok(!statuses.some((r) => r.status === "RESERVED"));
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM agent_runs WHERE status='RUNNING'",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM rules")).rows[0].n,
    0,
    "Harness cannot save or activate",
  );
  console.log(
    "PASS: real Harness protocol: fresh chat, all four tools, Spot/Short/BOTH/stages/multiple frames, invalid schema/JSON/instruments/destinations, skill/tool limits, provider failures, refunds, deep gate and no rule writes",
  );
  if (process.argv.includes("--journeys"))
    await runUserJourneys(async () => (await buildApp(db, {
      local: true, monitoring: true, origin: "http://127.0.0.1:4175",
      validateMarket: async () => {}, presetInstruments: catalog,
      harnessDependencies: { instruments: catalog, strategySeries: series },
    })).app, db, specFor, requests);
  if (serve) {
    await app.listen({ host: "127.0.0.1", port: 4175 });
    console.log("Real Harness fixture http://127.0.0.1:4175");
    for (const event of ["SIGINT", "SIGTERM"] as const)
      process.once(event, () => void cleanup().then(() => process.exit(0)));
  } else await cleanup();
} catch (error) {
  await cleanup();
  throw error;
}
