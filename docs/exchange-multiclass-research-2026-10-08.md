# Free exchange feeds and native asset classes

Research base: `bd9c224`, following the optimized crypto-only rollback. Public probes ran on 2026-10-08 Bangkok time, without API keys, account access, orders, or notifications. Local raw evidence: `.local/audit/exchange-research-2026-10-08.json` and `.local/audit/gate-live-2026-10-08.json` (ignored runtime artifacts).

The earlier cash-market catalog is a different product from exchange-listed stock perpetuals. Existing Binance, Bybit, OKX, Bitget and MEXC adapters already fetched current closed stock/metal perpetual candles through Snaap's `candles` function. Examples tested include TSLA, NVDA and XAU; this is sample validation, not certification of every instrument/timeframe. Signals refer to that exact derivative/venue's traded price, not a NASDAQ cash quote. Last, mark and index prices must remain distinct.

## New sources ranked for this architecture

| Priority | Source | Public probe | Fit / remaining work |
|---|---|---|---|
| 1 | Gate | BTC, TSLA, NVDA, XAU: 240 current closed hourly candles, without gaps. Real BTC WebSocket OHLCV received. | Existing USDT linear perpetual architecture fits. Native contract metadata identifies 403 stock/ETF, 18 index, 12 metal, 4 FX and 3 commodity contracts in this snapshot. Counts are venue listings, not unique underlying assets. |
| 2 | Coinbase Advanced | BTC/USD, USDC, EUR, GBP: 240 current closed hourly candles. | Useful international crypto spot feeds. Integration must expose its native intervals and bounded historical paging; does not establish free cash-stock coverage. |
| 2 | Kraken | Four BTC quote pairs: 240 current closed hourly candles. | Crypto spot coverage. OHLC history has a 720-entry ceiling and weekly boundaries need verification; cannot promise the engine's longest warmups. |
| 3 | Hyperliquid / HIP-3 | Native BTC/USDC: 240 current closed hourly candles; public perpDexs discovery succeeded. | Valuable non-crypto builder markets, but USDC settlement, dex-prefixed identities, oracle/source provenance and builder-specific halt states need their own adapter. HIP-3 equity candle/stream coverage is not verified by the BTC probe. |
| 4 | KuCoin Futures | Native metadata identifies US/HK/KR/JP stock contracts; installed adapter returned older 200-row hourly windows. | Official endpoint documents 200-row paging and omitted no-trade buckets. Resolve paging and prove fresh contiguous histories before enabling signals. This is an adapter-query result, not proof that the exchange feed is stale. |
| 4 | BingX | BTC USDT/USDC current hourly candles. | Crypto feed candidate. Its own TradFi guide says API trading is unsupported; no TradFi candle coverage was established. Do not infer it from the web trading UI. |

These priorities assess integration fit and observed public data, not exchange solvency or guaranteed uptime. Gate's own 24h ticker reported approximately 3.87m USDT TSLA volume, 16.05m NVDA and 416.70m XAU at the probe; these are exchange-reported activity, not independently audited volume. REST and WebSocket success are point-in-time samples, not a latency SLA. No market-data subscription charge was encountered; infrastructure/rate limits remain, and public API access alone does not establish unlimited redistribution rights.

## Classification and identity

Use provider metadata, not a list of invented cash tickers: Binance `underlyingType`, Bybit `symbolType`, OKX `instCategory`, Bitget v3 `symbolType`/spot token flags, MEXC `conceptPlate`, Gate `contract_type`. Keep stock tokens distinct from stock perpetuals and leave unknown categories visible as unclassified. ETF may share the stocks filter when a venue only labels the broader equity class; do not turn it into a confirmed cash-stock instrument. Never strip a token issuer/suffix or merge identical tickers across incompatible instrument classes. Keep exact exchange/pair targets stable after saving.

Use the already-installed CCXT/CCXT.pro adapters rather than installing separate exchange SDKs. Preserve shared candle/catalog requests, closed-candle evaluation, continuity and freshness guards, REST recovery, durable checkpoints and independent signal deduplication. Classifying an existing native feed is metadata work; it must not create a second market-data stream or invoke an LLM per tick.

Live interval probes found Gate spot weekly bars start Monday, but perpetual weekly bars start Thursday. Gate perpetual `1w` is excluded until the engine supports that boundary; `2h` and `8h` were aligned with the current UTC engine. Do not advertise native intervals merely because the adapter lists them. Bitget stock-token spot products are also excluded pending their separate V3 candle adapter/interval validation.

## UI direction

One compact asset picker, aggregated across supported venues. Category tabs: crypto, stocks/ETF, FX, metals, commodities, indices and unclassified. Spot/Perpetual is a separate product filter, not an asset class. Search and product filters remain above a bounded scrolling results list; selection count and Apply stay visible below. Show an exact pair, short product label and source count per row. Source choice lives in an optional compact control; retain existing sources by default and assign a supported source only for new selections. Saved source changes require an explicit selection. No TradingView-only instruments enter this picker.

## Primary sources

- [CCXT repository and manual](https://github.com/ccxt/ccxt) — installed unified REST/WebSocket adapters and open-source usage.
- [Binance futures market data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-usd-s-m-futures/api/rest-api/market-data) and [TradFi contracts](https://www.binance.com/en/blog/futures/7832532507450915308).
- [Bybit instruments](https://bybit-exchange.github.io/docs/v5/market/instrument), [asset enums](https://bybit-exchange.github.io/docs/v5/enum), [TradFi Perpetuals versus CFD](https://www.bybit.com/en/learn/bybit-tradfi/what-is-bybit-tradfi).
- [OKX instrument asset categories](https://www.okx.com/docs-v5/) and [stock perpetual methodology](https://www.okx.com/en-gb/help/stock-perpetuals).
- [Bitget instrument/candle API](https://www.bitget.com/docs/catalog/market/market-data).
- [MEXC public contract API](https://mexcdevelop.github.io/apidocs/contract_v1_en/).
- [Gate API v4](https://www.gate.com/docs/developers/apiv4/en/).
- [Coinbase public candles](https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles).
- [Kraken OHLC limits](https://docs.kraken.com/api-reference/market-data/get-ohlc-data).
- [Hyperliquid public info/candleSnapshot](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint).
- [KuCoin kline paging](https://www.kucoin.com/docs-new/v2/rest/ua/get-klines).
- [BingX TradFi API limitation](https://bingx.com/en/learn/article/how-to-trade-forex-commodities-stocks-indices-with-bingx-tradfi-perpetuals).
