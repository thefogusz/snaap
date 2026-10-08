# Sentiment — daily market context and weekly futures positioning

The default view gives a concise market brief. The seven-day view compares reference-asset prices. The third tab compares the weekly change in speculative futures positions across eight named contracts. Gold ETF fund flows, USD stablecoin supply and Bitcoin Fear & Greed remain separate measures. No view claims to observe transfers of money between all world markets.

## Data sources

| Source | Measurement | Cadence |
| --- | --- | --- |
| [CFTC Legacy Futures Only](https://publicreporting.cftc.gov/d/6dca-aqww) | Non-commercial long and short futures positions in S&P 500, MSCI EAFE, MSCI EM, US 10Y Treasury, gold, WTI, CME Bitcoin and CME Ether contracts | Weekly; six-hour successful cache |
| Yahoo Finance public chart endpoint | Price of SPY, EFA, EEM, TLT, GLD, USO, VNQ and UUP in USD | Daily bars; five-minute cache |
| [Coinbase Exchange candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles) | BTC-USD and ETH-USD prices on Coinbase | Daily UTC bars; five-minute cache |
| [World Gold Council](https://www.gold.org/goldhub/data/global-gold-backed-etf-holdings-and-flows) | Global physically backed gold ETF net flows, with four region columns summed | Latest weekly or monthly observation; one-hour cache |
| [DefiLlama stablecoins](https://defillama.com/stablecoins) | Daily change in circulating units of USD-pegged stablecoins | Daily; 15-minute cache |
| [Alternative.me](https://alternative.me/crypto/fear-and-greed-index/) | Bitcoin Fear & Greed index | Daily; 15-minute cache |
| [CoinGecko](https://docs.coingecko.com/reference/coins-markets) | 24-hour market-cap changes of tracked non-stable top-100 coins, split into BTC, ETH and altcoins | Rolling 24 hours; 15-minute cache |

The CFTC figures are calculated as `(noncomm_positions_long_all − noncomm_positions_short_all) / open_interest_all × 100`. A change between adjacent available reports is a difference in **percentage points of Open Interest**, not dollars or a count of newly purchased contracts. The eight contracts are proxies, not comprehensive market totals. The report observes Tuesday positions and is normally released Friday ([CFTC schedule](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm)); source observation dates remain visible. A missed report week does not turn a two-week difference into a one-week claim. The UI never sums contracts with different units. A zero-crossing means net positioning changed sign, not money moved from one market to another.

The CFTC API uses fixed contract codes and a bounded 12-week query. The parser requires valid report dates, safe integer long/short/open-interest values, no duplicate contract/date rows, and at least four markets with the latest two periods. It rejects future dates and malformed data. Successful reads are shared by the dashboard and harness for up to six hours. Failed refreshes keep only a previously successful in-process response with `stale: true`; a cold-start failure returns 503. There is no embedded CFTC or ICI snapshot.

Gold ETF flows are actual reported net flows, but stablecoin circulating-supply changes, market-cap changes, price returns, futures positions and Fear & Greed are different measurements. They are displayed with their own source and observation period. No free source connected here measures all capital moving across all world markets in real time.

The former ICI weekly/quarterly panels and embedded report snapshot were removed after Railway repeatedly received HTTP 403. [ICI's reuse policy](https://www.ici.org/copyright-and-linking-policies) also restricts mirroring and republication; the change does not route around its denial or silently replace its USD fund flows with CFTC values. The CFTC data are openly available through its [Public Reporting API](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ExplanatoryNotes/index.htm).

## Product and integration

The morning brief restores the large left-hand takeaway and animated comparison lanes, now ranking recent ETF price changes rather than implying cross-market fund flows. Detailed daily price tiles, gold ETF flow and stablecoin panels remain below. CFTC positioning appears only in its dedicated tab, where selecting a row opens contract detail and history. Selecting a brief asset opens its seven-day price view. Crypto expands from BTC/ETH/altcoins to tracked coins. Motion remains brief and respects reduced-motion preferences.

Authenticated endpoints: `/api/v1/sentiment/positioning`, `/api/v1/sentiment/daily`, `/api/v1/sentiment/specialists` and `/api/v1/sentiment/crypto-breakdown`. Harness `read_sentiment` accepts `positioning`, `daily`, `specialists` or `crypto-breakdown` and uses the same caches. Invalid datasets and arbitrary source URLs are rejected. The model instructions preserve source periods, stale/errors and the distinction between actual gold ETF flows and positioning/price/supply changes.

Daily ETF quotes use Yahoo Finance's unofficial public chart endpoint without a stability or redistribution guarantee. Coinbase's official public endpoint is polled conservatively. ETF prices are proxies and exclude dividends; missing calendar days are not filled, and unfinished bars are marked. Crypto market-cap contributions can reflect price, supply and coverage changes rather than cash flows. Stablecoin circulation changes do not establish deposits into BTC or ETH. The source-date labels are observation times, not proof of a live transaction feed.

## Verification

Local CFTC API read on 8 October 2026 returned eight named contracts and eleven consecutive Tuesday reports through 29 September. Tests cover parser validation, source failures, shared cache, cold-start 503, brief ranking, and harness evidence. This local result does not prove that Railway can reach CFTC; production egress must be checked after an authorized deployment.
