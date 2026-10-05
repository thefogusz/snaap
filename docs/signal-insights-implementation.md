# Signal insights implementation

Implemented on `codex/ai-signal-research`. No changes to AI text/image setup
drafting, no TradingView URL reader, and no LLM calls in the new monitoring path.

## User flows

- Presets → **ทะลุแล้วกลับทดสอบ**: choose Spot/Long/Short and enter a positive
  price level. Wait for a cross, then a wick touch with close on the breakout
  side within 10 bars, then two consecutive closes on that side within 5 bars.
  The retest close may count as the first of the two closes, following the
  existing `HOLD` semantics; every stage advances on a distinct closed bar.
  BOTH is rejected. The template consumes five of the existing six comparisons.
- Chart: per-branch progress, deadline and remaining bars; current waiting
  condition by timeframe; named operands and actual values in evidence. Replay
  timestamps never read future higher-timeframe candles. Historical replay
  progress is distinct from durable live monitor progress in Notifications.
- Notifications → Status: per-target/per-timeframe latest/expected close and
  check timestamp. States distinguish catching up, current, delayed, missing
  data, unavailable, paused, quota blocked and missing direction.
- Saved setups → **แผน ATR**: opt-in settings, default ATR14 / SL1.5 ATR / TP2R.
  Saving creates a revision and pauses the setup, matching setup-edit behavior.
  Reactivation uses the existing activation flow. No SL/TP alert or order is added.
- Notifications → Signals → expand **แผน ATR และผลหลังสัญญาณ**: frozen plan and
  20-bar excursions after ENTRY, touch ordering and data coverage. Recovered
  historical signals are marked and receive no external deliveries.

## Persistence and API

- `rules.risk_plan` is separate from StrategySpec. A revision-insert trigger
  captures it in `rule_revisions.risk_plan` for every existing save path.
  Existing setups default to NULL/off. Migration is idempotent.
- `PUT /api/v1/rules/:id/risk-plan` accepts `{expectedRevision,riskPlan}`;
  riskPlan fields are `enabled`, `atrPeriod` (2–100), `stopAtr` (0.1–20),
  `rewardRisk` (0.1–20). Missing settings receive defaults. Unknown fields fail.
  Owner/workspace and optimistic revision checks apply.
- `GET /api/v1/signals/:id/outcome` returns frozen risk, result, finalized state,
  original revision and event. Requires owner/workspace access. Non-ENTRY/legacy
  events without measured outcomes return 404.
- `/signals` adds `risk_snapshot` and `outcome`. `/monitor` adds `freshness` and
  `progress`; `/preview` adds freshness and per-branch explanations/progress/
  timeframe rows. Existing fields remain intact.
- `monitor_insights` stores target/revision context. `signal_outcomes` stores
  risk snapshots and up to 20 observed candles per signal, independently of the
  market cache. First persisted observations win over later exchange revisions.
- Existing share codes remain readable. New share snapshots include the separate
  risk plan. Setup-file v1 accepts an optional positional `riskPlans` array whose
  length must equal `setups`; omission leaves plans disabled. Account export
  also includes the plan. Import always starts inactive and clears destinations.

## Monitoring and measurement rules

- Freshness is checked against wall-clock closed-bar boundaries for every frame
  needed by the setup. A missing frame, gap or invalid candle blocks evaluation.
  Affected caches are invalidated so the next scan can recover via REST.
- Recovered bars advance the original engine sequentially. Only events at the
  latest expected close can create deliveries; deduplication remains unchanged.
- Snapshot ATR uses only data available at ENTRY. Missing warmup or nonpositive
  computed price levels yield an unavailable plan, never guessed levels.
- Outcome windows start on the next bar. Favorable/adverse excursions are
  side-adjusted, nonnegative percentages of reference price, not trade returns.
- Same-bar SL/TP touches are ambiguous. A gap before a touch makes first-touch
  order unknown. Missing coverage is incomplete; unfinished windows are pending.
- A separate queue updates outcomes even after a setup is paused or revised.
  Incomplete windows retry until two base bars after the window ends, then retain
  the incomplete result. Long downtime beyond fetched history cannot reconstruct
  missing data and is never counted as a loss or success.
- No legacy signal backfill, execution simulation, fees/slippage, probability
  score or autonomous ML promotion is included.

## Validation

```text
npm run typecheck
npm test
npm run test:integration
npm run test:insights
node --import tsx scripts/setup-files-integration.ts
.local/ml-venv/Scripts/python.exe -m unittest discover -s research -p test_shadow.py
```

The insights integration script uses an isolated PostgreSQL schema, fixture
candles, fake instrument catalog and no external delivery/LLM calls. `--serve`
keeps the fixture available at `http://127.0.0.1:4175` for UI checks.

Tests cover live/replay parity, stage expiry, higher-frame causality, fresh/gapped/
delayed data, recovery suppression/deduplication, side-aware ATR, same-bar touch
ambiguity, durable outcomes after pause, revision immutability, share/import,
owner/workspace isolation and zero LLM usage. Research tests verify chronological
purging and that changing test data cannot change trained/calibrated parameters.

See [research runner](../research/README.md) for setup, limitations and initial
365-day experiment results. These results do not justify using ML in live alerts.

Verified 2026-10-05: 388 Node unit tests, 4 Python research tests, TypeScript
typecheck, standard integration, insights integration, and setup-file/share
integration all passed. Browser checks exercised preset creation, ATR save,
stage progress, outcome disclosure and same-bar ambiguity. No console errors
or warnings were observed. Outcome detail was checked at 320px and desktop
widths without page overflow. Local fixture screenshot:
`.local/signal-insights-desktop.png` (not production market performance).
