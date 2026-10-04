# Trade setup directions

Futures setup controls select Long (ซื้อ), Short (ขาย), or both. A single Short directly edits actual Short conditions, with no automatic reversal. Selecting both reveals an optional automatic mirroring checkbox; turning it off exposes a separate Short condition editor. Switching from BOTH to Short retains that branch, including independent optional exits/cancels. Existing single Short templates are materialized in the editor without changing signal behavior. Both produces independently tracked Long and Short signal lifecycles, not two identical entries. Spot is labelled Spot (ซื้อ).

New mirrored setups retain a Long condition template and `mirrorShort: true` with `side: SHORT | BOTH`. The server derives the Short branch using the same shared module used for the editor summary. Comparisons `>`/`<`, `>=`/`<=`, and crossing direction reverse. Constants, indicator formulas, AND/OR groups, hold durations, stage deadlines and cooldowns stay unchanged. Exit/cancel comparisons involving ENTRY_RETURN retain their operator because return is already positive for favorable movement on either side. Short return is `(1 - close/entryPrice) * 100`; this is price movement, without leverage, fees or a claim of executed P&L. No thresholds are automatically optimized.

Explicit independent `short` branches remain supported for imported/AI-proposed BOTH setups; they are mutually exclusive with mirrorShort. Direction is included in every event and deduplication key. Checkpoints hold independent states for both branches. Replay, preview, chart evidence and monitoring use the same evaluator.

Historical signal labels use the event fields, falling back to the matching saved setup revision. Old Futures events lacking direction remain unspecified; the current edited setup is never used to relabel them. Legacy Futures setups can be opened to select a direction, but cannot start monitoring without one. Existing active ambiguous setups report DIRECTION_REQUIRED until edited.

These are signal labels, not proof of submitted orders or live exchange positions. Trading accounts and screenshots do not determine a setup direction automatically.
