# Account history connections

SNAAP supports Binance, Bybit, OKX, Bitget and MEXC Spot history through CCXT. Each sync is a bounded request for one selected pair, up to 100 records; it is explicitly partial, not a complete account export. CSV/XLSX remains available.

OKX and Bitget require the API passphrase, passed to CCXT as `password` and encrypted with the key/secret. No credentials are returned to the client. A server `DATA_ENCRYPTION_KEY` is required before connection is enabled.

Permission checks run before storage and again before each sync. Unknown permission responses fail closed. No permission checks use order creation, cancellation, transfers or withdrawal requests.

| Exchange | Permission read endpoint | Acceptance |
| --- | --- | --- |
| Binance | GET /sapi/v1/account/apiRestrictions | Reading enabled, all checked write permissions false |
| Bybit | GET /v5/user/query-api | Successful result with readOnly = 1 |
| OKX | GET /api/v5/account/config | Successful result with perm = read_only |
| Bitget | GET /api/v3/account/info | Successful result with permType = read-only |
| MEXC | GET /api/v3/apiKeyInfo with accessKey | VALID key, SPOT_ACCOUNT_READ, only documented read scopes |

MEXC's account `canTrade` field describes the account and is not used as proof of API key permissions. MEXC currently documents approximately one month of trade history through myTrades; older history requires export.

Official references checked 2026-10-04:
- https://www.mexc.com/api-docs/spot-v3/spot-account-trade/query-api-key-info
- https://www.mexc.com/api-docs/spot-v3/spot-account-trade/account-trade-list
- https://www.bitget.com/docs/catalog/account/account-settings
- https://tr.okx.com/docs-v5/en/ (account configuration / perm)

Validation: history unit tests exercise native CCXT signed GET requests and trade normalization against response fixtures. `npx tsx scripts/history-integration.ts` exercises connection, encrypted credentials, passphrase requirements, permission rejection, ownership, sync, deduplication, failure preservation and revocation with real PostgreSQL and mocked exchange responses. Browser QA covers all five options, conditional passphrase fields, mobile and both themes.

Private authenticated requests against real user accounts remain unverified until credentials are provided through the connection form; fixture tests are not live-account verification. Futures history and complete multi-page account synchronization are outside this implementation.

Local development initializes a persistent encryption key in `.local/data-encryption.key` when `DATA_ENCRYPTION_KEY` is absent. Preserve this file together with local database backups: replacing it prevents decryption of previously stored credentials. Production still requires an explicitly configured encryption key.
