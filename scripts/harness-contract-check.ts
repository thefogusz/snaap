import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import ccxt from 'ccxt';
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { buildApp, hash } from "../src/api.js";
import { frames, strategySchema } from "../src/domain/engine.js";
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
await migrate(db);
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
  const recoveredImages = await app.inject({ method: 'GET', url: `/api/v1/conversations/${id}/images`, headers });
  assert.equal(recoveredImages.statusCode, 200);
  assert.ok(imageIds.every(imageId => recoveredImages.json().some((image: any) => image.id === imageId)));
  assert.ok(recoveredImages.json().every((image: any) => !('storage_path' in image)));
  const inaccessible = await app.inject({ method: 'GET', url: `/api/v1/conversations/${randomUUID()}/images`, headers });
  assert.equal(inaccessible.statusCode, 404);
  const otherOwner = randomUUID(), otherConversation = randomUUID(), otherWorkspace = randomUUID();
  await db.query('INSERT INTO users(id) VALUES($1)', [otherOwner]);
  await db.query('INSERT INTO conversations(id,owner_id,title) VALUES($1,$2,$3)', [otherConversation, otherOwner, 'Private fixture']);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/conversations/${otherConversation}/images`, headers })).statusCode, 404);
  await db.query('INSERT INTO workspaces(id,owner_id,name) VALUES($1,$2,$3)', [otherWorkspace, owner, 'Separate fixture']);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/conversations/${id}/images`, headers: {...headers, 'x-snaap-workspace': otherWorkspace} })).statusCode, 404);
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
  let providerAttempts = 0;
  reply = async () => ++providerAttempts === 1 ? { error: { code: 503 } } : response('retry recovered');
  assert.equal((await turn('temporary provider failure')).statusCode, 200);
  assert.equal(providerAttempts, 2);
  reply = async () => ({ error: { code: 400, param: 'reasoning', message: 'PRIVATE_PROVIDER_SENTINEL' } });
  const providerFailure = await turn('incompatible provider');
  assert.equal(providerFailure.statusCode, 502);
  const failedRun = (await db.query("SELECT a.trace,u.status FROM agent_runs a JOIN usage_ledger u ON u.id=a.id WHERE a.owner_id=$1 ORDER BY a.created_at DESC LIMIT 1", [owner])).rows[0];
  assert.equal(failedRun.status, 'REFUNDED');
  assert.ok(JSON.stringify(failedRun.trace).includes('reasoning'));
  assert.ok(!JSON.stringify(failedRun.trace).includes('PRIVATE_PROVIDER_SENTINEL'));
  console.log('PASS HTTP 200 provider errors retry only transient failures, preserve diagnostics and refund quota');
  const loadMarkets = ccxt.mexc.prototype.loadMarkets;
  const fetchOHLCV = ccxt.mexc.prototype.fetchOHLCV;
  ccxt.mexc.prototype.loadMarkets = async function () {
    const markets = { 'PHA/USDT:USDT': { symbol: 'PHA/USDT:USDT', active: true, swap: true, linear: true, settle: 'USDT' } };
    this.markets = markets as any;
    return markets as any;
  };
  const fetchedFrames = new Set<string>();
  ccxt.mexc.prototype.fetchOHLCV = async (_symbol, timeframe, since, limit) => {
    fetchedFrames.add(timeframe!);
    const step = frames[timeframe as keyof typeof frames];
    return Array.from({length:limit ?? 300},(_,i) => {
      const time = since! + i * step;
      const close = 100 + (Math.floor(time / step) % 8);
      return [time,close,close+1,close-1,close,10] as [number,number,number,number,number,number];
    }).filter(row => row[0] + step <= Date.now());
  };
  try {
    const spec = {schemaVersion:2,name:'Validated budget fixture',exchange:['MEXC'],market:'Perpetual Futures',side:'LONG',pairs:['PHA/USDT'],timeframe:'5m',
      entry:{kind:'COMPARE',op:'>',left:{kind:'PRICE',field:'close',timeframe:'5m'},right:{kind:'INDICATOR',name:'EMA',period:50,timeframe:'5m'}},stages:[],cooldownBars:0,destinations:[]};
    spec.entry = {kind:'GROUP',op:'AND',children:Array(20).fill(spec.entry)} as any;
    let proposalRequests = 0;
    reply = async () => {
      proposalRequests++;
      if (proposalRequests === 2) return response('สร้างร่างแล้ว ยังไม่ได้เปิดใช้งาน');
      return {...response(''), output:[{type:'function_call',name:'propose_strategy',call_id:'validated-fixture',arguments:JSON.stringify({spec})}], usage:{input_tokens:100000,output_tokens:100}};
    };
    const proposal = await turn('สร้างร่างตามเงื่อนไขที่ระบุ');
    assert.equal(proposal.statusCode, 200, proposal.body);
    assert.deepEqual(proposal.json().draft, spec);
    assert.equal(proposalRequests, 2, 'normal summary still runs after high-cost proposal');
    assert.ok(proposal.json().text.includes('ยังไม่ได้เปิดใช้งาน'));
    reply = async () => ({...response(''), output:[{type:'function_call',name:'propose_strategy',call_id:'invalid-fixture',arguments:JSON.stringify({spec:{...spec,pairs:['UNSUPPORTED/USDT']}})}], usage:{input_tokens:100000,output_tokens:100}});
    const invalid = await turn('สร้างร่างคู่ที่ไม่รองรับ');
    assert.equal(invalid.statusCode, 502);
    assert.equal(invalid.json().error.code, 'AI_UNAVAILABLE');
    assert.equal(invalid.json().draft, undefined);
    proposalRequests = 0;
    reply = async body => {
      assert.equal(body.max_output_tokens,6000);
      return ++proposalRequests === 1
        ? ({...response(''), output:[{type:'function_call',name:'propose_strategy',call_id:'over-cap-fixture',arguments:JSON.stringify({spec})}], usage:{input_tokens:200000,output_tokens:100}})
        : response('สร้างร่างแล้ว ยังไม่ได้เปิดใช้งาน');
    };
    const highCost = await app.inject({method:'POST',url:`/api/v1/conversations/${id}/turns`,headers,payload:{text:'สร้างร่างจากภาพ 4 ใบ แม้ค่าใช้จ่ายเกินเพดานเดิม',mode:'standard',imageIds:imageIds.slice(0,4)}});
    assert.equal(highCost.statusCode,200,highCost.body);
    assert.deepEqual(highCost.json().draft,spec);
    assert.equal(proposalRequests,2);
    const highCostLedger = (await db.query('SELECT status,input_tokens,estimated_usd FROM usage_ledger WHERE id=$1',[highCost.json().runId])).rows[0];
    assert.equal(highCostLedger.status,'COMPLETED');
    assert.ok(Number(highCostLedger.input_tokens)>=200000);
    assert.ok(Number(highCostLedger.estimated_usd)>0.03);
    console.log('PASS high-cost requests complete with full output allowance and cost accounting; invalid proposals still fail');

    const mtf = strategySchema.parse({...spec,name:'Harness MTF chart contract',entry:{kind:'GROUP',op:'AND',children:
      (['4h','1h','15m','5m'] as const).flatMap(timeframe => [
        ...[12,26,50].map(period => ({kind:'COMPARE',op:'>',left:{kind:'PRICE',field:'close',timeframe},right:{kind:'INDICATOR',name:'EMA',period,timeframe}})),
        ...[['>',40],['<',70]].map(([op,value]) => ({kind:'COMPARE',op,left:{kind:'INDICATOR',name:'RSI',period:14,timeframe},right:{kind:'CONSTANT',value}})),
      ])}});
    let round = 0;
    reply = async () => ++round === 1
      ? {...response(''),output:[{type:'function_call',name:'propose_strategy',call_id:'mtf-create',arguments:JSON.stringify({spec:mtf})}]}
      : response('สร้างร่างหลายไทม์เฟรมแล้ว');
    const created = await turn('สร้างร่าง 20 เงื่อนไข แยก 4h 1h 15m 5m');
    assert.equal(created.statusCode,200,created.body);
    assert.deepEqual(created.json().draft,mtf);
    assert.match(requests.at(-1).instructions,/chartFrame is a view-only preview request field/);
    const saved = await app.inject({method:'PUT',url:`/api/v1/conversations/${id}/draft`,headers,payload:{spec:created.json().draft,expectedRevision:0}});
    assert.equal(saved.statusCode,200,saved.body);
    const revision = saved.json().draft_revision;
    const view = async (chartFrame?:string) => {
      const result = await app.inject({method:'POST',url:'/api/v1/preview',headers,payload:{spec:mtf,...(chartFrame?{chartFrame}:{})}});
      assert.equal(result.statusCode,200,result.body);
      return result.json();
    };
    const baseline = await view();
    for (const chartFrame of ['4h','1h','15m','5m']) {
      const chart = await view(chartFrame);
      assert.equal(chart.source.frame,chartFrame);
      assert.equal(chart.source.evaluationFrame,'5m');
      assert.equal(chart.overlays.length,4);
      assert.ok(chart.overlays.every((o:any)=>o.operand.timeframe===chartFrame));
      assert.equal(chart.candles[1].time-chart.candles[0].time,frames[chartFrame as keyof typeof frames]);
      assert.deepEqual(chart.timeline,baseline.timeline);
      assert.deepEqual(chart.events,baseline.events);
    }
    assert.deepEqual([...fetchedFrames].sort(),['15m','1h','4h','5m'].sort());
    const stored = (await db.query('SELECT draft,draft_revision FROM conversations WHERE id=$1',[id])).rows[0];
    assert.deepEqual(stored.draft,mtf);
    assert.equal(stored.draft_revision,revision);

    // A chart-view question must not force the provider to author a new strategy.
    reply = async body => {
      assert.ok(body.tool_choice === undefined || body.tool_choice === 'auto');
      assert.ok(body.instructions.includes(JSON.stringify(mtf)));
      return response('กดปุ่ม 4h เหนือกราฟเพื่อดูเงื่อนไขไทม์เฟรมนี้');
    };
    const viewQuestion = await app.inject({method:'POST',url:`/api/v1/conversations/${id}/turns`,headers,payload:{text:'ดูกราฟ 4h ได้ตรงไหน',mode:'standard',draft:mtf}});
    assert.equal(viewQuestion.statusCode,200,viewQuestion.body);
    assert.equal(viewQuestion.json().draft,null);

    // Replay must continue to use the editable setup's 5m clock after viewing 4h.
    round = 0;
    reply = async body => {
      if (++round === 1) return {...response(''),output:[{type:'function_call',name:'replay_strategy',call_id:'mtf-replay',arguments:JSON.stringify({spec:mtf})}]};
      const replay = JSON.parse(body.input.find((item:any)=>item.type==='function_call_output'&&item.call_id==='mtf-replay').output);
      assert.deepEqual(replay.spec,mtf);
      assert.equal(replay.source.timeframe,'5m');
      assert.equal(replay.coverage.bars,baseline.timeline.length);
      assert.equal(replay.coverage.totalEvents,baseline.events.length);
      assert.deepEqual(replay.events,baseline.events.slice(-20));
      return response('ทดสอบสัญญาณบนร่างเดิมแล้ว');
    };
    const replayed = await app.inject({method:'POST',url:`/api/v1/conversations/${id}/turns`,headers,payload:{text:'ทดสอบย้อนหลังร่างเดิม',mode:'standard',draft:mtf}});
    assert.equal(replayed.statusCode,200,replayed.body);

    const edited = structuredClone(mtf);
    assert.ok(edited.entry.kind==='GROUP');
    const last = edited.entry.children.at(-1)!;
    assert.ok(last.kind==='COMPARE'&&last.right.kind==='CONSTANT');
    last.right.value=65;
    round=0;
    reply = async body => {
      assert.ok(body.instructions.includes(JSON.stringify(mtf)));
      return ++round === 1
        ? {...response(''),output:[{type:'function_call',name:'propose_strategy',call_id:'mtf-edit',arguments:JSON.stringify({spec:edited})}]}
        : response('แก้เฉพาะ RSI 5m เป็น 65 แล้ว');
    };
    const followup = await app.inject({method:'POST',url:`/api/v1/conversations/${id}/turns`,headers,payload:{text:'แก้เฉพาะ RSI 5m จาก <70 เป็น <65',mode:'standard',draft:mtf}});
    assert.equal(followup.statusCode,200,followup.body);
    assert.deepEqual(followup.json().draft,edited);
    assert.equal((await view('4h')).source.evaluationFrame,'5m');

    const rejected = await app.inject({method:'POST',url:'/api/v1/preview',headers,payload:{spec:mtf,chartFrame:'1d'}});
    assert.equal(rejected.statusCode,400);
    assert.equal(rejected.json().error.code,'CHART_FRAME');
    assert.equal(strategySchema.safeParse({...mtf,chartFrame:'4h'}).success,false);
    round=0;
    reply = async body => {
      if (++round === 1) return {...response(''),output:[{type:'function_call',name:'propose_strategy',call_id:'mtf-invalid-view',arguments:JSON.stringify({spec:{...mtf,chartFrame:'4h'}})}]};
      const validation = JSON.parse(body.input.find((item:any)=>item.type==='function_call_output'&&item.call_id==='mtf-invalid-view').output);
      assert.equal(validation.valid,false);
      assert.ok(validation.errors.some((issue:any)=>issue.code==='unrecognized_keys'&&issue.keys.includes('chartFrame')));
      return response('เลือกมุมมองกราฟด้วยปุ่ม 4h ได้ โดยคงร่างเดิมไว้');
    };
    const invalidViewDraft = await app.inject({method:'POST',url:`/api/v1/conversations/${id}/turns`,headers,payload:{text:'ดูกราฟ 4h',mode:'standard',draft:mtf}});
    assert.equal(invalidViewDraft.statusCode,200,invalidViewDraft.body);
    assert.equal(invalidViewDraft.json().draft,null);
    const untouched = (await db.query('SELECT draft,draft_revision FROM conversations WHERE id=$1',[id])).rows[0];
    assert.deepEqual(untouched,stored);
    console.log('PASS Harness creates and edits 20-condition MTF drafts; chart views preserve replay clock, conditions and persisted draft');
  } finally {
    ccxt.mexc.prototype.loadMarkets = loadMarkets;
    ccxt.mexc.prototype.fetchOHLCV = fetchOHLCV;
  }
} finally {
  await app.close();
  await db.end();
  await pg.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
