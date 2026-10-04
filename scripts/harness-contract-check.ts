import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
const requests: any[] = [];
let reply: (body: any) => Promise<any> = async () => response("complete");
function response(text: string, status = "completed") {
  return {
    id: "resp_" + randomUUID(),
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: "fixture",
    status,
    incomplete_details:
      status === "incomplete" ? { reason: "max_output_tokens" } : null,
    output: [
      {
        id: "msg_" + randomUUID(),
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
  };
}
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const result = await reply(body);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.AI_BASE_URL = `http://127.0.0.1:${(server.address() as any).port}/v1`;
process.env.AI_API_KEY = "test-fixture";
process.env.AI_STANDARD_INPUT_USD_PER_MILLION = "0.25";
process.env.AI_STANDARD_OUTPUT_USD_PER_MILLION = "2";
process.env.AI_STANDARD_MAX_USD = "0.03";
const pg = process.env.TEST_DATABASE_URL
    ? { url: process.env.TEST_DATABASE_URL, stop: async () => {} }
    : await localDatabase(),
  db = database(pg.url);
if (process.env.TEST_DATABASE_URL) await migrate(db);
const { app } = await buildApp(db, { local: true });
const owner = randomUUID(),
  token = randomUUID(),
  headers = {
    host: "127.0.0.1:4173",
    "x-snaap-client": "web",
    cookie: "snaap_session=" + token,
  };
try {
  await db.query("INSERT INTO users(id) VALUES($1)", [owner]);
  await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '1 day')", [
    hash(token),
    owner,
  ]);
  const id = (
    await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers,
      payload: { title: "Contract fixtures" },
    })
  ).json().id;
  const turn = (text: string) =>
    app.inject({
      method: "POST",
      url: `/api/v1/conversations/${id}/turns`,
      headers,
      payload: {
        text,
        mode: "standard",
        selection: { ruleIds: [], importIds: [] },
      },
    });
  reply = async () => response("partial", "incomplete");
  const incomplete = await turn("fixture incomplete");
  assert.equal(incomplete.statusCode, 502);
  assert.equal(incomplete.json().error.code, "AI_INCOMPLETE");
  assert.equal(
    (
      await db.query(
        "SELECT count(*) n FROM messages WHERE conversation_id=$1 AND role='assistant'",
        [id],
      )
    ).rows[0].n,
    "0",
  );
  assert.equal(
    (
      await db.query("SELECT status FROM usage_ledger WHERE owner_id=$1", [
        owner,
      ])
    ).rows[0].status,
    "REFUNDED",
  );
  console.log(
    "PASS incomplete answer rejected, no assistant persisted, quota refunded",
  );
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    ready = new Promise<void>((resolve) => (entered = resolve));
  reply = async () => {
    entered();
    await gate;
    return response("completed fixture");
  };
  const pending = turn("accepted pending");
  await ready;
  const busy = await turn("must not enter history");
  assert.equal(busy.statusCode, 429);
  assert.equal(busy.json().error.code, "AGENT_BUSY");
  assert.equal(
    (
      await db.query(
        "SELECT count(*) n FROM messages WHERE conversation_id=$1 AND content='must not enter history'",
        [id],
      )
    ).rows[0].n,
    "0",
  );
  release();
  assert.equal((await pending).statusCode, 200);
  console.log(
    "PASS concurrent rejected request cannot contaminate accepted history",
  );
  const deleted = randomUUID();
  await db.query(
    "INSERT INTO messages(id,conversation_id,role,content,sources) VALUES($1,$2,'assistant','DELETED_SOURCE_ASSISTANT',$3),($4,$2,'user','DELETED_SOURCE_USER',$3)",
    [
      randomUUID(),
      id,
      JSON.stringify([{ id: deleted, type: "image" }]),
      randomUUID(),
    ],
  );
  reply = async () => response("safe");
  assert.equal((await turn("fresh request")).statusCode, 200);
  assert.ok(!JSON.stringify(requests.at(-1).input).includes("DELETED_SOURCE_"));
  console.log(
    "PASS deleted-source history filtered for both user and assistant",
  );
  reply = async () => response("ส่งร่างเข้า editor แล้วครับ");
  const missing = await turn("แก้เงื่อนไข RSI");
  assert.equal(missing.statusCode, 502);
  assert.equal(missing.json().error.code, "AI_ACTION_MISSING");
  assert.equal(requests.at(-1).tool_choice.name, "propose_strategy");
  console.log(
    "PASS false draft success triggers tool repair then rejects unresolved claim",
  );
  const image = randomUUID();
  await db.query(
    "INSERT INTO assets(id,owner_id,name,mime,storage_path,metadata,purpose,conversation_id) VALUES($1,$2,'crop fixture','image/webp','unused fixture path',$3,'chat',$4)",
    [image, owner, { width: 800, height: 450 }, id],
  );
  const requestCount = requests.length;
  const invalidCrop = await app.inject({
    method: "POST",
    url: `/api/v1/conversations/${id}/turns`,
    headers,
    payload: {
      text: "crop test",
      mode: "standard",
      imageIds: [image],
      crop: { left: 790, top: 0, width: 100, height: 20 },
    },
  });
  assert.equal(invalidCrop.statusCode, 400);
  assert.equal(invalidCrop.json().error.code, "IMAGE_CROP_BOUNDS");
  const noImage = await app.inject({
    method: "POST",
    url: `/api/v1/conversations/${id}/turns`,
    headers,
    payload: {
      text: "crop test",
      mode: "standard",
      imageIds: [],
      crop: { left: 0, top: 0, width: 10, height: 10 },
    },
  });
  assert.equal(noImage.statusCode, 400);
  assert.equal(noImage.json().error.code, "IMAGE_CROP_COUNT");
  assert.equal(requests.length, requestCount);
  console.log(
    "PASS invalid image crops rejected before provider call or quota reservation",
  );
  const privateImport = randomUUID();
  await db.query(
    "INSERT INTO imports(id,owner_id,name,rows) VALUES($1,$2,$3,$4)",
    [
      privateImport,
      owner,
      "PRIVATE_HISTORY_SENTINEL",
      JSON.stringify([
        {
          id: "fixture",
          time: "2026-10-01T00:00:00Z",
          exchange: "MEXC",
          market: "Futures",
          pair: "BTC/USDT",
          side: "buy",
          price: 60000,
          quantity: 0.001,
        },
      ]),
    ],
  );
  reply = async () => response("safe");
  const privacyId = (
    await app.inject({
      method: "POST",
      url: "/api/v1/conversations",
      headers,
      payload: { title: "Private data regression" },
    })
  ).json().id;
  const privacyTurn = (payload: any) =>
    app.inject({
      method: "POST",
      url: `/api/v1/conversations/${privacyId}/turns`,
      headers,
      payload: {
        text: "plain chat without private data",
        mode: "standard",
        ...payload,
      },
    });
  assert.equal((await privacyTurn({ useMyData: false })).statusCode, 200);
  assert.ok(
    !requests.at(-1).instructions.includes("PRIVATE_HISTORY_SENTINEL"),
    "private import must not enter provider context when data toggle is off",
  );
  assert.equal(
    (
      await privacyTurn({
        useMyData: false,
        selection: { importIds: [privateImport] },
      })
    ).statusCode,
    200,
  );
  assert.ok(
    !requests.at(-1).instructions.includes("PRIVATE_HISTORY_SENTINEL"),
    "stale explicit import IDs must not bypass data toggle",
  );
  reply = async () => response("PRIVATE_ASSISTANT_HISTORY");
  assert.equal((await privacyTurn({ useMyData: true })).statusCode, 200);
  assert.ok(
    requests.at(-1).instructions.includes("PRIVATE_HISTORY_SENTINEL"),
    "enabled personal data includes owner history",
  );
  reply = async () => response("safe");
  assert.equal((await privacyTurn({ useMyData: false })).statusCode, 200);
  assert.ok(
    !JSON.stringify(requests.at(-1).input).includes(
      "PRIVATE_ASSISTANT_HISTORY",
    ),
    "turning data off must also exclude prior source-backed personal replies",
  );
  const explicitRule = randomUUID();
  await db.query("INSERT INTO rules(id,owner_id,spec) VALUES($1,$2,$3)", [
    explicitRule,
    owner,
    {
      schemaVersion: 2,
      name: "EXPLICIT_SETUP_SENTINEL",
      exchange: ["Binance"],
      market: "Spot",
      side: "SPOT",
      pairs: ["BTC/USDT"],
      timeframe: "5m",
      entry: {
        kind: "COMPARE",
        op: ">",
        left: { kind: "PRICE", field: "close", timeframe: "5m" },
        right: { kind: "CONSTANT", value: 1 },
      },
      stages: [],
      cooldownBars: 0,
      destinations: [],
    },
  ]);
  assert.equal(
    (
      await privacyTurn({
        useMyData: false,
        selection: { ruleIds: [explicitRule] },
      })
    ).statusCode,
    200,
  );
  assert.ok(
    requests.at(-1).instructions.includes("EXPLICIT_SETUP_SENTINEL"),
    "explicit setup analysis remains available with personal history off",
  );
  assert.ok(!requests.at(-1).instructions.includes("PRIVATE_HISTORY_SENTINEL"));
  console.log(
    "PASS private history requires useMyData even with omitted or stale selection",
  );
  const libraryImage = randomUUID();
  await db.query(
    "INSERT INTO assets(id,owner_id,name,mime,storage_path,metadata,purpose) VALUES($1,$2,'library fixture','image/webp','unused fixture path',$3,'library')",
    [libraryImage, owner, { width: 800, height: 450 }],
  );
  const beforeLibrary = requests.length;
  assert.equal(
    (await privacyTurn({ useMyData: false, imageIds: [libraryImage] }))
      .statusCode,
    404,
  );
  assert.equal(requests.length, beforeLibrary);
  console.log(
    "PASS library image blocked with personal data off before provider call",
  );
  const imageBytes = await sharp({ create: { width: 40, height: 80, channels: 3, background: '#123456' } }).png().toBuffer();
  const imageIds: string[] = [];
  for (let index = 0; index < 5; index++) {
    const boundary = 'fixture-' + randomUUID();
    const upload = await app.inject({
      method: 'POST', url: `/api/v1/images?purpose=chat&conversationId=${id}`,
      headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chart-${index}.png"\r\nContent-Type: image/png\r\n\r\n`),
        imageBytes, Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
    assert.equal(upload.statusCode, 201);
    imageIds.push(upload.json().id);
  }
  reply = async () => response('เห็นภาพทั้งห้าภาพ');
  const fiveImages = await app.inject({
    method: 'POST', url: `/api/v1/conversations/${id}/turns`, headers,
    payload: { text: 'เห็นภาพนี้ไหม', mode: 'standard', imageIds },
  });
  assert.equal(fiveImages.statusCode, 200, fiveImages.body);
  assert.equal(requests.at(-1).input.at(-1).content.filter((item: any) => item.type === 'input_image').length, 5);
  const beforeTooMany = requests.length;
  const sixImages = await app.inject({
    method: 'POST', url: `/api/v1/conversations/${id}/turns`, headers,
    payload: { text: 'six images', mode: 'standard', imageIds: [...imageIds, randomUUID()] },
  });
  assert.equal(sixImages.statusCode, 400);
  assert.equal(requests.length, beforeTooMany);
  const mixedImages = await app.inject({
    method: 'POST', url: `/api/v1/conversations/${id}/turns`, headers,
    payload: { text: 'mixed images', mode: 'standard', imageIds, useMyData: true },
  });
  assert.equal(mixedImages.statusCode, 400);
  assert.equal(mixedImages.json().error.code, 'IMAGE_LIMIT');
  assert.equal(requests.length, beforeTooMany);
  console.log('PASS five uploaded images reach provider; six and mixed overflow rejected without silent truncation');
} finally {
  await app.close();
  await db.end();
  await pg.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
