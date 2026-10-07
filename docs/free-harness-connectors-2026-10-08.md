# Free Harness connectors — 8 October 2026

Implemented on `codex/exchange-market-research`, continuing `beff3d7`, in `C:/Users/Gus/.codex/worktrees/5913/SNAAP`. Fetched `origin/main` was `0864524`, an ancestor of this task branch. No new dependency, account, paid plan or API key was added. Existing LLM/hosting costs remain separate. Public access has provider limits and terms; it is not unlimited production capacity.

## Connected sources

| Harness tool | Free source | Useful scope | Limit |
| --- | --- | --- | --- |
| `read_dex_pools` | [DEX Screener API](https://docs.dexscreener.com/api/reference) | Search pools or inspect an exact chain/token; rank returned USD volume, liquidity or 24h change | Maximum 20 results, 500 source records; search is a bounded subset, not a global coin ranking |
| `read_defi_context` | [DefiLlama Free API](https://api-docs.defillama.com/llms-free.txt) | Rank reported chain TVL or read one exact protocol slug | Current TVL snapshot, no Pro inflows or historical trend |
| `read_evm_transfers` | Ethereum [PublicNode](https://ethereum.publicnode.com/), Base public RPC, [Arbitrum public RPC](https://docs.arbitrum.io/chain-info) | ERC20-shaped Transfer events for an exact contract, optionally one wallet's observed net flow | Ethereum/Base/Arbitrum only; 1–200 finalized blocks, at most 20 returned events |

Fixed endpoints: `https://ethereum-rpc.publicnode.com/`, `https://mainnet.base.org/`, `https://arb1.arbitrum.io/rpc`. The official [Base bridge SDK](https://github.com/base/bridge-sdk) uses the Base endpoint. Live checks used the [Circle USDC contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses) on all three chains. PublicNode aliases for Base/Arbitrum rejected some finalized archive reads without a personal token; the fixed official public endpoints above passed the same keyless queries. Ethereum uses PublicNode's advertised canonical endpoint.

DEX identities retain chain, pool and both token addresses. Equal ticker names do not establish identical tokens. Pool volume is not added across pools or mixed with CEX quote turnover. Meme labels remain unknown. Pool age is not token birth. DEX pools are research context and **cannot be added as Snaap signal targets** through this tool.

EVM reads check chain ID and finalized block identity, reject removed/malformed/out-of-range logs, deduplicate events and preserve exact uint256 quantities using BigInt strings. Contract-reported decimals can be unknown and are never guessed. Transfer amounts are unsigned; only wallet net flow can be signed. Net flow covers validated inspected events before threshold/limit, not full balances. Individual event timestamps remain null; the window end time is not a transaction timestamp. Custom/NFT contracts can emit the same event shape. Transfers and TVL do not prove purchases, verified owners or secret whale accumulation.

## Harness and response UI

Three strict, bounded read-only tool contracts join the existing native market screening, technical analysis, news and Bitcoin tools. Research does not edit drafts, activate monitoring or introduce new signal operands. Source names and token metadata are untrusted data. Failed reads return a bounded unavailable response rather than invented results.

The shared public reader retains fixed HTTPS hosts, rejected redirects, 12-second timeout, 1.5 MB streamed body limit, 64-entry cache, in-flight coalescing and 15-second failure cooldown. RPC permits only `eth_chainId`, `eth_getBlockByNumber`, `eth_getLogs` and `eth_call`, with fixed endpoints and response-envelope validation. Write methods are rejected. Cold reads are capped at 24 distinct concurrent requests per process; local minute budgets are DEX 120, DefiLlama 30 and each RPC 60. These are application caps, not claimed provider entitlements. Cache hits remain available when a cold-read budget is exhausted.

DEX/RPC responses cache for 60 seconds, TVL for ten minutes, chain ID for one hour. DEX/TVL `asOf` means request time; `providerTime:null` means source freshness is unknown. EVM reports the observed finalized block time and range. Busy contracts can exceed the response/log limit and return unavailable rather than silently truncated complete-flow claims. Multiple replicas need shared snapshots/limiting before claiming thousand-user capacity.

The shared assistant renderer now makes bare HTTP/HTTPS citations clickable as well as Markdown links. Credentials and unsafe protocols are rejected; links use `noopener noreferrer`. Code and image syntax remain non-fetching text/code. Tables wrap long addresses/links while preserving numeric words and allow horizontal scrolling. A real Chrome chat displayed source citations and tables from real DEX/TVL calls; no draft was created or activated.

## What was deliberately not installed

- [Viem](https://github.com/wevm/viem): its client is free, but the four fixed read methods and Transfer decoding use the existing reader, standard JSON-RPC and BigInt. Add Viem when broader ABI/event support makes it smaller than maintaining our fixed scope. It does not supply unlimited RPC or wallet-owner labels.
- [OpenBB](https://docs.openbb.co/odp/python/quickstart): no Python service added to this TypeScript application. A free library does not grant free licensed cash-stock data; the useful current sources integrate directly.
- No DefiLlama Pro, paid Whale Alert, global wallet-label database, continuous on-chain monitor, Solana indexer or newly licensed stock feed was added.

## Verification

- `npm run typecheck` passed; full `npm test` passed **594 tests**. New checks cover chain/token identity, invalid source records, TVL semantics, finalized range, exact large quantities, wallet net flow before limits, wrong-chain rejection, shared reads, RPC envelope/cooldown/write rejection, source budgets and safe citation rendering.
- `npm run test:harness` passed strict new tool dispatch, invalid arguments and unchanged research drafts, alongside existing discovery/batch proposal journeys.
- Direct real-source tools passed DEX search/exact token, chain/protocol TVL and Transfer logs plus decimals on Ethereum, Base and Arbitrum.
- **11 isolated real-model requests** used configured OpenRouter `deepseek/deepseek-v4.1-flash`: eight initial scenarios and three targeted rechecks. Seven initial supported scenarios called the correct tool; the eighth acknowledged unsupported global secret-whale ranking. Rechecks covered TVL/Base/Arbitrum after tightening precision instructions. No rules were saved or activated.
- **One additional real browser chat request** called DEX and DefiLlama tools. Browser verification exposed and fixed non-clickable bare citations and mid-number table wrapping. Local screenshot: `.local/audit/free-tools-ui.jpg`.
- Initial individual requests took about 5.6–26.4 seconds; targeted rechecks about 7.2–17.4 seconds, including model/network work. These are observations, not p95/load measurements. Tool success is not a guarantee of perfect model wording: initial Arbitrum wording incorrectly described unsigned quantities as negative; the precision instruction and targeted recheck corrected that. A Base reply's window-time wording was still imprecise, although its table did not invent per-event timestamps. TVL request time must not be presented as source publication/freshness time.
- Preview port 4173 serves this checkout with real public data and configured model, monitoring disabled. Raw isolated/model/source traces and preview configuration stay ignored under `.local`; credentials are not committed. This work is local to the task branch, not pushed or deployed.

Source terms remain applicable, including [DEX Screener API terms](https://docs.dexscreener.com/api/api-terms-and-conditions). Protocol mechanics follow [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/) and [ERC20](https://ethereum.org/developers/docs/standards/tokens/erc-20/).

## Compatibility and desktop UX recheck

Rechecked `2dfef22` on the same clean branch; fetched `origin/main` remains `0864524`. Typecheck and all 594 tests passed again. Harness contract checks passed (the first launch used the wrong local database port; the completed rerun used the existing preview database on 55913).

Six additional real DeepSeek requests completed: four isolated DEX/TVL/Ethereum/unsupported-whale checks and two browser turns for native Binance Spot rankings followed by an explicit BTC+ETH RSI14 CROSS_ABOVE 30 draft on 15m. Tool traces confirm the expected readers/proposal; the browser conversation has no saved rule. EVM quantities and transaction URLs match the trace, and unsupported owner/global accumulation claims remain withheld. Model wording is not perfect: one native ranking reply mixed in a non-Thai word, and the EVM reply omitted the RPC source name despite retaining explorer links.

Desktop Chrome checks covered loading/send protection, ranking tables, draft receipts/editor/chart agreement, ETH chart selection, category/search filters, cross-category selection, selected-only filtering, source dropdown, Escape cancellation and restored draft after reload. No page-width overflow or captured console errors/warnings in these checks. The source dropdown scrolls for its final option. This is desktop verification, not a mobile or concurrent-load benchmark. Raw traces/screenshots remain ignored under `.local/audit/compat-*`.

Fixed the shared draft-status label to **เก็บร่างในแชทแล้ว**, with a tooltip distinguishing chat autosave from saving/activating a setup. Draft persistence and activation behavior are unchanged.
