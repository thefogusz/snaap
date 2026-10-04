# Exchange pair catalog audit — 2026-10-04

Pair listings are loaded from public exchange APIs through the installed CCXT adapter, separately for the selected exchange and Spot/Perpetual Futures. Only positively active markets are admitted. The picker displays supported instruments; Futures currently requires linear USDT settlement. Listings cache for at most five minutes on access, with an explicit force refresh button. Failed refreshes show an error instead of mixing another source's pairs. Existing draft pairs are preserved on changing source, with a warning when unavailable; saving already validates pairs against the catalog.

Live public API check at 14:26 Bangkok:

| Exchange | Spot pairs | Supported USDT perpetual pairs |
|---|---:|---:|
| Binance | 1,372 | 740 |
| Bybit | 530 | 783 |
| OKX | 1,143 | 485 |
| Bitget | 3,386 | 813 |
| MEXC | 1,824 | 1,077 |

Counts describe this API snapshot, not a permanent listing guarantee. API-accessible markets can differ from the retail website or account/region eligibility. Raw evidence: `.local/audit/catalog-results.json`. All ten public catalog loads succeeded. No private credentials or order submission are needed.

Primary references:
- Binance exchangeInfo: https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/general
- Bybit instruments, category and pagination: https://bybit-exchange.github.io/docs/v5/market/instrument
- OKX public instruments and live state: https://www.okx.com/docs-v5
- Bitget spot symbols and online status: https://www.bitget.com/zh-CN/docs/catalog/classic-spot-market/classic-spot-market
- MEXC API-supported listings: https://www.mexc.com/mexc-api

Implementation validation: TypeScript typecheck and browser JavaScript syntax check passed. Browser checks exercise source selection, normalized pair search, explicit refresh and Spot/Futures separation. Refresh timestamps are displayed. Concurrent catalog requests share a single load per source. The dialog captures its source and refuses selection if a concurrent chat edit changes the draft source.
