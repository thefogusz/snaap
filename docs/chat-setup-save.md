# Save a setup inside chat

The accepted AI draft now ends with the same durable setup card used by presets.
Users review its plain-language conditions, save it, and explicitly enable or pause
alerts without opening the advanced editor. Chat stays selected after a response.
Verified external destinations remain optional; the in-app inbox is the default.

`POST /conversations/:id/setup-card` materializes the persisted draft at an expected
revision. A conversation lock deduplicates retries. Refinements inherit the saved
rule from the preceding card (or an explicitly selected, owned rule in the same
workspace). Choosing a fresh preset still starts a separate setup.

`POST /conversations/:id/setup-card/:messageId/save` and the compatible preset save
route share the transactional implementation. Only the latest card can save; draft
and rule revision conflicts are rejected. Existing rules retain their risk plan and
revision history. Saving changes pauses alerts until the user explicitly enables
them again. Editor saves update the durable card binding as well.

Cards survive chat reloads. Older AI conversations with recorded setup changes can
materialize the current draft's save card when opened. Older cards collapse into
historical summaries. A failed card request offers a retry inside chat.

No model request is made to create, save, or activate a card. UI-only setup messages
are excluded from model conversation history. AI prompts and drafting tools are
unchanged.

Validation:

- `npm run test:chat-save`: isolated PostgreSQL schema; retry deduplication,
  revision conflicts, owner/workspace isolation, saved-rule reuse, preset
  compatibility, editor binding, ATR setting preservation, activation/pause,
  and no AI usage ledger entries.
- `npm run test:harness`: local fake provider, including exclusion of UI-only cards.
- `npm test` and `npm run typecheck`.
- Browser check using `scripts/chat-save-integration.ts --serve`: deterministic
  fake chat response, save/activate/pause/reload, desktop and 390px mobile viewport,
  no horizontal overflow or console errors. This fixture makes no AI calls and
  runs no notification worker. Screenshots are in `.local/chat-save-*.png`.

No push, merge, or deployment is included.
