import test from "node:test";
import assert from "node:assert/strict";
import {
  readDexPools,
  readDefiContext,
} from "../src/decentralized-research.js";
import { readEvmTransfers } from "../src/decentralized-research.js";

test("DEX research keeps chain/contract identities separate and excludes incomparable data", async () => {
  const a = "0x" + "a".repeat(40),
    b = "0x" + "b".repeat(40);
  const pool = (chain: string, address: string, volume: number) => ({
    chainId: chain,
    dexId: "uniswap",
    pairAddress: address,
    baseToken: { address: a, name: "Same ticker", symbol: "MEME" },
    quoteToken: { address: b, name: "USD", symbol: "USD" },
    volume: { h24: volume },
    priceUsd: "1.25",
    liquidity: { usd: 5000 },
    priceChange: { h24: -2 },
  });
  const rows = [
    pool("ethereum", a, 100),
    pool("base", b, 200),
    { ...pool("ethereum", b, 300), volume: { h24: -1 } },
    { ...pool("ethereum", b, 400), priceUsd: "NaN" },
  ];
  let seen = "";
  const result = await readDexPools(
    {
      mode: "search",
      query: "MEME",
      chain: null,
      tokenAddress: null,
      sort: "volume",
      limit: 10,
      minLiquidityUSD: 1000,
    },
    async (url) => {
      seen = url;
      return JSON.stringify({ pairs: rows });
    },
  );
  assert.match(seen, /search\?q=MEME/);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].chain, "base");
  assert.equal(result.items[0].baseToken.address, a);
  assert.equal(result.items[0].volume24hUSD, 200);
  assert.equal(result.items[0].url, `https://dexscreener.com/base/${b}`);
  assert.equal(result.items[0].signalSupported, false);
  assert.equal(result.items[0].memeClassification, "UNKNOWN");
  assert.equal(result.excludedRecords, 2);
  assert.equal(result.providerTime, null);
  const token = await readDexPools(
    {
      mode: "token",
      query: "",
      chain: "ethereum",
      tokenAddress: a,
      sort: "volume",
      limit: 10,
      minLiquidityUSD: 0,
    },
    async (url) => {
      assert.ok(url.endsWith("/ethereum/" + a));
      return JSON.stringify(rows.slice(0, 2));
    },
  );
  assert.equal(token.items.length, 1);
  await assert.rejects(
    readDexPools({
      mode: "token",
      query: "",
      chain: null,
      tokenAddress: a,
      sort: "volume",
      limit: 10,
      minLiquidityUSD: 0,
    }),
  );
});

test("EVM reads finalized bounded ERC20 logs, exact BigInt amounts and wallet net flow without owner attribution", async () => {
  const contract = "0x" + "a".repeat(40),
    wallet = "0x" + "b".repeat(40),
    other = "0x" + "c".repeat(40),
    hash = "0x" + "d".repeat(64);
  const transfer =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    topic = (a: string) => "0x" + a.slice(2).padStart(64, "0");
  const log = (from: string, to: string, amount: bigint, index: number) => ({
    address: contract,
    topics: [transfer, topic(from), topic(to)],
    data: "0x" + amount.toString(16).padStart(64, "0"),
    blockNumber: "0x64",
    blockHash: hash,
    transactionHash: hash,
    logIndex: "0x" + index.toString(16),
    removed: false,
  });
  const calls: any[] = [];
  const rpc = async (_chain: string, method: string, params: unknown[]) => {
    calls.push({ method, params });
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_getBlockByNumber")
      return {
        number: "0x64",
        hash,
        timestamp: "0x" + Math.floor(Date.now() / 1000).toString(16),
      };
    if (method === "eth_call") return "0x" + (6).toString(16).padStart(64, "0");
    return [
      log(other, wallet, 9007199254740993n, 0),
      log(wallet, other, 2n, 1),
      { ...log(other, wallet, 4n, 2), removed: true },
      { ...log(other, wallet, 9n, 3), address: other },
    ];
  };
  const result = await readEvmTransfers(
    {
      chain: "ethereum",
      contractAddress: contract,
      walletAddress: wallet,
      blocks: 20,
      limit: 1,
      minRawAmount: "3",
    },
    rpc,
  );
  assert.equal(result.inspectedEvents, 2);
  assert.equal(result.items[0].amountRaw, "9007199254740993");
  assert.equal(result.items[0].amountTokens, "9007199254.740993");
  assert.equal(result.netWalletRaw, "9007199254740991");
  assert.equal(result.owner, "UNKNOWN");
  assert.equal(result.items[0].timestamp, null);
  const outflow = await readEvmTransfers(
    {
      chain: "ethereum",
      contractAddress: contract,
      walletAddress: other,
      blocks: 20,
      limit: 1,
      minRawAmount: "0",
    },
    rpc,
  );
  assert.equal(outflow.netWalletTokens, "-9007199254.740991");
  assert.ok(outflow.items.every((e) => !e.amountRaw.startsWith("-")));
  assert.equal(result.items[0].url, "https://etherscan.io/tx/" + hash);
  assert.equal(calls.filter((c) => c.method === "eth_getLogs").length, 4);
  assert.equal(
    calls.find((c) => c.method === "eth_getLogs").params[0].fromBlock,
    "0x51",
  );
  await assert.rejects(
    readEvmTransfers(
      {
        chain: "ethereum",
        contractAddress: contract,
        walletAddress: null,
        blocks: 201,
        limit: 10,
        minRawAmount: "0",
      },
      rpc,
    ),
  );
  await assert.rejects(
    readEvmTransfers(
      {
        chain: "ethereum",
        contractAddress: contract,
        walletAddress: null,
        blocks: 20,
        limit: 10,
        minRawAmount: "0",
      },
      async () => "0x2",
    ),
  );
});

test("DeFi context ranks reported TVL without claiming inflows or whale ownership", async () => {
  const chains = await readDefiContext(
    { protocolSlug: null, limit: 2 },
    async () =>
      JSON.stringify([
        { name: "Base", tvl: 500 },
        { name: "Ethereum", tvl: 1000 },
        { name: "Bad", tvl: -1 },
      ]),
  );
  assert.equal(chains.items[0].name, "Ethereum");
  assert.equal(chains.items[0].tvlUSD, 1000);
  assert.equal(chains.excludedRecords, 1);
  const protocol = await readDefiContext(
    { protocolSlug: "aave", limit: 1 },
    async (url) => {
      assert.equal(url, "https://api.llama.fi/tvl/aave");
      return "123.45";
    },
  );
  assert.equal(protocol.items[0].tvlUSD, 123.45);
  assert.match(protocol.scope, /not inflows/);
  await assert.rejects(
    readDefiContext({ protocolSlug: "../../secret", limit: 1 }),
  );
  await assert.rejects(
    readDefiContext({ protocolSlug: "aave", limit: 1 }, async () => "-1"),
  );
});
