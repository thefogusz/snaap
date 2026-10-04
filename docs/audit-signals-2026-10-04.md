# Signal and chart data audit — 4 October 2026

## Scope and isolation

Accelerated deterministic simulation, **not ten elapsed days of production operation**. Ten trader personas run over ten synthetic days. Tests operate on synthetic candles and a replaced CCXT constructor inside an isolated test worker. No user records, API credentials, actual trades, enabled setups, or external notification channels are changed.

The audit covers the rule engine, replay parity, serializable checkpoints, stream subscription behavior, and the market data cache. It does not independently prove real exchange latency, PostgreSQL transaction behavior, or delivery-provider reliability.

## Simulation evidence

| Persona | Timeframe | Closed bars in fixture | Synthetic signals |
|---|---|---:|---:|
| Beginner Spot | 5m | 2,880 | 275 |
| Short-term Long | 5m | 2,880 | 275 |
| Short-term Short | 5m | 2,880 | 274 |
| Both directions | 15m | 960 | 183 |
| Confirmation stage | 15m | 960 | 90 |
| Price-based exit | 1h | 240 | 23 |
| Pause and resume | 5m | 2,880 | 248 |
| Revision on day five | 15m | 960 | 90 |
| Missing data intervals | 5m | 2,863 | 269 |
| Missing higher timeframe | 1h | 240 | 0 |
| **Total** | | **17,743** | **1,727** |

Paused persona intentionally skips one simulated day. The counts above describe fixture rows; only 17,455 unique rows are advanced during monitoring simulation. Replay is separately evaluated against the corresponding active periods. Duplicate and older updates are additionally passed through the engine and must yield no events.

Assertions passed:

- Incremental processing and replay produce identical events where applicable.
- JSON checkpoint round trips do not change results.
- Repeated and out-of-order candle updates cannot duplicate or rewind signals.
- Paused windows produce no signals; resumed windows start a fresh lifecycle.
- A changed revision starts a new lifecycle with the new condition.
- Missing candles cancel in-progress signals with UNKNOWN evidence rather than inventing exits.
- Missing required higher-timeframe data generates no entries.
- Forming, future, and invalid candles are excluded from stream close evidence.
- Exchange/market/frame subscription groups keep targets separated.
- Updating a target revision refreshes listeners without creating an extra exchange client.
- Unsubscribing closes a client; resubscribing creates a new one.

## Found and fixed: accepted indicator can remain UNKNOWN forever

**Affected:** TEMA with period 500, and potentially other indicators requiring more than 1,000 warmup bars.

Production path reproduction replaces the Binance constructor with an in-memory REST fixture. `strategySeries()` correctly requests 2,032 warmup bars. Previously, `mergeCandles()` discarded everything beyond the newest 1,000. TEMA 500 has insufficient warmup at 1,000 bars and returns undefined, while the same indicator is finite with the requested history.

Pre-fix regression failed with `market fetch must retain requested warmup`. Fix in `src/markets.ts` keeps the requested REST window, bounded at 2,400 bars to match the existing eight-page × 300-row fetch budget. Stream updates also preserve the length of the existing REST cache. The standalone stream buffer remains bounded at 1,000 bars.

Post-fix regression confirms 2,032 retained bars and finite TEMA 500 evidence, including after a stream update.

Memory impact: only requests with a longer warmup retain a larger REST cache. Each cache entry remains bounded; the existing 500-entry cache cap is unchanged.

## Remaining limitation: freshness status can be optimistic

The mocked REST path returned a latest close **one complete 5m bar behind** the expected close. The data was accepted and exchange health reported READY. The market fetch currently rejects only when the newest closed bar is older than two timeframe widths; it does not require the latest expected close before reporting READY.

This is a demonstrated tolerance in the implementation, not proof that live exchanges actually lag by that duration. A graph or monitor can nevertheless appear healthy while operating on delayed data within this tolerance. A future improvement should distinguish connected versus caught-up status, show the latest candle timestamp, and use a short settling grace period around candle-close boundaries rather than silently labeling stale-but-tolerated data as current.

## Commands and results

Initial existing focused run: **153 passed, 0 failed**.

```powershell
node --import tsx --test tests/engine.test.ts tests/realtime.test.ts tests/preview.test.ts tests/trade-sides.test.ts tests/setup-matrix.test.ts tests/extended-indicators.test.ts tests/indicator-audit.test.ts
```

Post-fix combined run: **168 passed, 0 failed** (153 existing tests plus 15 audit tests, including ten persona subtests).

```powershell
node --import tsx --test tests/signals-market-window-audit.test.ts tests/signals-ten-day-audit.test.ts tests/realtime.test.ts tests/engine.test.ts tests/preview.test.ts tests/setup-matrix.test.ts tests/trade-sides.test.ts tests/extended-indicators.test.ts tests/indicator-audit.test.ts
```

The additional stream-retention assertion was added afterward and the two market-window tests passed again.

`npm run typecheck` initially encountered an unrelated TS2554 error in another audit file. After that file was repaired, the command was rerun and **passed**.

## Explicit limits

- Synthetic prices are not investment performance evidence; event counts do not measure profitability.
- Pure-engine pause/revision simulation mirrors intended lifecycle resets but does not replace database integration tests.
- No live REST or WebSocket requests were made by this audit.
- Stream reconnect on an actual network failure and the retry timer were inspected in source; live provider reconnect behavior was not measured.
- No notifications were sent. Delivery retries and end-to-end channel latency require a separate isolated integration fixture.
- Actual chart refresh remains a client polling concern; this audit validates the candle data path rather than visual animation or browser resize behavior.
