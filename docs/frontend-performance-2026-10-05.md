# Frontend performance checks — 2026-10-05

The control decorators and custom selects previously queried the whole document
after unrelated DOM insertions. They now process changed controls and added
subtrees only. Sibling insertions share one parent pass, and nested roots are
deduplicated by walking ancestors rather than comparing every pair of roots.

Startup no longer requests `/context` when My Data is off. Enabling My Data
still fetches current context and images, now concurrently. Restoring a draft
with My Data enabled retains its existing loading and recovery behavior.

## Browser comparison

Chrome via Playwright CLI, against the existing localhost server, with the three
frontend scripts served from either the `origin/main` snapshot or this branch.
Both runs use the same local test account and API server. This is a controlled
frontend comparison, not a production network or exchange latency measurement.

| Scenario | Before | After |
| --- | ---: | ---: |
| Whole-document `querySelectorAll` calls while appending 60 text fragments, 16 ms apart | 1,920–1,952 | 0 |
| Whole-document selector calls during startup (latest comparison) | 307 | 41 |
| `/context` requests at startup with My Data off | 1 | 0 |

The fragment scenario isolates unnecessary global scans; scoped selector work
still occurs where needed. No long tasks were observed in these runs. Local
startup varied between runs, so no general page-load speedup is claimed.

Browser checks passed for adding selects/buttons, changing option text and
disabled state, updating decorated button labels, removing an open select menu,
and decorating a 500-button batch. My Data toggling and the chat/designer view
were checked, with no browser console errors.

## Automated validation

- Nine new regression tests exercise observer scheduling, sibling batches,
  select updates/removal, and concurrent My Data loading.
- Type checking, full unit suite, and integration checks pass.
- Load check: 100 isolated concurrent users, 300 authenticated reads,
  135 ms total, 128 ms user p95, zero failures. This excludes AI/market load.
- Independent code review found and resolved a potential quadratic sibling
  processing path before merge.

The integration script still expected the former three-active-setup Free limit.
Its boundary assertions now verify the current six-active-setup limit; backend
quota behavior was not changed.
