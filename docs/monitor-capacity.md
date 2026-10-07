# Monitoring capacity and operating model

## Implemented

- One shared public candle stream per exchange/market/pair/timeframe in each feed process. No LLM calls in monitoring.
- Recovery scans read durable checkpoints in one query and only enqueue targets whose primary candle has not been evaluated. Multi-timeframe alignment checks still run before advancing lifecycle state.
- Recovery jobs group targets by exchange/market/pair/primary timeframe; each payload contains at most 32 targets. Stream callbacks also use bounded batches. All job inserts are submitted in chunks of 250 rather than individual round trips.
- Active/revision checks and per-rule database locks remain authoritative. Checkpoints, signals, destination ownership and deduplication remain per setup/user. A batch retry can repeat already committed targets without generating duplicate signal rows.
- Confirmed contiguous candle history remains reusable until a newer close is due. REST adds missing candles with a one-bar overlap; gaps or a long outage trigger full warmup retrieval. Required warmup sizes remain separate cache keys so incompatible indicator seeds are not accidentally shared.
- Closed candle prefixes and existing extended-indicator results share weak caches. Identical closed-candle stream snapshots keep existing history arrays and indicator caches; new or corrected candles replace them. Prefix cache holds at most 16 evaluation times per history array.
- Signal destinations are inserted in one SQL statement per signal. Delivery jobs use bulk insertion, including crash recovery. Retry attempts are bounded by the existing delivery implementation; pending work is recovered before higher-attempt retries.
- Active-owner quota and pending-delivery recovery have partial indexes. Completed market evaluation jobs are eligible for deletion after one hour; unused jobs have one-day retention. Signal/chat history is unaffected.
- Access, service availability and active-rule quota are read in one SQL snapshot before fetching and again inside the commit transaction. Permissions are not cached across targets; restrictions or quota changes during a fetch still prevent committing a signal.
- A single `monitor_scan` log each minute records total/due targets, planned batches, scan duration, completed batch/target counts, maximum and p95 queue wait/processing duration, event-loop p95, interval Node CPU time, current Node RSS and waiting database clients. Market counters are cumulative since process start: cache hits, coalesced reads, REST requests/time and changed/unchanged stream updates. Failed batches remain observable through pg-boss errors/retries and recovery; completion counters only count successful batches.

## Local capacity calculation (not an exchange or database load test)

100 accounts, six setups each, all following the same ten pairs on the same exchange, market and 5m timeframe:

- Previous scheduler: 6,000 job insertions per scan, even if the candle was already processed.
- New scheduler at a due close: 190 bounded jobs (19 per pair); one local planner run took about 3 ms. Batched inserts require one queue call for these 190 jobs.
- Once all checkpoints reach the current close: no recovery evaluation jobs until the next primary close. Streams can still trigger jobs when additional required frames close, and workers recheck checkpoints.
- Rules still have 6,000 separate lifecycle states. A reduction in queue entries is not an equivalent reduction in CPU or the Railway bill. Unique pairs/markets/timeframes reduce opportunities for grouping.

## Verification on 2026-10-05 (local machine)

- All 362 unit tests passed, plus realtime integration checks for committed delivery IDs, signal deduplication, missing higher-frame protection and LISTEN/NOTIFY wakeup.
- 100 isolated authenticated users issued 300 API reads concurrently: zero failures, 130 ms total, 124 ms p95 per user's three reads. This uses Fastify injection and real local PostgreSQL, not Internet/browser round trips.
- 100 users x six active setups x ten shared pairs generated 6,000 evaluations and 6,000 owned signal rows through real PostgreSQL and pg-boss using a simulated closed candle. Each user had exactly 60 signals. Zero failed jobs.
- Initial worker polling: 32,519 ms to process the close; maximum observed queue wait 32,443 ms. Bounded fetch batches of eight plus burst mode: 4,248 ms, maximum wait 4,330 ms. This is a synthetic workload with no exchange network or external notification delivery.
- A duplicate pass produced no extra signals and did not invoke the market fetcher. Recovery planning returned zero groups after every checkpoint reached the current close.
- Observed Node RSS at the end of the burst run was 300 MB (not peak or total app+database hosting memory). Timings depend on the local machine and do not establish Railway throughput/cost.
- Free limit integration: ten-pair saves accepted; eleven-pair saves rejected; six activations accepted and the seventh rejected. Seven simultaneous activation requests on another account/workspace resulted in exactly six active rules.

TypeScript compilation passed. Real exchange feed latency, external notification bursts, production concurrency and actual Railway/LLM billing remain unmeasured.

## Measurement on 2026-10-07 (local machine, synthetic prices)

The existing PostgreSQL/pg-boss load check now accepts user count, source selection, worker concurrency and a time budget. Each user has six active setups following ten shared pairs at a 5m close. Every target uses a single simulated candle and a simple `PRICE > 100` rule with no destinations. Workers use production defaults: concurrency three, eight jobs per fetch, at most 32 targets per job. These are favorable conditions, excluding exchange traffic, indicator warmup, chart capture and notification delivery.

| Scenario | Targets | Signals | Close processing | Evaluation SQL | Peak sampled Node RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before: 1,000 users, one shared source | 60,000 | 60,000 | 179.6 s | 1,080,000 (18/target) | 388 MB |
| After: same workload | 60,000 | 60,000 | 100.6 s | 840,000 (14/target) | 469 MB |
| After: one source/user spread across five exchanges | 60,000 | 60,000 | 157.5 s | 840,000 (14/target) | 476 MB |
| After: every user follows all five exchanges | 300,000 | 153,968 before shutdown | **Did not finish within 300 s** | Partial run | 461 MB |

The first paired run reduced SQL round trips by 22.2% and elapsed time by about 44%. Node CPU time was 125.5 s before and 55.4 s after; event-loop p95 was 21.0/22.4 ms. This is one local comparison, sensitive to database caches and background activity, not a production throughput guarantee. SQL counts include application pool/transaction statements, excluding pg-boss and administrative polling. RSS is sampled every 100 ms for Node only, excluding PostgreSQL; it did not improve. Queue wait reached about 101 s for one source and 157 s for spread sources, so a passed five-minute budget does not imply prompt alerts.

The all-five case stopped after its time budget, failed the capacity assertion and cleaned its isolated schemas. Current single-process settings cannot be certified for that burst even with the simple fixture. A 1m timeframe or expensive indicators would have a tighter deadline. User count alone is not a capacity measure: count active setup/pair/source/timeframe targets and the latency they require.

A separate cache check replayed 5,000 identical 300-bar snapshots with four warmup variants. Before: 1,884 ms/1,922 ms Node CPU; after: 76 ms/94 ms Node CPU. Candle values, TEMA 500 evidence, corrected bars and simulated outage recovery matched. Both made 20 warmup REST requests. This measures the unchanged-update path only, not whole-application performance. Different warmup windows remain separate to preserve indicator seeds.

571 unit tests and TypeScript checks passed. Real PostgreSQL integration checks cover quota/permission changes during fetch, deduplication without refetch, lagging higher-frame checkpoints and scan metric emission. No new dependencies or paid data services were added.

Reproduce in PowerShell using a local test database (each monitoring run creates and removes only its own random schemas):

```powershell
$env:SNAAP_LOCAL_DB_PORT='55913' # choose the port of your local test PostgreSQL
node --import tsx scripts/monitor-load-check.ts 1000 1
node --import tsx scripts/monitor-load-check.ts 1000 spread
node --import tsx scripts/monitor-load-check.ts 1000 5 3 300000 # expected capacity failure on this machine
node --import tsx scripts/market-cache-load-check.ts
node --import tsx scripts/free-limits-check.ts
node --import tsx scripts/realtime-check.ts
```

Before measurements used monitor/cache code from commit `153fcb5`, with only the monitor's optional evaluation clock made consistent for historical fixtures. Live evaluation still uses the real clock. The benchmark freezes its injected close so crossing a wall-clock candle boundary does not turn a duplicate check into a different workload.

Instrumentation uses bounded native [Node performance histograms](https://nodejs.org/api/perf_hooks.html). If database wait or latency remains the bottleneck under real traffic, inspect slow statements with [PostgreSQL EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) before increasing worker concurrency.

## API responsiveness under monitoring (2026-10-07)

`--api-load` exercises authenticated `/me`, `/rules` and conversation-summary reads through the real Fastify handlers while evaluation jobs run. The API and monitor share one Node process and the production-sized eight-client database pool. Up to 100 fixture users each issue three sequential reads per burst, then wait three seconds before the next burst. Routes are warmed before one idle baseline burst. Every response must succeed and contain only the expected owner's data. The benchmark fails if it collects no samples during monitoring.

At 1,000 monitoring users / 60,000 targets with three evaluation workers:

| API route | Idle p95 (100 samples/route) | Under monitoring p95 (3,200 samples/route) | Under monitoring maximum |
| --- | ---: | ---: | ---: |
| Account (`/me`) | 117 ms | 153 ms | 188 ms |
| Setup list (`/rules`) | 100 ms | 118 ms | 143 ms |
| Conversation summary | 109 ms | 118 ms | 136 ms |

All 9,600 overlapping API reads and 60,000 signals passed ownership/count checks. Monitoring drained in 103.9 s; event-loop p95 was 20.9 ms. The pool had up to 95 pending acquisitions during bursts, which is expected with 100 readers and eight clients and does not alone justify a larger pool. This shows API response times can rise during monitoring; the earlier 180-to-101-second result described draining the signal queue, not a wait imposed on every UI action. This is idle-versus-busy on current code, not a before/after regression comparison.

An exploratory six-worker run drained the same target count in 60.5 s, with all 5,700 overlapping API reads and signals passing checks. Account/setup/conversation p95 under load was 162/140/137 ms (max 191/170/175 ms); its idle baseline was 40/40/44 ms. The substantial baseline variation between runs prevents attributing the full drain-time difference to concurrency alone. This is a promising candidate for repeated controlled tests with representative indicators, not evidence of an optimal production setting. Production remains at three evaluation workers.

Fastify injection excludes HTTP transport, browser rendering, Internet latency and LLM responses. Prices use the same simple one-candle fixture as above; conversations are empty and each owner has six rules. This does not certify responsiveness for expensive indicators, large chat histories, chart replay or all-five-source bursts. Application SQL totals include API work in this mode and are not reported as evaluation-only queries/target.

```powershell
$env:SNAAP_LOCAL_DB_PORT='55913'
node --import tsx scripts/monitor-load-check.ts 1000 1 3 300000 --api-load
node --import tsx scripts/monitor-load-check.ts 1000 1 6 300000 --api-load
```

Research priorities below are engineering judgement about benefit versus implementation/operating cost, not measured speedups:

| Candidate | Worth investigating | Condition / tradeoff |
| --- | --- | --- |
| Fewer SQL round trips in account reads and monitoring transactions | 5/5 | Profile statements first; retain owner, revision, deduplication and commit-time permission checks. No additional infrastructure. |
| Tune bounded evaluation concurrency | 4/5 | Compare API p95 and signal queue age together; a faster queue can consume API/database headroom. No new dependency. |
| Separate API and monitoring resource budgets | 3/5 | Reserve a bounded connection budget or split processes if real API latency rises. Separate pools still share database capacity; separate processes add RAM and feed ownership concerns. |
| Offload expensive indicator computation | 2/5 for this fixture | Useful when CPU profiles show long computation blocking API work. Worker communication/history copying adds overhead; this simple fixture does not justify it. |

The [node-postgres pool-sizing guide](https://node-postgres.com/guides/pool-sizing) advises considering total connections across instances and improving queries when connections are scarce. [Pool waitingCount](https://node-postgres.com/apis/pool) measures pending client acquisitions. [Node's event-loop guidance](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop) describes partitioning/offloading CPU work and the serialization cost of offloading. No new pools, threads, services or production concurrency settings were added for this research.

## Deployment and future scaling

Keep one application/feed instance initially. Legacy `evaluate` workers remain to drain jobs queued by the previous version; new work uses `evaluate-market`.

Do not blindly duplicate the complete app to scale monitoring: every process currently owns its own in-memory market cache and subscriptions. Next scale boundary should split feed/scheduling from evaluation/delivery workers, with a dedicated feed leader or partition ownership. Durable checkpoints and the queue already provide restart recovery, but cross-process price sharing and ownership coordination are not implemented here.

Before increasing capacity, observe maximum queue wait, batch duration, database pool contention, CPU/RAM, REST failures and provider throttling for representative markets. Adjust bounded batches/concurrency based on evidence. Large market bursts and many distinct pairs require a real load measurement; this document makes no capacity or latency guarantee.

Future changes that need separate measurements: shared indicator results across compatible warmup variants, per-destination rate limits and retry scheduling, durable market snapshots for multiple workers, paginated/streamed scheduling at much larger rule counts, and archiving old signal snapshots. Redis or another queue is not required for the current batching changes.

Current policy supports unified or Free/Pro limits configured by the administrator. The unified default has no active-setup cap; six setups/user above is a workload assumption, not a capacity safeguard. Each setup has a technical cap of ten distinct pairs and 50 explicit source/pair targets. Set a measured operational limit before opening unrestricted automation; this optimization does not change product quotas.
