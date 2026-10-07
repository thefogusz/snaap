# Multiple pairs in one setup

The pair picker offers single, multiple and all-supported selection. Changes are local to the dialog until confirmed. Search filters the displayed rows, not the selection; selecting all includes the full fetched catalog, not just the first 100 visible results. All is a snapshot: new listings are not added automatically. Market changes invalidate a pending selection.

The stored strategy uses the existing `pairs` array, now supporting up to 5,000 unique symbols. The LLM can propose multiple verified pairs and must preserve existing pair selections when changing unrelated conditions. Shared chat cards abbreviate large pair lists.

The monitor already evaluates targets separately by rule revision, exchange and pair. Signal lifecycle/checkpoints and job singleton keys are isolated per target. A setup's entry/exit conditions are reused independently; one pair's entry does not open another pair's signal lifecycle. These are alerts, not exchange orders.

Chart pair selection affects only the preview request, which receives a one-pair copy. It does not mutate or reduce the saved strategy's pairs.

Activation checks every selected symbol against the supported catalog. Up to ten pairs keep synchronous historical warmup; larger sets fetch historical candles in the monitor per target, avoiding hundreds of sequential REST reads inside a single HTTP request. This means large sets require initial preparation time, and actual throughput depends on exchange rate limits and server capacity. This change does not certify real-time throughput for an entire exchange. API and UI limits must remain aligned.
