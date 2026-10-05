# Integration validation, 2026-10-05

Task branch: `codex/ai-signal-research`. Integrated on main `d6a7a53`.
The previous checkout snapshot is preserved locally on
`codex/ai-signal-research-snapshot`; only the task delta is submitted.

## Compatibility

- Retained main's 20-condition limit, ten-pair setups, notification channels,
  soft deletion, admin routes, batch monitoring and startup UX.
- Signal explanations use the same flexible entry evaluation as the engine;
  nested AND groups report the actual matched/required condition counts.
- Preview retains chart timelines and aligns evidence to the evaluation frame.
- Pending entry explanations remain valid for active setups without exit stages.
- Risk edits and chat setup bindings reject soft-deleted setups.
- Saved plans remain separate from StrategySpec and frozen signal snapshots.
  SL/TP and outcomes describe price movement, not execution or trade profit.
- Monitoring adds no LLM calls. Offline ML remains disconnected from alerts.

## Verification

- Node unit tests: 488 passed, zero failed.
- Python research tests: four passed.
- TypeScript typecheck passed.
- General integration, chat save, Harness contracts, signal insights,
  notification, entry flexibility and admin integration suites passed.
- Ten persistent users across ten virtual days: 100 user-days,
  1,861 authenticated API requests and 200 local provider requests passed.
  The maximum-complexity fixture includes 20 conditions across five frames.
  This is accelerated simulation, not a ten-day production soak.
- Real-browser local fixture: direct chat save and activation, split chart and
  evidence, and ATR save into a new paused revision passed. Chat and split views
  had no horizontal page overflow at 320px. No console errors or warnings.
  Screenshot: `.local/merge-smoke.png` (ignored by Git).

Earlier audit documents retain their original test counts and limits; this
document records the final integration against the newer main branch.
