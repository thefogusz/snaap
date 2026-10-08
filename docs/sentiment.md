# Sentiment — daily cross-market view and fund flows

## Product and design

The default view is a compact morning brief: the latest US weekly fund-flow leader and biggest withdrawal category, four directional bars, then six main-market tiles. Detailed tables and charts are behind deliberate selection. The seven-day view answers which reference assets strengthened or weakened over the last seven calendar days. A linked chart, daily-return heatmap, and compact leader/laggard cards use Snaap lime, neutral surfaces, and a distinct pink downside. Each asset and date is selectable; the selected chart links to its exact TradingView symbol. The separate fund-flow tab retains an interactive Three.js diagram and period history. Gold ETF flows, USD stablecoin supply changes, and Bitcoin sentiment remain separately labeled below both views.

Design research on 2026-10-08:

- [Bento Grids](https://bentogrids.com/): inspected rendered examples; use a large analytical area plus smaller summaries, without turning every datum into a card.
- [60fps / Revolut transactions](https://60fps.design/shots/revolut-number-of-transactions-interaction): inspected the interaction example; use short selection transitions and a stable content area. Reduced motion disables CSS animation and pauses Three.js.
- [Linear UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui), [Carbon data visualization](https://www.carbondesignsystem.com/building-blocks/data-visualization/color-palettes), [Observable diverging bars](https://observablehq.com/@d3/diverging-bar-chart/2), [Koyfin dashboards](https://www.koyfin.com/help/mydashboards-myd/): hierarchy, restrained chart colors, common-zero comparisons, linked selection.
- Reviewed the public galleries/pages at [Jiro](https://jiro.build), [Navbar Gallery](https://navbar.gallery), [Footer Design](https://footer.design), [CTA Gallery](https://cta.gallery), and [Unsection](https://unsection.com). The dashboard does not need a promotional CTA/footer. 404s.design could not be retrieved; it was not used as a verified reference. No paid templates or third-party design assets were copied.

## Connected sources

| Dataset | Measurement and coverage | Cadence / upstream cache |
| --- | --- | --- |
| Yahoo Finance public chart endpoint | USD prices of SPY, EFA, EEM, TLT, GLD, USO, VNQ and UUP | Daily bars, potentially delayed/provisional; 5 minutes |
| [Coinbase Exchange candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles) | BTC-USD and ETH-USD on Coinbase, not every crypto venue | Daily UTC bars, current bar provisional; 5 minutes |
| [ICI / IIFA worldwide directory](https://www.ici.org/research/statistics/mutual-funds/quarterly-worldwide-mutual-fund-market) | Regulated open-end fund net sales, including reinvested dividends; seven categories | Quarterly; 6 hours |
| [ICI combined flows](https://www.ici.org/research/stats/combined_flows) | Estimated US long-term fund flows and ETF net issuance; four categories, excludes money-market funds | Weekly; 6 hours |
| [World Gold Council](https://www.gold.org/goldhub/data/global-gold-backed-etf-holdings-and-flows) | Worldwide physically backed gold ETF flows, sum of regional USD flow columns | Freshest weekly or monthly observation; 1 hour |
| [DefiLlama stablecoins](https://defillama.com/stablecoins) | Change in circulating USD-pegged stablecoin units; seven daily changes | Daily; 15 minutes |
| [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/) | Bitcoin Fear & Greed index, 0–100 | Daily; 15 minutes |

The daily ETF adapter uses `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1mo&interval=1d`. This is an unofficial public interface, not an exchange-grade API with a stability or latency guarantee. It worked for all eight ETFs during verification. Its access and redistribution suitability must be assessed before a public commercial launch. Coinbase is an official unauthenticated endpoint; the documentation discourages frequent historical polling, hence a shared five-minute cache rather than tick-rate polling.

ETFs are market proxies: GLD is not spot gold, USO and UUP have futures exposure, TLT covers long-duration US Treasuries, VNQ covers US REITs, and EFA/EEM do not represent every country's stocks. Changes in their prices are not net capital flows. Returns use close prices, not dividend-adjusted total returns. The table uses seven calendar dates ending today in UTC, but ETF bars retain their exchange-local dates. Markets can have different latest observations; weekends/missing bars remain null, never fabricated 0%. Daily return compares with the previous observed trading session; 7D return compares the latest available price with the last observation before the seven-day window. An unfinished candle is visibly marked.

[TradingView's official widget FAQ](https://www.tradingview.com/widget-docs/faq/data/) does not provide widget data as an export API. The implementation links to the exact symbol on TradingView instead of scraping private endpoints or implying that widget data is licensed for recomputation. Charting libraries need a separate data feed.

## Fund-flow interpretation and validation

ICI worldwide releases are discovered from the current directory, not pinned to a historical release. The net-sales table must match its units, period and accompanying definition; category totals reconcile within the rounding tolerance. The assets table, ETF memo rows and US subcategory rows are excluded to avoid double counting. A global `*` means below $0.5 billion with unknown sign and becomes null, not zero. Category inflow/outflow subtotals are sums of net category values, not gross subscriptions and redemptions.

World Gold Council uses the public chart at `https://fsapi.gold.org/api/v11/charts/etfv2/revised/flows-chart2?break-cache=25Jul22`. Only North America, Europe, Asia and Other USD flow columns on axis 0 are summed; the gold-price line is excluded. Dates and monthly as-of dates are validated. Six historical weekly/monthly periods are shown. No private holdings endpoints are used.

DefiLlama uses `https://stablecoins.llama.fi/stablecoincharts/all`, specifically `totalCirculating.peggedUSD`, rather than the price-valued market-cap field. Eight consecutive daily observations produce seven changes. Minting, burning and coverage/classification changes can affect this measure; it neither identifies the source of funds nor establishes capital inflows to BTC, ETH or crypto ETFs.

The flow diagram connects each category to an unspecified origin/destination reference, never to another category. Its animation depicts direction, not live transactions. Line width is relative within the selected period; common-zero bars are the quantitative comparison. ICI, gold and stablecoin figures are not summed. Money-market funds are not a residual estimate of money leaving all other markets.

## Unconnected sources and research outcomes

Crypto ETF daily net flows are not connected. Farside's public tables could be read through search but direct server access returned 403; no bypass was attempted. CoinShares' research hub showed mismatched/stale dates. Xoomar's accessible endpoint estimates flows from a limited set of holdings and did not establish open redistribution rights. The formerly advertised free yasinozen endpoint returned 410. [CryptoETF.today](https://docs.cryptoetf.today/) advertises a free limited history with an account/API key; no account was created. DefiLlama's ETF flow API is Pro. None was replaced by fabricated data or a manual snapshot.

There is no connected free source here that measures all global capital moving between all markets in real time. Daily prices, actual reported fund flows, supply changes and sentiment are deliberately labeled as different measurements. No paid feed, license, production deployment or external account was purchased/accepted.

## Implementation and checks

- Authenticated endpoints: `/api/v1/sentiment/daily`, `/api/v1/sentiment/specialists`, `/api/v1/sentiment?universe=global|us`.
- Fixed upstream URLs, bounded responses, schema/units/date validation, 15-second upstream timeout, no redirects. Per-source caches deduplicate concurrent requests. Failure preserves last good data with a stale flag; first failure is visible per asset/feed. No synthetic fallback. Failure backoff: one minute.
- ICI returns HTTP 403 from Railway (verified 2026-10-08). On a cold-start failure only, fund flows use the genuine reports in `src/data/ici-flows.json`, parsed and reconciled from ICI on 2026-10-08 at 08:29 UTC: worldwide Q2 2026 and US week ending September 30. Original source/publication/retrieval dates remain intact and `stale: true` is shown. Successful live refresh supersedes this backup. This is dated report availability, not restored live ICI access; update the backup only from newly verified official reports. Other feeds retain their independent live refreshes. Source failures log their HTTP status and hostname without response bodies or user data.
- Page sync: once per minute while visible, subject to the upstream cache intervals above. Refresh never presents an unchanged source observation as a new observation.
- Lazy Three.js module, capped device pixel ratio, pause/reduced motion, viewport/background suspension, disposal, and readable DOM fallback without WebGL.
- Tests cover units, reconciliation, exclusions, chronology, identity, invalid OHLC, incomplete bars, calendar gaps, exact returns, source isolation, concurrent cache reuse, initial failure and stale-cache recovery.
- Browser preview: `http://127.0.0.1:4186/sentiment`, isolated local account/database, served from `C:/Users/Gus/.codex/worktrees/a546/SNAAP`, branch `codex/sentiment-flow`, HEAD/base `26c9a5439000c9eb0a7ae55afa5281148884fa9a`. Data are fetched from the sources above, not fixtures. This preview is not a deployment.

### Verification result (2026-10-08)

- `npm run typecheck`: passed.
- `npm test`: 613 passed, 0 failed.
- JavaScript syntax checks and `git diff --check`: passed.
- Real browser: daily assets and date selection; missing weekend prices; BTC provisional bar; TradingView symbol links; global quarterly and US weekly reports; period selection; flow-node pointer interaction; pause control; dark/light themes; 1440px desktop, 390px and 320px mobile.
- At 320px the document is 316px wide (no horizontal page overflow); the daily table and specialist history scroll inside their own containers. Browser console had no errors.
- Fixed a collision with the app's global `button:active` transform, which moved positioned flow buttons away from the pointer before click completion. Positioned controls now preserve their anchors during activation.


## Morning brief and large-to-small exploration (2026-10-08)

The summary does not label the weekly ICI observation as today's flow. Its period and publication date remain visible. Selecting a fund-flow bar opens its US report and category; the separate worldwide action opens the quarterly universe. Selecting a price opens its seven-day view. The stock tile also opens a region comparison using SPY/EFA/EEM, without inventing a global weighted equity return.

Crypto is a single main tile with inline drill-down: **Crypto → Bitcoin / Ethereum / Altcoins → individual coin**. Closing or returning one level retains the main-market context. This uses a new authenticated `/api/v1/sentiment/crypto-breakdown` endpoint and the public CoinGecko `coins/markets` endpoint, validated against [official documentation](https://docs.coingecko.com/reference/coins-markets). Fetch the top 100 by market cap and a separate `category=stablecoins&per_page=250` list. Exclude stablecoins by provider ID; check that the classification page reaches below the smallest tracked asset if pagination is full. Require unique coins, usable positive current/prior capitalizations, fresh timestamps, and both BTC/ETH. Reject future or materially old observations. Unusable rows are omitted and the actual included count is shown. Altcoins here excludes BTC and ETH as separate siblings.

- Group current capitalization is the sum of constituent market caps. Prior capitalization is current cap minus reported 24-hour market-cap change. Group percentage change is summed change divided by summed prior capitalization, never an unweighted average of coin price percentages.
- When the aggregate falls, the displayed contribution is each coin/group's loss divided by the sum of losses of all declining tracked coins. When it rises, use the equivalent sum of gains. Offsetting gains/losses are not used as a denominator that can produce misleading percentages over 100%. Groups partition the same coin set; nested percentages continue using the global tracked denominator.
- An ETH contribution of 80% means ETH accounts for 80% of the tracked gross market-cap increase (or decrease on the loss side), not 80% of cash inflow, volume, price return, or the net change. Market-cap changes include price, supply and coverage effects. The UI states the measurement and the included universe.
- Crypto's rolling 24-hour market-cap change differs from the previous-session ETF price change and UTC Coinbase daily candles; these labels remain distinct.
- Free public endpoint access worked during this task. It has no promised SLA; shared 15-minute cache limits requests, deduplicates concurrent callers, and preserves labeled stale data after failures. The underlying observation time is shown. First failure returns 503 rather than a synthetic breakdown. No key/account was created.
- Source remains attributed to [CoinGecko](https://www.coingecko.com/) in the panel; coin links use provider IDs. Arbitrary upstream URLs are not accepted.

Checks: added tests for latest-period selection, all-positive/all-negative/zero flows, null exclusions, exact cap-weighted returns, a synthetic 80% ETH contribution, stablecoin exclusion, group reconciliation, invalid/future/stale observations, insufficient classification, cache deduplication, stale preservation and initial failure. Full suite: **615 passed**, plus TypeScript and JavaScript syntax checks. Real-browser checks cover crypto group selection, Altcoin list, coin detail, back/close, daily-detail navigation, flow scope/category selection, pause, and responsive layout. Existing Three.js remains in the detailed flow view, while the brief uses smaller directional motion and respects reduced motion.


### Visual polish — market colors and sentiment scale

Market identity uses blue (equities/USD), gold (gold), teal (bonds), orange (oil/Bitcoin) and violet (crypto/altcoins), while lime/pink continue to indicate positive/negative changes in value. The colors are shared across the morning brief, daily asset marks, crypto groups and specialist cards, with darker text equivalents in light mode. Fear & Greed now uses a prominent score, a named mood, a five-band scale and an accessible meter; its source/date and distinction from flows or trade signals remain visible. Motion respects reduced-motion preferences. Specialist history columns keep enough width for dollar labels on small screens.

Checked the live local preview against the edited assets, desktop and 390px layouts in dark/light themes, crypto drill-down, meter accessibility text and console errors. Existing five Sentiment data/UI tests and JavaScript syntax checks passed. This polish does not change data sources, freshness or calculation methods.


### Copy and layout cleanup

Removed promotional headings, the trailing tab tagline, repeated click instructions and redundant captions across all three views. Section labels now name the data directly: market overview, seven-day returns and daily percentage changes. Dates, units, source links and stale-data notices remain visible; crypto contribution methodology is available in a native expandable disclosure. Verified the current preview assets, desktop and 390px layouts, and opening the methodology disclosure. JavaScript syntax and diff checks passed; calculations and data integrations are unchanged.


### Pre-merge data verification — 8 October 2026

A fresh, uncached audit at 15:29 Bangkok time fetched all 18 upstream responses through the production parsers. Both ICI scopes, all ten daily assets, gold, USD stablecoin supply, Fear & Greed and the non-stable crypto breakdown succeeded without stale fallbacks. Raw responses and the detailed audit report are retained locally under `.local/sentiment-audit/` (excluded from Git).

- ICI global Q2 2026: net sales USD 1.034T; seven exclusive categories reconcile. Cross-checked against the published net-sales table, not AUM or ETF memorandum rows.
- ICI US week ending 30 September, published 7 October: net outflow USD 1.969B; equities -4.655B, bonds +3.455B, mixed -0.345B and commodities -0.424B. Matches the source table in USD millions.
- Yahoo Finance: eight ETF references have their latest completed session on 7 October. Coinbase BTC/ETH use 8 October UTC provisional candles. Daily percentage calculations were independently recomputed from consecutive closes; the seven-day window includes calendar gaps.
- WGC: latest available monthly observation 30 September, USD 9.952215641B net gold ETF inflows, summing four aligned regions and excluding the gold-price series.
- DefiLlama: USD-pegged native circulating supply 312.076026454B, daily change -477.919281M on 8 October; not price-valued market capitalization.
- Alternative.me: 64 / Greed on 8 October. The backend now validates and retains the provider's classification; the UI translates it rather than assigning its own threshold label.
- CoinGecko: 83 usable non-stable assets from the top 100 at audit time. Group totals reconcile with individual caps and changes, and contribution percentages use gross gains or gross losses, not net fund flows. Live prices/caps naturally change after the audit.

Added regression assertions for future publication dates, observations after publication, and source sentiment classifications. Full suite: 615 passed; TypeScript and frontend syntax checks passed. Reviewed authentication, bounded upstream responses, fixed source URLs, output escaping, cache isolation and partial failure behavior. No new paid feed or private credential was added. Free upstream data can be delayed or revised; this is not a real-time census of all global capital. Yahoo's public chart endpoint remains unofficial.
