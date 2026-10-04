import type { FastifyInstance } from "fastify";
import type pg from "pg";
import ccxt from "ccxt";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors.js";
import { seal, unseal } from "./vault.js";
import { transaction } from "./data/db.js";
import { mergeTrades } from "./domain/imports.js";
import { automaticHistory } from "./history-auto.js";
export const historyExchanges = [
  "Binance",
  "Bybit",
  "OKX",
  "Bitget",
  "MEXC",
] as const;
export const historyMarkets = ["Spot", "Futures"] as const;
export type HistoryMarket = (typeof historyMarkets)[number];
export function resolveHistoryMarket(
  markets: Record<string, any>,
  pair: string,
  type: HistoryMarket,
) {
  const matches = (m: any) =>
    m?.active !== false &&
    (type === "Spot" ? m.spot === true : m.swap === true || m.future === true);
  const exact = markets[pair];
  if (exact && matches(exact)) return exact;
  const choices = Object.values(markets).filter(
    (m) => matches(m) && m.symbol.split(":")[0] === pair,
  );
  if (choices.length === 1) return choices[0];
  if (choices.length > 1)
    throw new ApiError(
      400,
      "AMBIGUOUS_INSTRUMENT",
      "พบหลายสัญญา กรุณาระบุคู่พร้อมสกุลชำระราคา เช่น BTC/USDT:USDT",
    );
  throw new ApiError(
    400,
    "UNSUPPORTED_INSTRUMENT",
    `ไม่พบคู่ ${type} นี้ในกระดานที่เชื่อมไว้`,
  );
}
export function normalizeHistoryTrade(
  t: any,
  m: any,
  exchange: string,
  market: HistoryMarket,
) {
  let quantity = t.amount;
  if (market === "Futures") {
    if (
      !Number.isFinite(m.contractSize) ||
      m.contractSize <= 0 ||
      (!m.linear && !m.inverse)
    )
      throw new ApiError(
        502,
        "CONTRACT_METADATA",
        "ข้อมูลขนาดสัญญาไม่พร้อม ยังไม่บันทึกประวัติ",
      );
    quantity = m.inverse
      ? (t.amount * m.contractSize) / t.price
      : t.amount * m.contractSize;
  }
  const nativeSide = String(t.info?.side ?? "");
  const mexcDirection =
    exchange === "MEXC" && market === "Futures"
      ? (
          { "1": "LONG", "2": "SHORT", "3": "SHORT", "4": "LONG" } as Record<
            string,
            string
          >
        )[nativeSide]
      : undefined;
  const explicitSide = String(
    t.info?.positionSide ?? t.info?.posSide ?? "",
  ).toUpperCase();
  const positionSide =
    mexcDirection ??
    (["LONG", "SHORT"].includes(explicitSide) ? explicitSide : undefined);
  return {
    id: String(t.id),
    exchange,
    market,
    time: new Date(t.timestamp).toISOString(),
    pair: m.symbol,
    side: t.side,
    price: t.price,
    quantity,
    ...(market === "Futures"
      ? {
          contracts: t.amount,
          contractSize: m.contractSize,
          settle: m.settle,
          positionSide,
        }
      : {}),
    fee: t.fee?.cost,
    feeCurrency: t.fee?.currency,
  };
}
type Exchange = (typeof historyExchanges)[number];
export function historyConnectionError(error: unknown, exchange?: Exchange) {
  if (error instanceof ApiError) return error;
  if (exchange === "MEXC" && error instanceof Error) {
    // Extract only the provider's numeric code; never return signed URLs or raw errors.
    const code = error.message.match(/"code"\s*:\s*"?(\d{1,8})"?/)?.[1];
    const reasons: Record<string, string> = {
      "700001":
        "รูปแบบ Access Key ไม่ถูกต้อง ตรวจว่าไม่ได้กรอก Secret Key สลับช่อง และ key ยังใช้งานได้",
      "700002":
        "ลายเซ็นคำขอไม่ผ่าน ตรวจว่า Access Key และ Secret Key เป็นคู่เดียวกันจาก key เดียวกัน",
      "700003": "เวลาคำขอไม่ตรงกับ MEXC กรุณาซิงก์เวลาของเครื่องที่รัน Snaap",
      "700005":
        "ช่วงเวลายอมรับคำขอไม่ถูกต้อง กรุณาตรวจการตั้งค่า recvWindow ของตัวเชื่อม",
      "700006":
        "IP ของเครื่องที่รัน Snaap ไม่อยู่ใน whitelist ของ API key บน MEXC",
      "700007":
        "Key ไม่มีสิทธิ์เข้าถึง API นี้ เปิดเฉพาะ View Order Details ของตลาด Spot หรือ Futures ที่เลือก และตรวจ IP whitelist",
      "700008":
        "พารามิเตอร์คำขอมีอักขระที่ MEXC ไม่อนุญาต กรุณาตรวจ Key และการตั้งค่าตัวเชื่อม",
    };
    if (code)
      return new ApiError(
        400,
        "MEXC_" + code,
        `MEXC ${code} · ${reasons[code] ?? "กระดานปฏิเสธคำขอ โปรดตรวจรหัสนี้กับเอกสาร MEXC"}`,
      );
  }
  if (error instanceof ccxt.PermissionDenied)
    return new ApiError(
      400,
      "EXCHANGE_PERMISSION_DENIED",
      "กระดานปฏิเสธสิทธิ์ ตรวจสิทธิ์อ่านข้อมูลและ IP whitelist ให้ตรงกับ IP ของเซิร์ฟเวอร์ Snaap",
    );
  if (error instanceof ccxt.InvalidNonce)
    return new ApiError(
      400,
      "EXCHANGE_TIME_ERROR",
      "เวลาเซิร์ฟเวอร์กับกระดานไม่ตรงกัน กรุณาซิงก์เวลาของเครื่องที่รัน Snaap แล้วลองใหม่",
    );
  if (error instanceof ccxt.AuthenticationError)
    return new ApiError(
      400,
      "EXCHANGE_AUTH_FAILED",
      "กระดานไม่ยอมรับ API key ตรวจว่า Access/API Key และ Secret Key เป็นคู่เดียวกัน ไม่มีช่องว่าง และ key ยังไม่หมดอายุ รวมถึง IP whitelist ของเซิร์ฟเวอร์ Snaap",
    );
  if (error instanceof ccxt.RequestTimeout)
    return new ApiError(
      504,
      "EXCHANGE_TIMEOUT",
      "กระดานตอบกลับไม่ทันเวลา กรุณาลองใหม่และตรวจเครือข่ายของเครื่องที่รัน Snaap",
    );
  if (error instanceof ccxt.RateLimitExceeded)
    return new ApiError(
      429,
      "EXCHANGE_RATE_LIMIT",
      "กระดานจำกัดการเรียก API กรุณารอสักครู่แล้วลองใหม่",
    );
  if (error instanceof ccxt.NetworkError)
    return new ApiError(
      502,
      "EXCHANGE_NETWORK_ERROR",
      "เซิร์ฟเวอร์ Snaap เชื่อมต่อกระดานไม่ได้ ตรวจอินเทอร์เน็ต DNS หรือการบล็อกเครือข่ายแล้วลองใหม่",
    );
  return new ApiError(
    502,
    "VERIFY_FAILED",
    "กระดานไม่สามารถยืนยันสิทธิ์ API key ได้ในขณะนี้ กรุณาลองใหม่ หรือนำเข้าประวัติผ่านไฟล์",
  );
}
export function readonlyPermissions(
  exchange: Exchange,
  data: any,
  market: HistoryMarket = "Spot",
) {
  if (exchange === "OKX")
    return (
      data?.code === "0" &&
      data?.data?.length === 1 &&
      data.data[0]?.perm === "read_only"
    );
  if (exchange === "Bitget")
    return data?.code === "00000" && data?.data?.permType === "read-only";
  if (exchange === "MEXC") {
    if (data?.status !== "VALID" || typeof data.permissions !== "string")
      return false;
    const rights = data.permissions
      .split(",")
      .map((p: string) => p.trim())
      .filter(Boolean);
    const allowed = [
      "SPOT_ACCOUNT_READ",
      "SPOT_DEAL_READ",
      "CONTRACT_ACCOUNT_READ",
      "CONTRACT_DEAL_READ",
      "SPOT_TRANSFER_READ",
    ];
    const required =
      market === "Spot" ? ["SPOT_DEAL_READ"] : ["CONTRACT_DEAL_READ"];
    return (
      required.every((p) => rights.includes(p)) &&
      rights.every((p: string) => allowed.includes(p))
    );
  }
  if (exchange === "Bybit")
    return data?.retCode === 0 && data?.result?.readOnly === 1;
  return (
    data?.enableReading === true &&
    [
      "enableWithdrawals",
      "enableSpotAndMarginTrading",
      "enableFutures",
      "enableMargin",
      "enableVanillaOptions",
      "permitsUniversalTransfer",
      "enableInternalTransfer",
    ].every((key) => data[key] === false) &&
    // Newer Binance responses expose additional write capabilities. Older
    // responses may omit them, but any supplied value must explicitly be false.
    ["enableFixApiTrade", "enablePortfolioMarginTrading"].every(
      (key) => data[key] === undefined || data[key] === false,
    )
  );
}
export function historyClient(
  exchange: Exchange,
  credentials: any,
  market: HistoryMarket = "Spot",
) {
  const Constructor = {
    Binance: ccxt.binance,
    Bybit: ccxt.bybit,
    OKX: ccxt.okx,
    Bitget: ccxt.bitget,
    MEXC: ccxt.mexc,
  }[exchange];
  const api = new Constructor({
    ...credentials,
    enableRateLimit: true,
    timeout: 12000,
    options: {
      defaultType:
        market === "Spot" ? "spot" : exchange === "Binance" ? "future" : "swap",
    },
  }) as any;
  // Currency discovery can call private wallet/account APIs in CCXT.
  // Instrument metadata is enough to normalize fills.
  api.has.fetchCurrencies = false;
  if (exchange === "Binance") {
    api.options.fetchMargins = false;
    api.options.fetchMarkets = {
      types: market === "Spot" ? ["spot"] : ["linear", "inverse"],
    };
  }
  if (exchange === "Bybit")
    api.options.fetchMarkets = {
      types: market === "Spot" ? ["spot"] : ["linear", "inverse"],
    };
  if (exchange === "Bitget") {
    // Infer UTA through order history in verification, never account/settings.
    api.handleUTAAndParams = async (
      params: any,
      methodName: string,
      defaultValue = false,
    ) => {
      const [uta, rest] = api.handleOptionAndParams(params, methodName, "uta");
      return [uta ?? defaultValue, rest];
    };
  }
  protectHistoryTransport(api, exchange);
  return api;
}
const guardedHistoryClients = new WeakSet<object>();
const historyReadPaths: Record<Exchange, { hosts: string[]; paths: string[] }> =
  {
    Binance: {
      hosts: [
        "api.binance.com",
        "api1.binance.com",
        "api2.binance.com",
        "api3.binance.com",
        "api4.binance.com",
        "fapi.binance.com",
        "dapi.binance.com",
      ],
      paths: [
        "/api/v3/exchangeInfo",
        "/api/v3/time",
        "/fapi/v1/exchangeInfo",
        "/fapi/v1/time",
        "/dapi/v1/exchangeInfo",
        "/dapi/v1/time",
        "/sapi/v1/account/apiRestrictions",
        "/api/v3/myTrades",
        "/fapi/v1/userTrades",
        "/dapi/v1/userTrades",
      ],
    },
    Bybit: {
      hosts: ["api.bybit.com", "api.bytick.com"],
      paths: [
        "/v5/market/time",
        "/v5/market/instruments-info",
        "/v5/user/query-api",
        "/v5/execution/list",
      ],
    },
    OKX: {
      hosts: ["www.okx.com", "us.okx.com", "eea.okx.com"],
      paths: [
        "/api/v5/public/time",
        "/api/v5/public/instruments",
        "/api/v5/account/config",
        "/api/v5/trade/fills-history",
      ],
    },
    Bitget: {
      hosts: ["api.bitget.com"],
      paths: [
        "/api/v2/public/time",
        "/api/v2/spot/public/symbols",
        "/api/v2/mix/market/contracts",
        "/api/v2/margin/currencies",
        "/api/v3/market/instruments",
        "/api/v3/account/info",
        "/api/v3/trade/fills",
        "/api/v2/spot/trade/fills",
        "/api/v2/mix/order/fills",
      ],
    },
    MEXC: {
      hosts: ["api.mexc.com"],
      paths: [
        "/api/v3/exchangeInfo",
        "/api/v3/time",
        "/api/v1/contract/detail",
        "/api/v3/myTrades",
        "/api/v1/private/order/list/history_orders",
        "/api/v1/private/order/list/order_deals",
      ],
    },
  };
export function protectHistoryTransport(api: any, exchange: Exchange) {
  if (guardedHistoryClients.has(api)) return;
  const transport = api.fetch.bind(api),
    allowed = historyReadPaths[exchange];
  api.fetch = async (url: string, method = "GET", ...args: any[]) => {
    const target = new URL(url);
    if (
      method !== "GET" ||
      target.protocol !== "https:" ||
      target.port ||
      target.username ||
      target.password ||
      !allowed.hosts.includes(target.hostname) ||
      !allowed.paths.includes(target.pathname)
    )
      throw new ApiError(
        403,
        "HISTORY_READ_ONLY",
        "ตัวเชื่อมประวัติอ่านได้เฉพาะสิทธิ์คีย์ ข้อมูลคู่เทรด และรายการซื้อขาย ไม่อ่านยอดบัญชีหรือสินทรัพย์",
      );
    return transport(url, method, ...args);
  };
  guardedHistoryClients.add(api);
}
export function protectMexcFuturesHistory(api: any) {
  protectHistoryTransport(api, "MEXC");
}
async function verifyBitgetOrderRead(api: any, market: HistoryMarket) {
  // UTA detection via read-only fills avoids the broader UTA management scope.
  const category = market === "Spot" ? "SPOT" : "USDT-FUTURES";
  try {
    const response = await api.privateUtaGetV3TradeFills({
      category,
      limit: 1,
    });
    if (response?.code !== "00000" || !Array.isArray(response.data?.list))
      throw new ApiError(
        502,
        "HISTORY_RESPONSE",
        "Bitget ส่งข้อมูลประวัติไม่ครบ",
      );
    api.options.uta = true;
  } catch (utaError) {
    // A classic account may not expose the UTA route. Require a successful
    // classic order-history response before choosing that route.
    try {
      const response =
        market === "Spot"
          ? await api.privateSpotGetV2SpotTradeFills({
              symbol: "BTCUSDT",
              limit: 1,
            })
          : await api.privateMixGetV2MixOrderFills({
              symbol: "BTCUSDT",
              productType: "USDT-FUTURES",
              limit: 1,
            });
      const rows =
        market === "Spot" ? response?.data : response?.data?.fillList;
      if (response?.code !== "00000" || !Array.isArray(rows)) throw utaError;
      api.options.uta = false;
    } catch {
      throw utaError;
    }
  }
}
export async function verifyHistoryPermissions(
  exchange: Exchange,
  api: any,
  market: HistoryMarket = "Spot",
) {
  protectHistoryTransport(api, exchange);
  if (exchange === "MEXC") {
    if (market === "Futures") {
      const orders = await api.contractPrivateGetOrderListHistoryOrders({
        page_num: 1,
        page_size: 1,
      });
      if (
        orders?.success !== true ||
        Number(orders.code) !== 0 ||
        !Array.isArray(orders.data)
      )
        throw new ApiError(
          400,
          "MEXC_READ_ACCESS_REQUIRED",
          "MEXC ยังยืนยันสิทธิ์ View Order Details ของ Futures ไม่สำเร็จ",
        );
    } else {
      const trades = await api.spotPrivateGetMyTrades({
        symbol: "BTCUSDT",
        limit: 1,
      });
      if (!Array.isArray(trades))
        throw new ApiError(
          400,
          "MEXC_READ_ACCESS_REQUIRED",
          "MEXC ยังยืนยันสิทธิ์ View Order Details ของ Spot ไม่สำเร็จ",
        );
    }
    return "READ_ACCESS_VERIFIED" as const;
  }
  const data = await {
    Binance: () => api.sapiGetAccountApiRestrictions(),
    Bybit: () => api.privateGetV5UserQueryApi(),
    OKX: () => api.privateGetAccountConfig(),
    Bitget: () => api.privateUtaGetV3AccountInfo(),
    MEXC: () =>
      Promise.reject(
        new ApiError(
          400,
          "UNSUPPORTED_VERIFICATION",
          "ใช้การตรวจประวัติโดยตรง",
        ),
      ),
  }[exchange]();
  if (!readonlyPermissions(exchange, data, market))
    throw new ApiError(
      400,
      "READ_ONLY_REQUIRED",
      "ไม่สามารถยืนยันว่า API key มีสิทธิ์อ่านอย่างเดียว เลือก Read-only และสิทธิ์อ่านประวัติของตลาดที่เลือก โดยไม่เปิด Trade, Withdraw หรือ Transfer",
    );
  if (exchange === "Bitget") await verifyBitgetOrderRead(api, market);
  return "KEY_READ_ONLY_VERIFIED" as const;
}
export async function fetchHistoryTrades(
  api: any,
  exchange: Exchange,
  market: any,
  from: number,
  until: number,
) {
  const params: Record<string, unknown> =
    exchange === "MEXC" && !market.spot ? { end_time: until } : { until };
  if (exchange === "Bybit")
    params.category = market.spot
      ? "spot"
      : market.linear
        ? "linear"
        : "inverse";
  if (exchange === "Bitget") {
    // CCXT detects classic/UTA accounts. Its UTA fills branch does not add
    // symbol/category itself, so constrain the request before page limiting.
    const [uta] = await api.handleUTAAndParams({}, "fetchMyTrades", false);
    params.uta = uta;
    if (uta) {
      params.symbol = market.id;
      params.category = market.spot
        ? "SPOT"
        : market.inverse
          ? "COIN-FUTURES"
          : market.settle === "USDC"
            ? "USDC-FUTURES"
            : "USDT-FUTURES";
    }
  }
  return api.fetchMyTrades(market.symbol, from, 100, params);
}
export function validHistoryTrades(
  trades: any[],
  market: any,
  from: number,
  until: number,
) {
  return trades.filter(
    (t) =>
      t.id &&
      t.symbol === market.symbol &&
      Number.isFinite(t.timestamp) &&
      t.timestamp >= from &&
      t.timestamp <= until &&
      Number.isFinite(t.price) &&
      t.price > 0 &&
      Number.isFinite(t.amount) &&
      t.amount > 0 &&
      ["buy", "sell"].includes(t.side),
  );
}
export function registerHistory(
  app: FastifyInstance,
  db: pg.Pool,
  makeClient = historyClient,
) {
  const automatic = automaticHistory(app, db, {
    client: makeClient,
    verify: verifyHistoryPermissions,
    fetch: fetchHistoryTrades,
    valid: validHistoryTrades,
    normalize: normalizeHistoryTrade,
    error: historyConnectionError,
  });
  app.get("/api/v1/connections", async (req) => {
    await automatic.enable(req.userId);
    return {
      enabled: /^[a-f0-9]{64}$/i.test(process.env.DATA_ENCRYPTION_KEY ?? ""),
      supported: historyExchanges,
      markets: historyMarkets,
      items: (
        await db.query(
          "SELECT id,exchange,market,name,verified_at,last_sync,status,sync_details FROM exchange_connections WHERE owner_id=$1 AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM data_scopes s WHERE s.resource_id=exchange_connections.id AND s.owner_id=$1 AND s.kind='connection' AND s.workspace_ids IS NOT NULL AND NOT ($2=ANY(s.workspace_ids))))",
          [req.userId, req.workspaceId ?? null],
        )
      ).rows,
    };
  });
  app.post("/api/v1/connections/:id/auto-sync", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const found = await db.query(
      "SELECT id FROM exchange_connections WHERE id=$1 AND owner_id=$2",
      [id, req.userId],
    );
    if (!found.rowCount)
      throw new ApiError(404, "NOT_FOUND", "ไม่พบการเชื่อมต่อ");
    await automatic.retry(req.userId, id);
    return { queued: true };
  });
  app.post("/api/v1/connections", async (req, reply) => {
    if (!/^[a-f0-9]{64}$/i.test(process.env.DATA_ENCRYPTION_KEY ?? ""))
      throw new ApiError(
        503,
        "NOT_CONFIGURED",
        "ยังไม่ตั้งค่าที่เก็บ API key เข้ารหัส",
      );
    const input = z
      .object({
        exchange: z.enum(historyExchanges),
        market: z.enum(historyMarkets).default("Spot"),
        name: z.string().trim().min(1).max(80),
        privacyConsent: z.literal("trade-history-v1"),
        apiKey: z.string().trim().min(8).max(200),
        secret: z.string().trim().min(8).max(200),
        passphrase: z.string().min(1).max(200).optional(),
      })
      .strict()
      .parse(req.body);
    if (["OKX", "Bitget"].includes(input.exchange) && !input.passphrase)
      throw new ApiError(
        400,
        "PASSPHRASE_REQUIRED",
        "กรอก Passphrase ที่ตั้งไว้ตอนสร้าง API key",
      );
    const credentials = {
        apiKey: input.apiKey,
        secret: input.secret,
        ...(["OKX", "Bitget"].includes(input.exchange)
          ? { password: input.passphrase }
          : {}),
      },
      api = makeClient(input.exchange, credentials, input.market);
    try {
      await verifyHistoryPermissions(input.exchange, api, input.market);
    } catch (error) {
      throw historyConnectionError(error, input.exchange);
    } finally {
      await api.close();
    }
    const id = randomUUID();
    await db.query(
      "INSERT INTO exchange_connections(id,owner_id,exchange,name,credentials,market,verified_at,status,privacy_consent_version,privacy_consented_at) VALUES($1,$2,$3,$4,$5,$6,now(),'VERIFIED',$7,now())",
      [
        id,
        req.userId,
        input.exchange,
        input.name,
        seal(credentials, req.userId + ":" + id),
        input.market,
        input.privacyConsent,
      ],
    );
    await automatic.enable(req.userId, id);
    return reply.code(201).send({ id, market: input.market });
  });
  app.delete("/api/v1/connections/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await db.query(
      "DELETE FROM exchange_connections WHERE id=$1 AND owner_id=$2",
      [id, req.userId],
    );
    return { ok: true };
  });
  app.post("/api/v1/connections/:id/sync", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const input = z
      .object({
        pair: z
          .string()
          .regex(
            /^[A-Z0-9][A-Z0-9._-]{0,39}\/[A-Z0-9][A-Z0-9._-]{0,19}(?::[A-Z0-9._-]{1,30})?$/,
          ),
        from: z
          .string()
          .datetime()
          .refine(
            (v) => Date.parse(v) <= Date.now(),
            "วันเริ่มต้นต้องไม่อยู่ในอนาคต",
          ),
      })
      .strict()
      .parse(req.body);
    const row = (
      await db.query(
        "SELECT * FROM exchange_connections WHERE id=$1 AND owner_id=$2",
        [id, req.userId],
      )
    ).rows[0];
    if (!row) throw new ApiError(404, "NOT_FOUND", "ไม่พบบัญชี");
    const api = makeClient(
      row.exchange,
      unseal(row.credentials, req.userId + ":" + id),
      row.market,
    );
    try {
      await verifyHistoryPermissions(row.exchange, api, row.market);
      await api.loadMarkets();
      const market = resolveHistoryMarket(api.markets, input.pair, row.market);
      const until = Math.min(Date.now(), Date.parse(input.from) + 7 * 86400000);
      const from = Date.parse(input.from);
      const trades = await fetchHistoryTrades(
        api,
        row.exchange,
        market,
        from,
        until,
      );
      // A single bounded page is explicitly partial, not silently treated as complete account history.
      const rows = validHistoryTrades(trades, market, from, until).map(
        (t: any) => normalizeHistoryTrade(t, market, row.exchange, row.market),
      );
      const result = await transaction(db, async (c) => {
        await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
          req.userId,
        ]);
        const connected = await c.query(
          "SELECT id FROM exchange_connections WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [id, req.userId],
        );
        if (!connected.rowCount)
          throw new ApiError(
            409,
            "DISCONNECTED",
            "บัญชีนี้ถูกยกเลิกการเชื่อมต่อแล้ว",
          );
        const existing = (
          await c.query(
            "SELECT rows FROM imports WHERE owner_id=$1 AND account_scope=$2",
            [req.userId, id],
          )
        ).rows.flatMap((x) => x.rows);
        const merged = mergeTrades(existing, rows);
        const importId = randomUUID();
        await c.query(
          "INSERT INTO imports(id,owner_id,name,rows,account_scope) VALUES($1,$2,$3,$4,$5)",
          [
            importId,
            req.userId,
            row.name + " · " + row.market + " API",
            JSON.stringify(merged.rows),
            id,
          ],
        );
        await c.query(
          "INSERT INTO data_scopes(owner_id,kind,resource_id,workspace_ids) SELECT owner_id,'import',$3,workspace_ids FROM data_scopes WHERE owner_id=$1 AND kind='connection' AND resource_id=$2",
          [req.userId, id, importId],
        );
        await c.query(
          "UPDATE exchange_connections SET last_sync=now(),status='PARTIAL_SYNC',verified_at=now() WHERE id=$1",
          [id],
        );
        return { inserted: merged.rows.length, duplicates: merged.duplicates };
      });
      return {
        ...result,
        partial: true,
        limit: 100,
        source: {
          exchange: row.exchange,
          market: row.market,
          pair: market.symbol,
          from: input.from,
          to: new Date(until).toISOString(),
          syncedAt: new Date().toISOString(),
        },
        nextFrom: rows.at(-1)?.time ?? null,
      };
    } catch (error) {
      await db.query(
        "UPDATE exchange_connections SET status='SYNC_FAILED' WHERE id=$1",
        [id],
      );
      if (error instanceof ApiError) throw error;
      throw historyConnectionError(error, row.exchange);
    } finally {
      await api.close();
    }
  });
}
