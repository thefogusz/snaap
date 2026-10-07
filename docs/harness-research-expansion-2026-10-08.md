# Harness research expansion — 8 October 2026

Implemented on `codex/exchange-market-research` in checkout `C:/Users/Gus/.codex/worktrees/5913/SNAAP`. This continues the native exchange-category implementation at `674936d`; fetched `origin/main` was `0864524` and an ancestor of the task branch. Screening restoration is commit `2bb7bbe`. The earlier discovery audit describes the state before this restoration, not the current capability.

## Available now

| Request | Tool / evidence | Actual scope |
| --- | --- | --- |
| Ten crypto pairs with highest volume | `screen_assets` | Supported active USDT products on Binance, Bybit, OKX, Bitget, MEXC and Gate; comparable quote turnover only, one venue per compatible named pair, not summed global coin volume |
| Stocks rising/falling strongly | `screen_assets` | Exchange-native stock/ETF derivatives, not the complete cash-stock market; rolling 24h percentage where comparable |
| Highly traded meme coins | `screen_assets` | Explicit native meme labels, mainly Binance/MEXC perpetuals; unknown tags excluded |
| Recently listed products | `screen_assets` | Provider launch/onboard timestamps or durable first observation after baseline; neither proves token birth or universal listing coverage |
| Shortlist technical direction | `analyze_assets` | At most ten exact targets using current closed candles and existing indicators; observations, not future probabilities |
| Important tech-stock news | `read_market_news` | NVIDIA, Apple and Microsoft publisher feeds; original headline, link and publication/update time. Importance is interpretation; article bodies are not read |
| Exchange announcements | `read_market_news` | Latest 50 English Gate announcements, filtered by rolling hours/headline query; not all exchanges or all crypto journalism |
| Large transfers / activity at an address | `read_chain_activity` | Bitcoin only, confirmed transactions via mempool.space; unknown owners and no proof of purchases or accumulation |

All additions are read-only research context. They do not automatically modify a draft, activate a monitor, place orders or introduce news/on-chain signal operands. Explicit batch additions continue through the existing validated strategy proposal flow. Existing UI and native categories remain in place.

## Repositories and techniques ranked for this architecture

Scores are engineering judgments about fit and immediate usefulness, not objective product rankings. Reviewed community reports as leads, then checked documentation and live source responses.

| Fit | Project / source | Decision |
| --- | --- | --- |
| 5/5 | [CCXT](https://github.com/ccxt/ccxt), [manual](https://github.com/ccxt/ccxt/wiki/Manual) | Reused the installed library and existing instrument/candle readers. Normalize native ticker semantics before ranking; never assume every venue's volume/change fields are comparable |
| 5/5 | Official publisher RSS/Atom and [Gate API](https://www.gate.com/docs/developers/apiv4/en/) | Implemented bounded headline readers with original URLs and timestamps. Gate's public announcement request is read-only POST; no exchange account key |
| 4/5 | [mempool repository](https://github.com/mempool/mempool), [REST API](https://mempool.space/docs/api/rest) | Implemented public API reads, not a copied explorer or full-node installation. Useful verifiable Bitcoin transfers; public hosting is not unlimited capacity or an SLA |
| 4/5 | [Viem](https://github.com/wevm/viem), [watchContractEvent](https://viem.sh/docs/contract/watchContractEvent) | Researched, not installed. Best next candidate for explicit EVM addresses/token events. MIT client code does not supply RPC capacity or verified wallet-owner labels |
| 4/5 | [DEX Screener API](https://docs.dexscreener.com/api/reference) | Researched, not connected. Useful pool volume/liquidity by chain and contract address. Endpoint limits differ (60/300 requests per minute); paid boosts are not organic trading volume, search is not an exhaustive universe |
| 3/5 | [DefiLlama adapters](https://github.com/DefiLlama/DefiLlama-Adapters), [methodology](https://defillama.com/about) | Researched, not installed. Transparent protocol/TVL context; TVL is not proof a named whale bought a token |
| 3/5 | [Solana RPC](https://solana.com/docs/rpc/http), [public-endpoint guidance](https://solana.com/docs/payments/interacting-with-solana) | Researched, not connected. Bounded explicit-address transaction queries are possible; public endpoints have rate limits and no production SLA. Per-wallet history expansion can multiply requests |
| 3/5 | [SEC feeds](https://www.sec.gov/about/rss-feeds) | Research candidate for primary filing/event evidence beyond three tech companies; not connected in this change |
| 2/5 | [OpenBB](https://github.com/OpenBB-finance/OpenBB), [V5 migration](https://docs.openbb.co/odp/python/migration-from-v4), [license FAQ](https://docs.openbb.co/odp/python/faqs/license) | Reference for provider separation, not a Python stack added to our TypeScript app. V5 changed providers and licensing; old community recipes cannot be assumed current. Open-source software does not grant every upstream data right |

Community leads: [historical CCXT OKX volume issue](https://github.com/ccxt/ccxt/issues/12128), [Solana wallet-history discussion](https://www.reddit.com/r/solana/comments/1s2828w/how_are_you_actually_handling_wallet_transaction/), [OpenBB API-cost discussion](https://www.reddit.com/r/openBB/comments/1egu0mr/minimizing_api_bill_and_lowering_costs). These motivate checks, not current factual claims. Live adapters determined our exclusions. [Whale Alert developer API](https://developer.whale-alert.io/api-account/documentation) requires an active subscription; it was not added as a supposedly free current feed.

## Techniques actually applied

- Strict typed tool arguments, bounded results and existing Harness tool-call budgets. Screening first, then technical analysis of a shortlist rather than asking the LLM to scan thousands of candles.
- Shared in-flight requests, bounded process-local caches and 15-second failed-source cooldown. Tickers use 60-second snapshots, news five minutes, chain reads 60 seconds. Hosting/LLM costs and upstream quotas/terms remain separate from free public access.
- Exact source/product identity, explicit native taxonomy, no sum across incomparable sources. Results retain units, source availability, retrieval time and provider time when supplied.
- Durable listing baselines across database pools. Initial catalog contents are not marked newly listed. Missing launch dates remain unknown.
- Fixed HTTPS evidence sources, no arbitrary user URL fetches, redirects rejected, 12-second network timeout and 1.5 MB response limit. XML is limited to known RSS/Atom publishers, external links/DTD/entities rejected. Source titles are untrusted data, never instructions.
- Evidence includes original URLs/transaction IDs and observation times. Empty valid results differ from unavailable sources. News publication and update times remain separate; deterministic Bangkok timestamps avoid model date-conversion errors.
- Bitcoin sampling is deterministic: first 50 transactions in each of two latest blocks, excluding mining rewards; at most five source requests. It is not random or representative. Address queries inspect up to 25 recent confirmed transactions and calculate net address flow without attributing an owner.
- No LLM work per price tick, no extra agent framework or dependency, no automatic strategy activation.

The caches currently share work only within one process. Multiple API processes need shared snapshots before a thousand-user capacity claim. New-listing observation runs when catalogs are used, not as a continuous all-venue collector. Confirmed Bitcoin blocks can be older than the request; block time, not retrieval time, establishes the observation date. There is no continuous whale monitor or all-chain wallet-label database.

## Verification and observed limitations

- `npm run typecheck` passed; `npm test` passed **588 tests**.
- `npm run test:market-research` passed the durable catalog integration after the first slice. `npm run test:harness` passed with news/chain contracts, unchanged drafts, invalid arguments, batch proposals and existing Harness journeys. A run interrupted by restarting the preview database was discarded and rerun successfully.
- Unit checks cover 1,000 coalesced public-read consumers, response/host/redirect limits, RSS/Atom dates and links, partial source failures, Bitcoin coinbase `prevout: null`, thresholds, deterministic sampling and exact-address net flow.
- **16 real-model requests** used OpenRouter `deepseek/deepseek-v4.1-flash` with real public data, isolated temporary database schemas, monitoring disabled and no saved/activated rules. Ten initial scenarios, five targeted rechecks and one final transaction-proof recheck. HTTP success alone was not counted as fulfilling an unsupported request.
- Real tool calls covered crypto volume, equity derivative gainers/losers, memes, listings, company news, Gate announcements, instrument lookup and Bitcoin evidence. Found and fixed coinbase-null parsing and incorrect Thai news dates. Added explicit non-random sampling metadata after model wording described the sample imprecisely.
- Final Bitcoin proof response reproduced three transaction IDs and amounts exactly from the trace (3.86248449, 3.16957784 and 2.6814893 BTC), cited original explorer links, stated 100 inspected transactions out of 8,882 in two blocks, and did not call these purchases or whale accumulation. At a 100 BTC threshold an earlier valid sample was empty; that proves nothing about uninspected transactions.
- Observed individual cold ranking calls took about 12.6–15.8 seconds; cached rankings about 2.6–3.4 seconds; final Bitcoin proof 4.8 seconds. A listing request using multiple tools took 23.8 seconds. These are single observations including LLM/network time, not p95 measurements or a concurrent-user benchmark.
- Preview restarted on port 4173 from this exact checkout with real public data and real configured model, monitoring disabled. Browser control failed while binding both existing tabs, so new tool output rendering was **not visually reverified** in this slice. API/model verification is independent of that limitation.

Local raw traces and provider configuration remain ignored under `.local`; credentials were not committed. This change is local to the task branch, not pushed or deployed.

## Next useful expansion

Prioritize explicit EVM/Solana address research with chain/contract identity, confirmation and reorg handling, followed by DEX pool research and broader issuer/SEC event feeds. Add owner labels only with provenance and confidence; distinguish self-transfers, exchange custody, swaps and changes in holdings. A cross-chain question about “which coins whales are secretly accumulating” remains unsupported as a factual claim. No free repo by itself supplies complete current transaction indexing, reliable identities or unlimited production RPC.
