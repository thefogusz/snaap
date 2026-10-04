# Monitoring capacity and operating model

## Implemented

- One shared public candle stream per exchange/market/pair/timeframe in each feed process. No LLM calls in monitoring.
- Recovery scans read durable checkpoints in one query and only enqueue targets whose primary candle has not been evaluated. Multi-timeframe alignment checks still run before advancing lifecycle state.
- Recovery jobs group targets by exchange/market/pair/primary timeframe; each payload contains at most 32 targets. Stream callbacks also use bounded batches. All job inserts are submitted in chunks of 250 rather than individual round trips.
- Active/revision checks and per-rule database locks remain authoritative. Checkpoints, signals, destination ownership and deduplication remain per setup/user. A batch retry can repeat already committed targets without generating duplicate signal rows.
- Confirmed contiguous candle history remains reusable until a newer close is due. REST adds missing candles with a one-bar overlap; gaps or a long outage trigger full warmup retrieval. Required warmup sizes remain separate cache keys so incompatible indicator seeds are not accidentally shared.
- Closed candle prefixes and existing extended-indicator results share weak caches. History arrays are immutable snapshots replaced on update; caches do not retain obsolete snapshots. Prefix cache holds at most 16 evaluation times per history array.
- Signal destinations are inserted in one SQL statement per signal. Delivery jobs use bulk insertion, including crash recovery. Retry attempts are bounded by the existing delivery implementation; pending work is recovered before higher-attempt retries.
- Active-owner quota and pending-delivery recovery have partial indexes. Completed market evaluation jobs are eligible for deletion after one hour; unused jobs have one-day retention. Signal/chat history is unaffected.
- A single `monitor_scan` log each minute records total/due targets, planned batches, scan duration, completed batch/target counts and maximum queue wait/processing duration. Failed batches remain observable through pg-boss errors/retries and recovery; these counters only count successful batches.

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

## Deployment and future scaling

Keep one application/feed instance initially. Legacy `evaluate` workers remain to drain jobs queued by the previous version; new work uses `evaluate-market`.

Do not blindly duplicate the complete app to scale monitoring: every process currently owns its own in-memory market cache and subscriptions. Next scale boundary should split feed/scheduling from evaluation/delivery workers, with a dedicated feed leader or partition ownership. Durable checkpoints and the queue already provide restart recovery, but cross-process price sharing and ownership coordination are not implemented here.

Before increasing capacity, observe maximum queue wait, batch duration, database pool contention, CPU/RAM, REST failures and provider throttling for representative markets. Adjust bounded batches/concurrency based on evidence. Large market bursts and many distinct pairs require a real load measurement; this document makes no capacity or latency guarantee.

Future changes that need separate measurements: shared indicator results across compatible warmup variants, per-destination rate limits and retry scheduling, durable market snapshots for multiple workers, paginated/streamed scheduling at much larger rule counts, and archiving old signal snapshots. Redis or another queue is not required for the current batching changes.

Pro remains unopened. Launch Free quota is six active setups across all workspaces and at most ten pairs per setup. The schema currently caps every setup at ten pairs while Pro is unopened; All is a coming-soon button. Saved legacy setups above ten pairs are retained but paused by migration, and must be reduced before reactivation. Chats and signal history are preserved.
