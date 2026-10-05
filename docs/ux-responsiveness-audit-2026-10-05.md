# UX responsiveness repair — 2026-10-05

The initial repair was on `codex/responsive-ux`; the integration branch is
`codex/responsive-ux-current`, based on the latest `origin/main`. No manual production
deployment was performed.

## Findings and changes

- Startup hid the entire application while waiting for sequential health, account,
  workspace, rules, account again, conversations, destinations and context requests.
  Show the initialized application frame before network recovery, fetch independent
  requests together, and load unused context in the background. Controls in the main
  content remain unavailable until the authenticated workspace is ready.
- My Data replaced its whole DOM on every menu click, then fetched and inserted
  imports, connections and images sequentially. Fetch the three datasets together,
  assemble the final page offscreen, and publish it once. Returning to the menu keeps
  its existing DOM, typed text and disclosures. Mutations and explicit refresh still
  update it. Avoid auto-sync refresh while an import form is open.
- Navigation and chat/split transitions delayed rendering. Apply menu and mode
  changes immediately.
- Preview requests used the same key for requested and successfully rendered data,
  while setup events could invalidate in-flight previews. Track pending and rendered
  keys separately, share identical pending work, refresh on visibility, and reject
  superseded responses. Debounce edits for 120 ms instead of 450 ms.
- Activation waited for candle history for every pair (up to ten pairs), although
  the monitor already prepares and evaluates market series. Keep instrument,
  ownership, revision, confirmation, quota and destination validation; let the monitor
  prepare candles and report market readiness independently.
- Activation/pause and saving re-fetched unrelated account/conversation data before
  feedback. Use the returned saved rule to update the UI immediately, display pending
  states, prevent duplicate submissions, and notify after server success. Failed
  requests restore retryable controls. Channel connection/disconnection also reports
  pending and successful results.
- Notification reads share in-flight work and reuse data for 30 seconds during menu
  navigation. Explicit refresh still fetches. Reads and history publication check
  workspace identity so an old response cannot replace another workspace's page.

## Browser verification

Compared the original files from Git HEAD with the modified files using a localhost
static fixture and Chromium driven by Playwright CLI. API requests were delayed
350 ms each, and preview was delayed 650 ms. Google Fonts was stubbed. These are
controlled local measurements, not production timings or Core Web Vitals.

| Check | Original | Modified |
| --- | --- | --- |
| Application frame visible | 2.97 s | 0.11–0.17 s |
| Main content ready | 2.97–2.98 s | 1.18–1.23 s |
| My Data requests on return | Three endpoint requests | Zero |
| Typed import label after return | Cleared | Preserved |
| Activation button pending state | Missing | Immediate |
| Pause confirmation | Missing / preceding activation message | Correct pause toast |
| Chart after opening split | Rendered | Rendered, no manual refresh |
| JavaScript runtime exceptions | Zero | Zero |

Also verified rejected activation leaves the rule paused and controls retryable,
save reports pending and success, and switching workspaces removes the preceding
workspace's rules and import form input. Tests use synthetic account/market fixtures;
they do not send notifications to real channels.

Local browser fixture and driver are preserved in `.local/ux-fixture.mjs` and
`.local/ux-browser.cjs`; screenshot: `.local/ux-fixed-notifications.png`.

## Automated validation

- `npm run typecheck`: passed.
- Initial snapshot `npm test`: 366 passed. After integrating with current main:
  448 passed, including four new chart lifecycle regression tests and updated history
  tests covering stale responses, independent read failures and the timeout deadline.
- `npm run test:integration`: passed; includes authenticated ownership, revisions,
  activation/quota, durable monitoring, workspace isolation and persistence.
- JavaScript syntax checks and `git diff --check`: passed.

Live exchange latency, cold server startup, real account recovery and production
browser/network conditions still require measurement after deployment. Activation
success means monitoring is enabled; market readiness appears separately in the
notification status view.

## Verification against current main before merge

The repository's latest main has a separate root history and already includes newer
startup parallelization, direct activation switches, multi-timeframe charts and signal
validity cards. Ported this repair onto that version while preserving those features,
account-ready events, reusable account data, history read cancellation and the 12-second
deadline. History assembles available results together even if one endpoint fails.

Repeated the Chromium fixture comparison against that current main: application frame
visible in 0.88 s before and 0.17 s after; main content ready in 0.89 s before and 0.91 s
after. API work is still required before interaction; the improvement here is earlier
display and removal of repeated navigation reads. Returning to My Data made no new
imports/connections/images requests and preserved input. Multi-timeframe chart rendering,
direct activation, pause, rejected activation, saving and workspace switching passed
with zero JavaScript runtime exceptions. Typecheck, publication scan, all 448 tests,
and backend integration passed on this version. Earlier timing results above describe
the initial snapshot and must not be interpreted as current production measurements.
