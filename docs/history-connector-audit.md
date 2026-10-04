# History connector audit — 2026-10-04

## Scope and evidence

Reviewed Binance, Bybit, OKX, Bitget and MEXC permission verification and authenticated history requests separately for Spot and Futures. No orders, transfers or withdrawals were submitted. No credentials are included in this report.

The real CCXT clients construct and sign requests in the contract tests; exchange responses are fixtures intercepted before network transmission. These tests do not prove account eligibility, actual API-key scopes or live service availability.

| Exchange | Permission endpoint | Spot history | Futures history | Live account evidence |
| --- | --- | --- | --- | --- |
| Binance | `/sapi/v1/account/apiRestrictions` | `/api/v3/myTrades` | `/fapi/v1/userTrades` for linear contracts | No supplied key |
| Bybit | `/v5/user/query-api` | `/v5/execution/list`, category spot | Same endpoint, category linear/inverse | No supplied key |
| OKX | `/api/v5/account/config` | `/api/v5/trade/fills-history`, SPOT | Same endpoint, SWAP | No supplied key |
| Bitget | `/api/v3/account/info` | Classic v2 spot fills / UTA v3 fills | Classic v2 mix fills / UTA v3 fills | No supplied key |
| MEXC | Spot: direct `/api/v3/myTrades`; Futures: direct order-history read | `/api/v3/myTrades` | Contract order-deals endpoint | Supplied Futures key connected through UI; BTC/USDT:USDT sync from 2026-10-01 succeeded with 0 fills; connection and sync state survived refresh |

## Changes

- Binance additionally rejects supplied FIX API trading and portfolio margin trading flags unless explicitly false. Older responses may omit these newer flags; existing mandatory checks remain strict.
- Bitget UTA history now sends symbol and category before the provider applies its page limit. Tests cover SPOT, USDT-FUTURES, USDC-FUTURES and COIN-FUTURES. Classic routing remains separate.
- History ingestion checks exact normalized symbol and inclusive requested timestamps, in addition to valid IDs, prices, amounts and sides.
- MEXC now verifies order-history read access directly for Spot and Futures. All five connectors use HTTPS GET allowlists restricted to public instrument metadata, key permission metadata and fill/order history. Wallet, balance and asset requests and all writes are blocked before transport. Private currency discovery is disabled for all clients. Bitget UTA/classic discovery probes fill history instead of account settings. Other exchanges retain key read-only verification without reading balances.

## Verification

- Focused history/import checks: 40 passed.
- Full suite after MEXC read-access implementation: 337 passed, 0 failed.
- TypeScript: passed.
- Each exchange/market combination checks signed permission request, selected symbol, market routing and date bounds using fixtures.
- Existing checks cover duplicate fills, inverse/linear quantities, market ambiguity, credential encryption and sanitized errors.

## Remaining limits

- MEXC Futures-only keys can connect through direct read-scope verification. This proves the requested read access, not the absence of other key privileges. Use only View Order Details for the selected market; View Account Details is no longer required. Snaap’s transport remains limited to approved reads.
- Bitget classic/UTA detection follows installed CCXT behavior; CCXT treats failed account-settings probes as classic. Live account tests must include restricted scopes, network failures and accounts being upgraded.
- Live verification is still required for the four exchanges without supplied credentials, including regional hosts, account modes and API whitelist restrictions.
- Sync fetches one bounded page (up to 100 records over at most seven days); it does not establish complete account history.

## Primary references

- [Binance permission fields](https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account)
- [Bybit API key information](https://bybit-exchange.github.io/docs/v5/user/apikey-info)
- [OKX account configuration](https://www.okx.com/docs-v5/en/)
- [Bitget account information and settings](https://www.bitget.com/docs/catalog/account/account-settings)
- [Bitget classic/UTA migration](https://www.bitgetapps.com/docs/classic/uta-api-upgrade-guide)
- [MEXC error code definitions](https://mexcdevelop.github.io/apidocs/spot_v3_en/)

## Least-data update — 2026-10-04

- Binance and Bybit retain API-key permission queries. OKX retains account/config only for the key permission field; Bitget retains account/info only for read-only key attestation. None of these results are stored in imports or sent to the LLM.
- OKX and some other exchanges bundle order history and account access in one Read permission; Snaap cannot change the exchange permission model, but its connector rejects balance/asset endpoints.
- MEXC Spot tests order access with one BTCUSDT fill; Futures tests one history order. A successful empty response is valid access, not evidence of trading history.
- Bitget probes one UTA fill, falling back to one classic fill only if that route succeeds. The selected mode is held in the client, not inferred from account settings.
- Existing stored keys retain their exchange-side permissions. Users can remove unneeded account rights on the exchange; this change does not edit their keys remotely.
- This update was checked with TypeScript and JavaScript syntax validation. Live verification using keys for all five exchanges has not been performed. Earlier fixture/live results above precede this update.

## Connection privacy consent — 2026-10-04

New connection requests require privacyConsent=trade-history-v1. The UI shows the selected exchange/market, collected fill fields, encrypted connection credentials and user-assigned alias, and states that wallet balances/assets are not queried. It distinguishes MEXC's separate order-read permission from bundled Read scopes on other exchanges. Acceptance records the consent version and server timestamp with the connection; cancellation makes no connection request. Existing connections are not retroactively marked as consented. Deleting a connection removes its stored key but leaves existing imported trade history.
