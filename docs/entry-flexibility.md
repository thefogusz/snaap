# Entry matching percentage

Saved setups offer one **ปรับความยืดหยุ่น** slider: **ต้องผ่านอย่างน้อย (%)**, from 1 to 100. Every entry unit has equal weight. Eleven units at 80% require nine matches (round up). The preview beside the slider always shows the resulting whole number of units. There are no weights, required flags or crossing windows.

`StrategySpec v2.entryMatchPercent` is optional; omission or 100 preserves the original strict evaluator and evidence. A lower percentage flattens entry AND groups and counts each OR or HOLD group as one atomic unit, preserving their internal logic. UNKNOWN data is never a match. If unknown units could still determine the outcome, the result remains UNKNOWN. Exit, cancel, waiting stages, cooldown and cross timing retain their original semantics. Long and Short each evaluate their own entry against the same percentage; matches are never combined across sides.

Replay, preview, the harness's current evidence and durable monitoring use `evaluateEntry`. Harness proposals, saved revisions and setup exports retain the scalar setting. It is a matching proportion, not confidence or a claimed win rate.

`PUT /api/v1/rules/:id/entry-flexibility` accepts only `{expectedRevision, entryMatchPercent}`. It checks ownership/workspace and locks the current revision. An effective change creates a revision, retains the setup's active/paused state, clears monitoring checkpoints, and resets the active setup's evaluation start to the save time to prevent historical alert bursts. A no-op save retains the revision. Concurrent or stale saves receive 409. Other setup edits continue through the existing editor save path.

Verification: `npm test`, `npm run typecheck`, `npm run test:flexibility`, and `npm run test:harness`. The harness check uses a local Responses API fixture and deterministic public-market transport; it does not claim live-model evaluation. `scripts/entry-flexibility-ui-server.ts` creates an isolated schema and serves a disposable browser fixture on port 4188 without monitor workers or external deliveries.
