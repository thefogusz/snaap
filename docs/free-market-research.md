# Free native-market research in Snaap

Restored independently of the old cash-market UI. The existing authenticated Harness now exposes `screen_assets` and `analyze_assets`. No new package, provider account or exchange API key is required; existing LLM/hosting costs and source terms remain separate.

Publisher news and bounded Bitcoin transfer tools are also available; see [research expansion, source coverage and real-model verification](harness-research-expansion-2026-10-08.md). These are research context, not new continuous signal operands.

DEX pool research, free DeFi TVL and bounded Ethereum/Base/Arbitrum transfers are now connected too; see [free connectors, limits and verification](free-harness-connectors-2026-10-08.md). They do not expand supported signal targets.

Screen query: exchange is all or Binance/Bybit/OKX/Bitget/MEXC/Gate; market is Spot or Perpetual Futures; category is crypto/stocks/forex/metals/commodities/indices/other or null; theme is meme or null; sort is volume/gainers/losers/new; limit 1–20; minQuoteVolume is nonnegative; excludeBases has at most 20 tickers; newSinceDays is 1–90. All fields are required by the model tool contract.

Ranking covers supported USDT products and preserves one actual highest-turnover venue per compatible category/product/pair. Volumes are not summed and are not worldwide coin or NASDAQ cash-stock turnover. Similar tickers do not establish identical contracts or token addresses. Results carry partial-source statuses, filtered volume/change coverage, units and retrieval times. Missing or incomparable turnover and invalid/stale records are excluded. Source time can be null; retrieval time alone does not prove freshness. MEXC perpetual session changes remain withheld from rolling 24h movers; OKX perpetuals without quote turnover cannot participate.

Meme filtering accepts only native explicit tags: primarily Binance underlyingSubType and MEXC conceptPlate on perpetuals. Unknown labels are excluded; no tag is transferred across venues by ticker alone. Empty results do not prove no meme trading.

Recent listings distinguish PROVIDER_LAUNCH (Binance onboardDate, Bybit launchTime, Gate launch_time) from FIRST_OBSERVED (durable Snaap catalog history after a source baseline). Provider contract-launch time is not token creation. First observation is not an official listing date. Future launch times and initial baseline symbols are excluded from newly observed results. Relisting a previously observed symbol is not a new observation. Collection occurs on catalog use, not a continuous scanner.

Shortlist analysis takes market, native timeframe and at most ten exact exchange/pair targets. It requests 240 bars using the existing candle reader and returns EMA20/50, RSI14, ATR14 and VOLUME_RATIO20 only for CURRENT, valid contiguous closed histories with at least 232 bars. Volume ratio compares the current bar with the preceding 20 bars. DELAYED/INSUFFICIENT/UNAVAILABLE retain null metrics. UP/DOWN/MIXED are observations, not future probabilities or whole-market analysis. Discovery leaves drafts untouched; explicitly requested additions still use the validated proposal flow.

Ticker snapshots share one in-flight read per exchange/market, a 60-second cache and 15-second failure cooldown across users. Twelve scopes are bounded within each process. Catalog baselines use transactions/row locks across pools; candle analysis reuses existing caches. Multi-process deployment would need shared storage. This is not an end-to-end thousand-user capacity claim.

Verification: `npm run typecheck`, `npm test`, `npm run test:market-research`, `npm run test:harness`. Checks cover 1,000 consumers sharing one ticker read, units/failures/retries, candle freshness, native class/meme filtering, launch evidence, baselines across pools, and Harness discovery/analysis/batch proposals. Mock Harness checks validate contracts; real-model behavior is tested separately.

Sources: [CCXT manual](https://github.com/ccxt/ccxt/wiki/Manual), [Binance market API](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market), [Bybit tickers](https://bybit-exchange.github.io/docs/v5/market/tickers), [Gate API](https://www.gate.com/docs/developers/apiv4/en/), [MEXC contract API](https://mexcdevelop.github.io/apidocs/contract_v1_en/).

Rollback: remove tool/catalog observation hooks before dropping market_listings and then market_catalog_sources, after backing up observations. Existing strategies/monitoring do not depend on these tables. No removal runs automatically.
