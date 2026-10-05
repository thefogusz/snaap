# Signal insights implementation

## Current behavior

Signal cards show the signal, direction, setup, reference price and time.
Post-signal price tracking and ATR plans were removed at the user's request.
There are no excursions, 20-bar outcome windows or SL/TP tracking controls.

Retained features:

- Break/retest presets and existing lifecycle signal generation.
- Chart condition evidence, per-timeframe progress and stage deadlines.
- Monitor data freshness, gap detection and checkpoint recovery.
- Recovered signals remain marked and do not receive external deliveries.
- Chat setup saves, revisions, activation, sharing and file import.

## Removal and compatibility

- The risk-plan and signal-outcome routes, calculation modules and worker are removed.
- Signals API no longer joins or returns outcome/risk snapshot data.
- Monitor startup deletes the retired `outcome` queue and its pending jobs.
- Database migration drops `signal_outcomes`, risk-plan columns and the revision
  snapshot trigger/function. Existing signals, setups and checkpoints remain.
- Migration unwraps old shared setup snapshots and discards their retired plan.
- Older setup files may contain `riskPlans`; these are accepted and discarded.
  Imported setups still start inactive with destinations cleared.
- AI harness and chat-save fixtures no longer depend on ATR-plan endpoints.
- ATR remains available as a normal strategy indicator.

## Validation

```text
npm run typecheck
npm test
npm run test:insights
npm run test:harness
npm run test:chat-save
npm run test:harness-smoke
```

Insights integration uses isolated fixture data without external delivery or
LLM calls. It verifies signals, deduplication, recovery, migration from tracking
schema, legacy imports/shares, revisions and workspace isolation. `--serve`
starts a local UI fixture at http://127.0.0.1:4175.
