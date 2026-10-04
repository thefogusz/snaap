# Exchange history: Spot and Futures

Implemented 4 October 2026. One connection selects one market: Spot or Futures. The encrypted key and passphrase belong to that connection. Existing connections migrate to Spot. Users can add another connection for the other market; no combined-market selection is required.

## Routing and permissions

- All five clients (Binance, Bybit, OKX, Bitget, MEXC) select the matching market type. Market lookup rejects mismatched or ambiguous products instead of falling back to Spot.
- MEXC requires ACCOUNT_READ and DEAL_READ in the selected family (SPOT or CONTRACT), with known read-only permissions only. Futures-only keys do not need Spot rights in permission validation. The key-info query remains the existing CCXT signed metadata endpoint; real-key availability depends on the provider.
- Bybit readOnly, OKX read_only, Bitget read-only, and Binance read restrictions remain required. Actual trade-history requests still enforce provider permissions for the selected instrument. There are no order or transfer calls.
- Futures symbols retain their settlement and expiry, e.g. BTC/USDT:USDT. A base pair is resolved only when there is exactly one valid matching contract.
- Binance selects linear/inverse endpoints through the resolved contract; Bybit uses spot/linear/inverse category; OKX uses the instrument type; Bitget uses its classic or UTA routing; MEXC uses the contract trade-history endpoint.

## Records and limits

Rows preserve market and full instrument identity. Futures retain contracts, contractSize and settlement; quantity is base-asset quantity, accounting for linear/inverse contracts. Position side is retained only when explicit provider data supports it; buy does not automatically mean Long. Legacy file rows default to Spot. The CSV template and preview include market.

Each sync requests at most 100 fills in a bounded seven-day window from the selected start date. This is a partial fill history, not a full account statement, PnL ledger, funding history or reconstruction of positions. Provider retention limits still apply. Deduplication includes market and instrument, within the existing account scope. Existing data survives failed syncs.

## Verification

- 79 unit tests passed after adding market routing, scoped permissions, normalization and duplicate-ID separation tests.
- PostgreSQL integration covers all five exchanges × both markets, read/write permission rejection, encrypted credentials/passphrase, ownership, sync/deduplication, failed-sync preservation and disconnect.
- Real installed CCXT request signing/routing is tested with intercepted read requests; no external keys or trade calls are used.
- Browser checks cover single-market submission, MEXC instructions, account labels, correct pair defaults and desktop/mobile overflow. Corrected submission feedback to target the submit button, preserving custom combobox markup.
- These are fixture tests, not certification with live user credentials. Real exchange connection and import require the user's configured key to succeed.

Sources reviewed: [Bybit key information](https://bybit-exchange.github.io/docs/v5/user/apikey-info), [OKX API guide](https://www.okx.com/docs-v5/), [Bitget account settings](https://www.bitget.com/docs/catalog/account/account-settings), [MEXC API](https://www.mexc.com/api-docs/futures/account-and-trading-endpoints), [Binance wallet account API](https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account), and installed CCXT implementation.
