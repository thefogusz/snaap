import Fastify from "fastify";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { localDatabase } from "./postgres.js";
import { database, migrate } from "../src/data/db.js";
import { registerHistory, historyExchanges } from "../src/history.js";
import { unseal } from "../src/vault.js";
const postgres = await localDatabase(),
  db = database(postgres.url);
await migrate(db);
const owner = randomUUID(),
  other = randomUUID(),
  previousKey = process.env.DATA_ENCRYPTION_KEY;
process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
let deny = false,
  fail = false,
  closed = 0;
let fillTime=Date.now()-1000;
const client = (exchange: string, credentials: any, market = "Spot") => ({
  apiKey: credentials.apiKey,
  options:{},
  fetch:async()=>{throw new Error('Unexpected real transport in history fixture');},
  handleUTAAndParams:async()=>[true,{}],
  spotPrivateGetMyTrades:async()=>deny ? {error:'read access denied'} : [],
  contractPrivateGetOrderListHistoryOrders:async()=>({success:!deny,code:deny?703:0,data:[]}),
  privateUtaGetV3TradeFills:async()=>({code:'00000',data:{list:[]}}),
  sapiGetAccountApiRestrictions: async () => ({
    enableReading: true,
    enableWithdrawals: deny,
    enableSpotAndMarginTrading: false,
    enableFutures: false,
    enableMargin: false,
    enableVanillaOptions: false,
    permitsUniversalTransfer: false,
    enableInternalTransfer: false,
  }),
  privateGetV5UserQueryApi: async () => ({
    retCode: 0,
    result: { readOnly: deny ? 0 : 1 },
  }),
  spotPrivateGetApiKeyInfo: async (p: any) => {
    assert.equal(p.accessKey, credentials.apiKey);
    return {
      status: "VALID",
      permissions: deny
        ? "SPOT_ACCOUNT_READ,SPOT_DEAL_WRITE"
        : market === "Spot"
          ? "SPOT_ACCOUNT_READ,SPOT_DEAL_READ"
          : "CONTRACT_ACCOUNT_READ,CONTRACT_DEAL_READ",
    };
  },
  privateGetAccountConfig: async () => ({
    code: "0",
    data: [{ perm: deny ? "read_only,trade" : "read_only" }],
  }),
  privateUtaGetV3AccountInfo: async () => ({
    code: "00000",
    data: { permType: deny ? "read-and-write" : "read-only" },
  }),
  loadMarkets: async () => {},
  markets: {
    "BTC/USDT": { id:'BTCUSDT',symbol: "BTC/USDT", spot: true, active: true },
    "BTC/USDT:USDT": {
      symbol: "BTC/USDT:USDT",
      id:'BTCUSDT',
      swap: true,
      linear: true,
      contractSize: 0.01,
      settle: "USDT",
      active: true,
    },
  },
  fetchMyTrades: async (pair: string, from: number, limit: number) => {
    assert.equal(pair, market === "Spot" ? "BTC/USDT" : "BTC/USDT:USDT");
    assert.equal(limit, 100);
    assert.ok(Number.isFinite(from));
    if (fail) throw new Error("test timeout");
    return [
      {
        id: "fill-1",
        symbol:pair,
        timestamp: fillTime,
        price: 100,
        amount: 2,
        side: "buy",
        fee: { cost: 0.1, currency: "USDT" },
      },
    ];
  },
  close: async () => {
    closed++;
  },
});
const app = Fastify();
app.addHook("onRequest", async (req) => {
  req.userId = req.headers["x-test-owner"] === other ? other : owner;
});
registerHistory(app, db, client as any);
try {
  await db.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
  assert.deepEqual(
    (await app.inject("/api/v1/connections")).json().supported,
    historyExchanges,
  );
  for (const exchange of historyExchanges)
    for (const market of ["Spot", "Futures"]) {
      fillTime=Date.now()-1000;
      const payload = {
        exchange,
        market,
        privacyConsent: 'trade-history-v1',
        name: exchange + " " + market + " fixture",
        apiKey: "test-api-key",
        secret: "test-api-secret",
        ...(["OKX", "Bitget"].includes(exchange)
          ? { passphrase: "test-passphrase" }
          : {}),
      };
      if (["OKX", "Bitget"].includes(exchange)) {
        const missing = { ...payload };
        delete missing.passphrase;
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/api/v1/connections",
              payload: missing,
            })
          ).statusCode,
          400,
        );
      }
      deny = true;
      const deniedConnection=await app.inject({method:'POST',url:'/api/v1/connections',payload});
      assert.equal(deniedConnection.statusCode,400,exchange+' '+market+' '+deniedConnection.body);
      deny = false;
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/connections",
        payload,
      });
      assert.equal(created.statusCode, 201, created.body);
      const { id } = created.json();
      const saved = (
        await db.query(
          "SELECT credentials FROM exchange_connections WHERE id=$1",
          [id],
        )
      ).rows[0].credentials;
      assert.ok(!saved.includes("test-api-secret"));
      assert.equal(
        unseal(saved, owner + ":" + id).password,
        ["OKX", "Bitget"].includes(exchange) ? "test-passphrase" : undefined,
      );
      const sync = () =>
        app.inject({
          method: "POST",
          url: `/api/v1/connections/${id}/sync`,
          payload: {
            pair: "BTC/USDT",
            from: new Date(Date.now() - 86400000).toISOString(),
          },
        });
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/connections/${id}/sync`,
            headers: { "x-test-owner": other },
            payload: { pair: "BTC/USDT", from: new Date().toISOString() },
          })
        ).statusCode,
        404,
      );
      let response = await sync();
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().inserted+response.json().duplicates, 1);
      assert.equal(response.json().partial, true);
      response = await sync();
      assert.equal(response.json().inserted, 0);
      assert.equal(response.json().duplicates, 1);
      fail = true;
      assert.equal((await sync()).statusCode, 502);
      fail = false;
      deny = true;
      assert.equal((await sync()).statusCode, 400);
      deny = false;
      const imported = (
        await db.query(
          "SELECT rows FROM imports WHERE owner_id=$1 AND account_scope=$2",
          [owner, id],
        )
      ).rows.flatMap((r) => r.rows);
      assert.equal(imported.length, 1);
      assert.equal(imported[0].exchange, exchange);
      assert.equal(imported[0].fee, 0.1);
      assert.equal(imported[0].market, market);
      assert.equal(imported[0].quantity, market === "Spot" ? 2 : 0.02);
      assert.equal(
        (
          await db.query(
            "SELECT market FROM exchange_connections WHERE id=$1",
            [id],
          )
        ).rows[0].market,
        market,
      );
      await app.inject({ method: "DELETE", url: `/api/v1/connections/${id}` });
      assert.equal((await sync()).statusCode, 404);
    }
  assert.ok(closed >= 15);
  console.log(
    "PASS: All five exchanges × Spot/Futures connect, encrypted passphrase, permission rejection, ownership, sync, deduplication, failure preservation and revocation (exchange responses mocked, real PostgreSQL)",
  );
} finally {
  await app.close();
  await db.query("DELETE FROM imports WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM exchange_connections WHERE owner_id=$1", [owner]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
    [owner, other],
  ]);
  await db.end();
  await postgres.stop();
  if (previousKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = previousKey;
}
