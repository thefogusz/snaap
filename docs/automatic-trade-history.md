# Automatic trade history

API connections sync without a pair/date form. On connection, or first opening
My Data for an existing connection, the backend enables a background job.
It backfills up to 90 days; later completed jobs refresh every six hours with
a one-day overlap. The server must be running. Existing API imports remain.

The job uses public instrument metadata and approved read-only trade endpoints.
Bybit and OKX support history by market category. MEXC Futures discovers symbols
from paginated historical orders (no symbol required), then reads fills for each
symbol. Binance, MEXC Spot and Bitget scan public symbols for the selected market.
No account balances or assets are requested. MEXC order responses are only used
for symbol discovery; account/margin fields are not persisted.

Time windows are at most seven days, subdivided when a page contains 100 fills.
There is a safety budget of 64 requests per symbol/window and 100 discovery pages.
A saturated millisecond, exceeded budget or unavailable instrument marks the
result partial. Exchange retention limits and unavailable/delisted markets can
also reduce coverage. SYNCED_WINDOW means the requested bounded window was
processed, never lifetime account history. Failure retains saved progress and
offers a retry; restart resumes checkpoints. A PostgreSQL advisory lock serializes
workers across server processes. Disconnect is checked between units and before
persisting any data.

The API import accumulates deduplicated fills. Chat receives deterministic summary
counts across its available imported rows and up to 30 raw rows per source; it
does not receive all raw rows or any API credentials. These are observed fills,
not evidence of a user's intent, holding duration, leverage or risk tolerance.

My Data polls running jobs without replacing the whole page, and pauses UI
refresh while a field is being edited or the connection form is open. Completed
jobs refresh displayed imports. Failed jobs do not automatically loop on bad keys.

Implementation checks: TypeScript and JavaScript syntax checks. Real MEXC Futures
sync was observed importing fills; other exchanges were not exercised with live keys.
