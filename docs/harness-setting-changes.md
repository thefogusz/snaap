# Chat and setup changes

The chat and editor share one StrategySpec v2 draft. The harness can find instruments, propose a validated draft, and replay it. It cannot activate setups, change account permissions, or execute orders.

## Model compatibility

The current adapter uses OpenAI Responses API with text/image inputs, function calls, tool results, and server-side StrategySpec validation. A model must support those features before it can replace the current model. GPT-6 Luna and GPT-6.1 Sol document support for this contract; their actual Thai setup quality, tool reliability, latency and cost have not yet been evaluated in SNAAP. Anthropic and Gemini need provider adapters; changing the model environment variable alone does not integrate them.

Any model output is a proposal. The validated full spec is compared with the draft using the shared `dist/setup-changes.js` implementation. Added, removed and changed fields come from actual values, not the assistant's description. Unchanged key order does not create fake edits.

## User feedback

- After applying a proposal, chat shows a change receipt with readable field labels and before/after values.
- The receipt can reverse its changes only if the same conversation and exact resulting draft are still current. Later user edits cannot be overwritten by an older undo button.
- If a user edits during a model request, the proposal needs review. Applying it also creates a receipt and clears stale replay results.
- Changes affect the draft. Saving and activating remain separate explicit actions.
- Assistant message records retain `setup_changes` in PostgreSQL. Reopened chats label these as historical proposals, not confirmation of today's active settings or proof that a proposal was applied.
- Current editor undo also autosaves and invalidates stale replay output.

## Validation performed

Unit tests cover additions/removals, nested parameter changes, object key order, array changes and readable conditions. Browser fixtures cover applied receipts, undo, stale undo protection and mobile layouts in both themes. Fixtures do not call a live model. Real provider compatibility still requires API credentials and a representative Thai/image/tool evaluation.

Known scope: the current harness controls setup drafts, not every account setting. The receipt does not claim billing, destination connection credentials or active monitoring changed.
