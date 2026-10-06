# Recent conversations performance

Validated locally on 2026-10-06, based on origin/main `3346bbd`.

## Behavior

- Open the dialog immediately from session memory. With no cached data, show a loading status immediately.
- Treat the list as fresh for 30 seconds; revalidate stale data in the background.
- Separate caches by account and workspace, clear them on account changes, and retain at most five workspace lists.
- Share an in-flight list request, allow only one dialog, preserve search and focused rows during updates, and offer retry on errors.
- Keep cached rows usable if revalidation fails. Reject responses from a previous workspace or superseded selection.
- Preserve local list changes if a response started before a rename, create or draft save.
- Fetch a fresh detail for the chosen conversation, followed by messages and images concurrently. Preserve the existing unsaved-draft check before switching.

## API and diagnostics

`GET /api/v1/conversations?view=summary` returns metadata without full drafts or owner IDs. The existing list without `view` retains its full response for existing consumers.

`GET /api/v1/conversations/:id` returns the selected detail with owner and optional workspace authorization. Missing and inaccessible conversations return 404.

Both routes expose database time through `Server-Timing: db;dur=...`. Browser Performance measures use `snaap:conversations:visible`, `up-to-date`, `list`, and `selection`. Only the latest sample of each phase is retained, without conversation text, account identifiers or credentials.

## Measurements

Real Chromium via Playwright, isolated local PostgreSQL fixtures, no AI calls or notifications. These measurements are not production latency guarantees.

For the matched comparison, both versions used the same server, database and list of 100 conversations. The original workbench source was loaded from the base commit through a browser test route. List requests were deliberately delayed by 1,000 ms.

| Measurement | Before | After |
| --- | ---: | ---: |
| Click to open dialog, including browser automation overhead | 1,396 ms | 129 ms |
| List requests during the stale-cache comparison | 1 | 1, in background |
| Full versus summary JSON response, 100 fixture conversations | 89,891 bytes | 29,915 bytes |

The updated browser's own measures recorded 65 ms to the visible phase and 1,112 ms to up-to-date content in the matched stale-cache run. Search text survived the background update.

Selecting a conversation issued one detail request and separate messages/images requests, without requesting the complete list again. With a 500 ms detail delay and 300 ms delays on both child requests, messages and images started in the same millisecond, the loading status was visible, and both user and assistant messages appeared. No JavaScript exceptions were observed in this final happy-path run.

## Verification

- `npm run typecheck`
- `npm test`: 541 passing tests, including 12 targeted cache/dialog/selection regressions.
- `npm run test:conversations`: real PostgreSQL checks for summary size, legacy compatibility, limits, effective titles, owner/workspace isolation, missing IDs and authentication.
- `npm run test:chat-save`: existing save/revision/history checks pass.
- `npm run check:publication`
- Browser checks: cached and stale lists, retained search, offline fallback and retry, workspace switching, selected detail and concurrent child loading.

For a fixture preview, use an unused local database port and run:

```powershell
$env:SNAAP_LOCAL_DB_PORT='55626'
node --import tsx scripts/conversation-performance-check.ts --serve
```

The preview serves this checkout at `http://127.0.0.1:4186`; sign in with the local test account. It uses an isolated schema and excludes live market/provider operations.

## Basis

- [Slack: cached content first, latest content asynchronously; visible and up-to-date measurements](https://slack.engineering/client-tracing-understanding-mobile-and-desktop-application-performance-at-scale/)
- [TanStack Query: freshness and background refetch](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [Slack: defer work and load only what is needed](https://slack.engineering/making-slack-faster-by-being-lazy/)

No persistent browser database, Service Worker, realtime transport, worker thread or speculative database index was added for this issue.
