import { z } from "zod";
import { readPublicText, type PublicRPCRead } from "./research-evidence.js";

const segment = z.string().regex(/^[a-z0-9-]{1,40}$/);
const address = z.string().regex(/^[A-Za-z0-9]{20,100}$/);
const dollars = z.number().finite().nonnegative();
const price = z
  .string()
  .max(100)
  .regex(/^\d+(?:\.\d+)?$/)
  .transform(Number)
  .pipe(dollars);
export const dexQuerySchema = z
  .object({
    mode: z.enum(["search", "token"]),
    query: z.string().trim().max(80),
    chain: segment.nullable(),
    tokenAddress: address.nullable(),
    sort: z.enum(["volume", "liquidity", "gainers", "losers"]),
    limit: z.number().int().min(1).max(20),
    minLiquidityUSD: dollars,
  })
  .strict();
const token = z.object({
  address,
  name: z.string().max(200),
  symbol: z.string().max(80),
});
const pair = z.object({
  chainId: segment,
  dexId: segment,
  pairAddress: address,
  baseToken: token,
  quoteToken: token,
  priceUsd: price.nullish(),
  volume: z.object({ h24: dollars.nullish() }).nullish(),
  liquidity: z.object({ usd: dollars.nullish() }).nullish(),
  priceChange: z.object({ h24: z.number().finite().nullish() }).nullish(),
  pairCreatedAt: z.number().int().positive().nullish(),
});

export async function readDexPools(raw: unknown, read = readPublicText) {
  const q = dexQuerySchema.parse(raw);
  if (
    (q.mode === "token" && (!q.chain || !q.tokenAddress)) ||
    (q.mode === "search" && !q.query)
  )
    throw new Error("DEX search or exact chain/token required");
  const url =
    q.mode === "token"
      ? `https://api.dexscreener.com/token-pairs/v1/${q.chain}/${q.tokenAddress}`
      : `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q.query)}`;
  const response = JSON.parse(await read(url, 60000));
  const rows = z
    .array(z.unknown())
    .max(500)
    .parse(
      q.mode === "token"
        ? response
        : (z.object({ pairs: z.array(z.unknown()).nullable() }).parse(response)
            .pairs ?? []),
    );
  let excludedRecords = 0;
  const items = rows.flatMap((raw) => {
    const result = pair.safeParse(raw);
    if (!result.success) {
      excludedRecords++;
      return [];
    }
    const p = result.data;
    if (q.chain && q.chain !== p.chainId) return [];
    const sameAddress = (a: string, b: string) =>
      a.startsWith("0x") && b.startsWith("0x")
        ? a.toLowerCase() === b.toLowerCase()
        : a === b;
    if (
      q.mode === "token" &&
      !sameAddress(p.baseToken.address, q.tokenAddress!) &&
      !sameAddress(p.quoteToken.address, q.tokenAddress!)
    )
      return [];
    const value =
      q.sort === "volume"
        ? p.volume?.h24
        : q.sort === "liquidity"
          ? p.liquidity?.usd
          : p.priceChange?.h24;
    if (
      value == null ||
      (q.minLiquidityUSD > 0 && (p.liquidity?.usd ?? -1) < q.minLiquidityUSD)
    ) {
      excludedRecords++;
      return [];
    }
    return [
      {
        chain: p.chainId,
        dex: p.dexId,
        pairAddress: p.pairAddress,
        baseToken: p.baseToken,
        quoteToken: p.quoteToken,
        priceUSD: p.priceUsd ?? null,
        volume24hUSD: p.volume?.h24 ?? null,
        liquidityUSD: p.liquidity?.usd ?? null,
        change24hPercent: p.priceChange?.h24 ?? null,
        poolCreatedAt:
          p.pairCreatedAt && p.pairCreatedAt <= Date.now()
            ? new Date(p.pairCreatedAt).toISOString()
            : null,
        memeClassification: "UNKNOWN",
        signalSupported: false,
        url: `https://dexscreener.com/${p.chainId}/${p.pairAddress}`,
        rankValue: value,
      },
    ];
  });
  const ranked = [
    ...new Map(items.map((p) => [p.chain + ":" + p.pairAddress, p])).values(),
  ].sort((a, b) =>
    q.sort === "losers" ? a.rankValue - b.rankValue : b.rankValue - a.rankValue,
  );
  return {
    source: "DEX Screener",
    asOf: new Date().toISOString(),
    timeBasis:
      "REQUEST_TIME; underlying response may be cached, source timestamp unavailable",
    providerTime: null,
    cacheMaxAgeSeconds: 60,
    criteria: q,
    returnedPools: rows.length,
    excludedRecords,
    scope:
      "Ranks returned pools only, not all DEX tokens. Search symbols/names do not verify token identity or meme taxonomy. Chain and contract addresses establish identity; do not sum duplicate pools or mix with CEX USDT turnover. Boosts are not trading volume. Pool creation is not token birth. Source timestamps absent; retrieval is not freshness proof. DEX pools are research only, not supported Snaap signal targets.",
    items: ranked.slice(0, q.limit).map(({ rankValue, ...item }) => item),
  };
}

export const defiQuerySchema = z
  .object({
    protocolSlug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,79}$/)
      .nullable(),
    limit: z.number().int().min(1).max(20),
  })
  .strict();
export async function readDefiContext(raw: unknown, read = readPublicText) {
  const q = defiQuerySchema.parse(raw),
    url = q.protocolSlug
      ? "https://api.llama.fi/tvl/" + q.protocolSlug
      : "https://api.llama.fi/v2/chains";
  const response = JSON.parse(await read(url, 600000));
  let excludedRecords = 0;
  const items = q.protocolSlug
    ? [
        {
          name: q.protocolSlug,
          tvlUSD: dollars.parse(response),
          url: "https://defillama.com/protocol/" + q.protocolSlug,
        },
      ]
    : z
        .array(z.unknown())
        .max(2000)
        .parse(response)
        .flatMap((row) => {
          const result = z
            .object({ name: z.string().min(1).max(100), tvl: dollars })
            .safeParse(row);
          if (!result.success) {
            excludedRecords++;
            return [];
          }
          return [
            {
              name: result.data.name,
              tvlUSD: result.data.tvl,
              url:
                "https://defillama.com/chain/" +
                encodeURIComponent(result.data.name),
            },
          ];
        })
        .sort((a, b) => b.tvlUSD - a.tvlUSD)
        .slice(0, q.limit);
  return {
    source: "DefiLlama Free API",
    asOf: new Date().toISOString(),
    timeBasis:
      "REQUEST_TIME; underlying response may be cached, source timestamp unavailable",
    providerTime: null,
    cacheMaxAgeSeconds: 600,
    excludedRecords,
    scope:
      "Reported TVL in USD, not inflows, net token purchases or whale ownership. Value can change with prices and methodology. No historical trend from a single snapshot; no Pro endpoints or investment safety claims.",
    items,
  };
}

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  quantity = z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,15})$/);
const networks = {
  ethereum: {
    id: 1,
    rpc: "https://ethereum-rpc.publicnode.com/",
    source: "PublicNode",
    explorer: "https://etherscan.io",
  },
  base: {
    id: 8453,
    rpc: "https://mainnet.base.org/",
    source: "Base public RPC",
    explorer: "https://basescan.org",
  },
  arbitrum: {
    id: 42161,
    rpc: "https://arb1.arbitrum.io/rpc",
    source: "Arbitrum public RPC",
    explorer: "https://arbiscan.io",
  },
};
export const evmQuerySchema = z
  .object({
    chain: z.enum(["ethereum", "base", "arbitrum"]),
    contractAddress: evmAddress,
    walletAddress: evmAddress.nullable(),
    blocks: z.number().int().min(1).max(200),
    limit: z.number().int().min(1).max(20),
    minRawAmount: z.string().regex(/^\d{1,78}$/),
  })
  .strict();
const transferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
async function publicRPC(
  chain: keyof typeof networks,
  method: PublicRPCRead["method"],
  params: unknown[],
): Promise<unknown> {
  const packet = JSON.parse(
    await readPublicText(
      networks[chain].rpc,
      method === "eth_chainId" ? 3600000 : 60000,
      { method, params },
    ),
  );
  return packet.result;
}
const rpcInteger = (raw: unknown) => {
  const value = Number(BigInt(quantity.parse(raw)));
  if (!Number.isSafeInteger(value)) throw new Error("Invalid RPC integer");
  return value;
};
const hexBlock = (n: number) => "0x" + n.toString(16);
const amountText = (raw: bigint, decimals: number) => {
  const text = raw.toString().padStart(decimals + 1, "0");
  return decimals
    ? text.slice(0, -decimals) + "." + text.slice(-decimals)
    : text;
};
const event = z.object({
  address: evmAddress,
  topics: z.array(hash).length(3),
  data: hash,
  blockNumber: quantity,
  blockHash: hash,
  transactionHash: hash,
  logIndex: quantity,
  removed: z.boolean(),
});
export async function readEvmTransfers(raw: unknown, rpc = publicRPC) {
  const q = evmQuerySchema.parse(raw),
    network = networks[q.chain],
    contract = q.contractAddress.toLowerCase(),
    wallet = q.walletAddress?.toLowerCase() ?? null,
    minimum = BigInt(q.minRawAmount);
  if (minimum > 2n ** 256n - 1n) throw new Error("Invalid token threshold");
  if (rpcInteger(await rpc(q.chain, "eth_chainId", [])) !== network.id)
    throw new Error("Wrong RPC chain");
  const block = z
    .object({ number: quantity, hash, timestamp: quantity })
    .parse(await rpc(q.chain, "eth_getBlockByNumber", ["finalized", false]));
  const end = rpcInteger(block.number),
    start = Math.max(0, end - q.blocks + 1),
    blockTime = rpcInteger(block.timestamp) * 1000;
  if (blockTime > Date.now() + 5000) throw new Error("Future finalized block");
  const walletTopic = wallet ? "0x" + wallet.slice(2).padStart(64, "0") : null;
  const filters = walletTopic
    ? [
        [transferTopic, walletTopic],
        [transferTopic, null, walletTopic],
      ]
    : [[transferTopic]];
  const [decimalsResult, ...responses] = await Promise.all([
    rpc(q.chain, "eth_call", [
      { to: contract, data: "0x313ce567" },
      block.number,
    ]).catch(() => null),
    ...filters.map((topics) =>
      rpc(q.chain, "eth_getLogs", [
        {
          address: contract,
          fromBlock: hexBlock(start),
          toBlock: block.number,
          topics,
        },
      ]),
    ),
  ]);
  let decimals: number | null = null;
  if (
    typeof decimalsResult === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(decimalsResult)
  ) {
    const d = Number(BigInt(decimalsResult));
    if (d <= 255) decimals = d;
  }
  const rows = responses.flatMap((r) =>
      z.array(z.unknown()).max(10000).parse(r),
    ),
    unique = new Map<
      string,
      {
        txid: string;
        blockHash: string;
        blockNumber: number;
        logIndex: number;
        from: string;
        to: string;
        amountRaw: string;
        amountTokens: string | null;
        timestamp: null;
        url: string;
      }
    >();
  let excludedRecords = 0;
  for (const row of rows) {
    const checked = event.safeParse(row);
    if (!checked.success) {
      excludedRecords++;
      continue;
    }
    const e = checked.data,
      n = rpcInteger(e.blockNumber);
    if (
      e.removed ||
      e.address.toLowerCase() !== contract ||
      e.topics[0].toLowerCase() !== transferTopic ||
      n < start ||
      n > end ||
      (n === end && e.blockHash.toLowerCase() !== block.hash.toLowerCase()) ||
      !e.topics.slice(1).every((t) => /^0x0{24}[0-9a-fA-F]{40}$/.test(t))
    ) {
      excludedRecords++;
      continue;
    }
    const from = "0x" + e.topics[1].slice(-40).toLowerCase(),
      to = "0x" + e.topics[2].slice(-40).toLowerCase();
    if (wallet && from !== wallet && to !== wallet) {
      excludedRecords++;
      continue;
    }
    const amount = BigInt(e.data),
      index = rpcInteger(e.logIndex);
    unique.set(e.blockHash.toLowerCase() + ":" + index, {
      txid: e.transactionHash,
      blockHash: e.blockHash,
      blockNumber: n,
      logIndex: index,
      from,
      to,
      amountRaw: amount.toString(),
      amountTokens: decimals === null ? null : amountText(amount, decimals),
      timestamp: null,
      url: network.explorer + "/tx/" + e.transactionHash,
    });
  }
  const events = [...unique.values()],
    net = wallet
      ? events.reduce(
          (sum, e) =>
            sum +
            (e.to === wallet ? BigInt(e.amountRaw) : 0n) -
            (e.from === wallet ? BigInt(e.amountRaw) : 0n),
          0n,
        )
      : null;
  return {
    source: network.source,
    endpoint: network.rpc,
    chain: q.chain,
    chainId: network.id,
    contractAddress: contract,
    walletAddress: wallet,
    owner: "UNKNOWN",
    decimals,
    asOf: new Date().toISOString(),
    cacheMaxAgeSeconds: 60,
    window: {
      fromBlock: start,
      toBlock: end,
      endBlockHash: block.hash,
      endBlockTime: new Date(blockTime).toISOString(),
      finality: "finalized",
      status: Date.now() - blockTime <= 3600000 ? "CURRENT" : "DELAYED",
    },
    amountSemantics:
      "UNSIGNED_TRANSFER_QUANTITY; only netWalletRaw/netWalletTokens can be signed",
    inspectedEvents: events.length,
    excludedRecords,
    minRawAmount: q.minRawAmount,
    netWalletRaw: net?.toString() ?? null,
    netWalletTokens:
      net === null || decimals === null
        ? null
        : (net < 0n ? "-" : "") + amountText(net < 0n ? -net : net, decimals),
    scope:
      "Only ERC20-shaped Transfer logs for the supplied contract in the bounded finalized block window; NFT/custom contracts can emit the same signature. Amounts/decimals are contract-reported, not independently verified balances. No internal/native transfers, full history, owner labels, trading intent or continuous monitor. Net flow covers inspected events before threshold/limit and is not proof of buying or accumulation. Per-event timestamps are not fetched; window end time is not each transaction time.",
    items: events
      .filter((e) => BigInt(e.amountRaw) >= minimum)
      .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
      .slice(0, q.limit),
  };
}
