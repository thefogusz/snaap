# Snaap discovery capability audit — 2026-10-08

Audited checkout: `C:/Users/Gus/.codex/worktrees/5913/SNAAP`, branch `codex/exchange-market-research`, HEAD `674936d6617875f9e65e86c88f7e373c6a95f027`. Fetched origin; `origin/main` remains `0864524fc09a2d4dde309ef0272986f007b3fb04`, an ancestor of this task branch. This report describes the local task checkout, not a production deployment or other chats' branches.

## Finding

The free screening implementation existed but is absent from this checkout following the requested rollback. Commit `3e6279d` added `screen_assets`, `analyze_assets`, ticker caching/coalescing and persistent catalog observations. The retained branch `codex/asset-first-markets` includes that commit. The rollback commit `bd9c224` continued from the optimization baseline; its commit message explicitly excludes assistant screening. Later native category/Gate work restored catalog and signal support, but did not restore those research tools.

The current Harness exposes exactly five tools: `read_skill`, `find_instruments`, `propose_strategy`, `replay_strategy`, `inspect_setup_bar`. A provider-native asset catalog supplies identities/categories/sources, not 24-hour ticker statistics, news or blockchain transactions. Having chart candles does not make a whole-market screener available to the assistant.

## Real-model audit

Eight independent standard-mode conversations used existing OpenRouter configuration with `deepseek/deepseek-v4.1-flash`, an isolated temporary PostgreSQL schema and no market fixtures. Monitoring was explicitly disabled. No rule was saved or activated, no notification/order was sent, all responses returned null drafts, and the schema was deleted after inspection data was recorded. Estimated app ledger cost was USD 0.10711275; this is not reconciled OpenRouter billing.

Raw evidence: `.local/audit/discovery-real-model.json`; reproducible local audit: `.local/audit-discovery.ts`. Both are ignored local artifacts. HTTP 200 below means a completed reply, not successful fulfillment of the market request.

| Question | Current result | Calls | Time |
|---|---|---|---|
| Top 10 crypto by current volume | Unavailable; explicitly admits no ranking feed | None | 4.154 s |
| Top 10 stock gainers | Unavailable; supplies only example catalog matches | 3 `find_instruments` calls | 9.040 s |
| Top 10 stock losers | Unavailable; supplies a partial catalog | 1 `find_instruments` call | 7.655 s |
| Today's important technology-stock news, original links and timestamps | Unavailable; no news/browser tool | None | 2.326 s |
| Top 10 meme coins by 24h turnover | Unavailable; no ranking or meme taxonomy | None | 4.456 s |
| Coins with current whale accumulation, wallet/transaction evidence | Unavailable; no blockchain feed | None | 6.067 s |
| This week's new listings with official listing dates | Unavailable; catalog has no observation tracker or announcement tool | None | 4.914 s |
| Find TSLA perpetuals across sources | Available: TSLA/USDT on Binance/Bybit/OKX/Bitget/Gate, TESLA/USDT on MEXC | 1 `find_instruments` call | 4.670 s |

No fabricated current rankings, news events or whale transactions were observed in this sample. Seven requested discovery capabilities remain unfulfilled. The prior real-model audit on the same HEAD verified closed-candle setup inspection; that evaluates specified saved targets, rather than ranking the full market.

Answer-quality gaps remain: the generic stock questions defaulted to Spot, and replies described the stocks category too broadly as tokenized stocks, omitting supported reference perpetuals. The gainer answer described Bybit/OKX coverage after looking up only three Spot tickers; that is not full stock coverage. The listing reply unnecessarily mentioned an attached image although none was sent. TSLA and TESLA share an indicated underlying name, but remain separate venue contracts; prose must not imply identical contracts or independently verified fungibility.

## Capability map and minimum required work

| Capability | Existing reusable work | Missing work / limits |
|---|---|---|
| Crypto 24h volume / gainers / losers | Restore the old ticker reader, shared cache and screening tool independently of old UI | Adapt six sources, current native categories and exact identities; disclose failed sources and units. Ranking supported pairs is not a worldwide coin ranking. |
| Exchange-listed stocks/ETF movers | Current provider-native `stocks` catalog; real Bybit/Gate 24h data | Join catalog to ticker records, filter category/product, rank comparable percent changes; distinguish stock tokens and perpetuals, rolling 24h and cash-market sessions. No claim to NASDAQ-wide movers. |
| Shortlist technical observations | Existing closed-candle reader, indicators, inspection/replay; old `analyze_assets` | Restore/adapt bounded independent analysis without forcing a draft edit; gate output on freshness/continuity and disclose analyzed scope. Observed momentum is not a future probability. |
| Newly observed pairs | Old durable baseline/first-observation tracking | Restore observation tables/hooks. First seen by Snaap is not official listing time or token creation. Official dates need venue launch metadata with defined semantics or announcement evidence. |
| Meme-coin volume | Generic screening plus existing candle reader | Verified meme classification and token identity/address mapping; do not guess from ticker, model memory or social popularity. Rank trading turnover, not search popularity. |
| Important stock/crypto news | LLM summarization already available | Whitelisted news/filing/issuer/exchange sources, publication and event timestamps, deduplication, entity mapping and cited original URLs. Importance is an interpretation, not a provider fact. |
| Large trades / participation changes | Exchange candles and supported volume indicators | Public trade/OI/funding adapters could provide measurable activity; these do not identify a whale or prove accumulation. No current Harness tool for those feeds. |
| Whale accumulation evidence | No current wallet/chain tool | Chain-specific confirmed transfers/swaps, address/entity labels, token identities, time-window balance deltas and internal-transfer filtering. Exchange deposits, wallet transfers and whale buys are different events. Cannot establish hidden intentions from OHLCV. |

## Direct free-endpoint probes

These probes ran separately from the Harness, without exchange API keys. They prove candidate upstream availability at the observation time, not implemented Snaap chat functionality or production access guarantees. Raw evidence: `.local/audit/discovery-feed-probe.json`; probe: `.local/probe-discovery-feeds.mjs`.

At 2026-10-08 04:05 Bangkok:

- Binance Spot `/api/v3/ticker/24hr`: 3,727 raw ticker records, 285 ms. This count includes raw products before active/supported/quote filters; it is not a supported instrument count.
- Bybit `/v5/market/tickers?category=linear`: 896 raw records, 173 ms. TSLA/AAPL/NVDA/MSFT returned `turnover24h` and `price24hPcnt`. The latter is a fractional rate (e.g. `0.008505` means 0.8505%), unlike already-percent fields on other venues.
- Gate `/futures/usdt/contracts`: 1,028 raw records, 1,145 ms; the four sampled equity contracts carry `contract_type:stocks`.
- Gate `/futures/usdt/tickers`: 1,028 raw records, 995 ms; sampled equity contracts returned `volume_24h_quote` and `change_percentage`. Distinguish quote turnover from base volume, contract volume, last price, mark price and index price.

Do not sum similarly named contracts or convert base volume by the latest price and label it exact turnover. The retained screener previously withheld incompatible OKX perpetual quote volume and MEXC perpetual session-based change; reusing it requires retesting those contracts, not assuming all adapters provide comparable values.

## Recommended order for this architecture

1. Restore only the research backend/tool wiring and its existing tests; retain the current compact native UI and signal architecture. Extend screening by native category so crypto and exchange-listed equity movers use the same pipeline. Shared snapshots, bounded output and shortlist analysis fit the existing architecture; the LLM explains results instead of calculating rankings or polling per tick.
2. Restore newly observed catalog history; add official announcement/filing sources with timestamped citations for listing/news questions. Start with a bounded set of sources and entities.
3. Add a verified meme identity/category mapping before claiming meme-wide rankings. CoinGecko is a candidate taxonomy source, but its free Demo quotas/attribution and commercial license suitability require resolution before a public product integration. No new key or provider integration was installed in this audit.
4. Treat whale evidence as a separate chain-data feature. A bounded address/asset watchlist can support specific confirmed observations; a free global real-time whale intelligence service is not established. Avoid substituting a volume spike for wallet evidence.

The older screening change was crypto-only, five-source and USDT-only, and had no news, meme taxonomy, DEX scanner or whale feed. Restoring it cannot fulfill all the requests by itself. No research feature was restored and no product behavior/UI was changed by this audit.

## Official sources checked

- [Binance Spot market API](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market): 24-hour ticker fields and public market data.
- [Bybit tickers](https://bybit-exchange.github.io/docs/v5/market/tickers): turnover and relative 24-hour price-change semantics.
- [Gate API v4](https://www.gate.com/docs/developers/apiv4/en/): public market endpoints; changelog also documents public announcement querying via `POST /ann/list_article` without an API key. Announcement endpoint was documented, not runtime-tested here.
- [CoinGecko markets/category filtering](https://docs.coingecko.com/reference/coins-markets), [category list](https://docs.coingecko.com/reference/coins-categories-list), [pricing/license comparison](https://www.coingecko.com/en/api/pricing): taxonomy candidate, with free-plan limitations and commercial-use distinctions.
- [SEC RSS feeds](https://www.sec.gov/about/rss-feeds): company/filing feeds as primary event evidence, not a complete general-news feed.
- [Whale Alert documentation](https://developer.whale-alert.io/api-account/documentation): live APIs require an active developer subscription; a downloadable historical social-alert archive is free but cannot answer current whale questions. [Whale Alert terms](https://whale-alert.io/terms-and-conditions.html) describe entity attribution as probabilistic.
