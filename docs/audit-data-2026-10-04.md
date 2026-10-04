# Data, privacy and lifecycle audit — 4 October 2026

## Scope and isolation

This audit used mock exchange transports and a newly generated PostgreSQL schema on the existing local PostgreSQL service. Its schema was removed after each run. No real exchange credentials, network exchange requests, real orders, LLM requests, or user records were used. The shared application and PostgreSQL service were not restarted or stopped.

The ten-day exercise is an accelerated sequence of user actions, not ten elapsed days of uptime. It covers ten independent authenticated fixture users, each with ten conversation sessions; it does not establish live market availability or long-term operating stability.

## Executed results

1. `node --import tsx --test tests/vault.test.ts tests/history.test.ts tests/history-markets.test.ts tests/history-futures-routing.test.ts tests/history-connector-matrix.test.ts tests/history-connection-errors.test.ts tests/mexc-history-read-guard.test.ts tests/imports.test.ts tests/trade-sides.test.ts tests/setup-files.test.ts tests/developer-pro.test.ts`
   - 54 tests passed, zero failures.
   - All five exchanges and both Spot/Futures signed routes tested with fixtures.
   - Credentials encrypted and bound to their owner; altered ciphertext fails.
   - Error messages redact credential values; position direction does not get invented from buy/sell alone.
2. `node --import tsx --test tests/audit-data-scope.test.ts`
   - First run: image deletion workspace regression failed, five transport tests passed.
   - After repair and additional condition limit coverage: seven tests passed, zero failures.
   - Writes, assets reads, foreign hosts, insecure URLs, custom ports and URL credentials are blocked before network access on all five history transports.
3. `node --import tsx scripts/audit-data-lifecycle.ts`
   - 884 assertions passed after both repairs.
   - 100 conversations across ten users × ten simulated sessions.
   - 30 setup saves succeeded; drafting alone does not mark a conversation saved.
   - 100 invalid seven-condition saves rejected and preserve unsaved state.
   - 100 Pro/deep calls rejected before billing; usage ledger remained empty.
   - Six simultaneous library image uploads accepted five and rejected the sixth; default names were 1–5.
   - Wrong-owner deletion does not delete the image; an image excluded from the current workspace stays protected.
   - Stale setup revision returns 409 and does not mark the conversation saved.
   - An additional image lifecycle save physically removes the chat image and its message reference, while retaining all five library images and the library message reference.
   - A preset save with a stale draft revision does not mark the conversation saved. A successful preset card save does mark it saved; repeating save reuses the same rule and does not create a second revision.

## Fixed finding

`DELETE /api/v1/images/:id` previously checked the owner but did not apply the selected workspace's image scope, although GET and PATCH did. A request containing the ID of an excluded image could delete it from another workspace belonging to the same user. It was not a cross-user leak.

The DELETE predicate now matches GET/PATCH scope checks. A regression test failed before the change and passed after; the actual isolated PostgreSQL reproduction also passed after repair. No existing user assets were accessed or deleted.

## Fixed preset status finding

The browser audit reported that saving a preset card produced a rule but left the conversation labeled as analysis-only. The isolated PostgreSQL test reproduced this: the save succeeded while `setup_saved_at` remained null. The preset save transaction now updates the conversation's saved timestamp and known-status flag together with its draft. The same test passes after repair; stale-revision rejection and repeat-save idempotency also pass. A fixture instrument catalog is injected only by the test, keeping production catalog lookup unchanged.

## Remaining limits and review items

- No live exchange account compatibility was exercised here; signing/normalization tests use actual CCXT adapters with mocked responses.
- Automatic six-hour polling, restart checkpoints and API rate limits were inspected in source but were not subjected to ten elapsed days of network operation by this audit.
- Existing `scripts/history-integration.ts` is stale: its connection payload does not include the now-required privacy consent literal and its MEXC permission fixture reflects an older endpoint. It was not run against the shared user database.
- Imports and connections also have owner-only DELETE predicates despite scoped listing. This should be reviewed as a workspace UX consistency issue; owners still control those records globally, so it is not evidence of cross-user access.
- A persistent database or filesystem failure after a setup transaction commits could affect the subsequent cleanup response. No such failure was reproduced; normal save and physical cleanup passed.
