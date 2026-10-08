# Refactor and audit — 8 October 2026

Snapshot: `809e374` (`origin/main`) plus the commits on `codex/refactor-audit`. This is a code review backed by the automated checks listed below. It is not a security certification or a production soak.

## Fixed in this pass

| Severity | Area | Defect | Fix |
| --- | --- | --- | --- |
| Critical | `src/api.ts`, `src/admin.ts` | The session and admin gates prefix-matched the raw `req.url`, but the router matches the percent-decoded path and also accepts absolute-form targets. `GET /api/v1/%61dmin/users` reached admin routes with any session and skipped the admin check. `GET /%61pi/v1/...` reached API routes with no session at all. Confirmed by a regression test that fails on the old code. | Every access decision now uses the matched route (`req.routeOptions.url`), falling back to the normalized path. Covered by `tests/route-gates.test.ts`. |
| High | `src/destinations.ts` | `deliver()` held `FOR UPDATE` on the user row when an admin notification limit applied. A LINE quota reservation runs on a second pooled connection, and its `notification_quota → users` foreign-key check needs `FOR KEY SHARE` on that same row. The two connections waited on each other forever, and pg-boss retries would eventually drain the 8-connection pool. | Lock with `FOR NO KEY UPDATE`. This still serializes deliveries for one owner but does not conflict with foreign-key checks. |
| High | `src/monitor.ts` | One active rule whose stored spec fails current validation made the whole `scan` throw. Nothing was scheduled, deliveries were not requeued and the heartbeat stopped. In a batch job, one throwing target skipped every target after it. | The scan uses `safeParse` and skips (and logs) invalid rules. Batch jobs evaluate every target, then rethrow the first failure so pg-boss still retries. Targets that already succeeded return early via their checkpoint. |
| Medium | `src/zip-limit.ts` | `read-excel-file` streams local ZIP headers, but the XLSX check summed central-directory sizes. A crafted file could declare small sizes, or hide local entries from the directory, and still inflate far beyond 30 MB. | Local entries are walked in order, as a streaming reader sees them, and each is inflated under the remaining budget. Sizes and methods must match the directory, and every byte before the directory must belong to a declared entry. Checked against real normal and data-descriptor XLSX files. |
| Medium | `src/api.ts`, `src/auth.ts` | With no `trustProxy`, every unauthenticated client behind Railway's edge shared one `req.ip`, and so one rate-limit bucket. One client could block Google login and provider webhooks for everyone. | Unauthenticated limits key on Railway's edge `X-Real-IP` (`CLIENT_IP_HEADER`). A first attempt with `TRUST_PROXY_HOPS=1` was measured in production to yield varying internal proxy addresses, so it is no longer the Railway default. Signed `/hooks/*` routes are exempt. OAuth routes get their own 20/min per-client limit. Local login checks the socket address. |
| Medium | `src/history-auto.ts` | Auto-sync wrote every trade into the oldest import and reset its `created_at`. The next sync then picked a different "oldest" row, so after alternating syncs several imports each held the full history. | The target is the largest import for the connection (the accumulated one), via a tested `accumulateImport`. Duplicates already stored are not removed. |
| Medium | `src/domain/insights.ts` | A gap anywhere in the 500–2,400 fetched bars marked the series `INSUFFICIENT`. That stalled the rule and forced a full refetch every minute until the gap scrolled out (about 21 days on 1h). | The monitor checks gaps only within each timeframe's indicator warmup. The warmup formula is shared with candle fetching (`indicatorWarmup`); fetch sizes are unchanged. |
| Low | `src/data/db.ts` | A failed `ROLLBACK` replaced the original error and returned a possibly broken client to the pool. | Rollback errors are caught, the original error is rethrown, and the client is released as broken. |
| Low | `src/network.ts` | The webhook timeout was idle-only, so a host that trickles a response could hold the request open indefinitely. | Added an overall 15 s deadline. |
| Low | `src/ai/harness.ts` | The 90 s run deadline was checked only between provider rounds, not between tool calls. If recording a failed run threw, the client got no error event. | Deadline is checked before each tool call. Failure recording is guarded so the client always receives the error; the stale-run reaper still cleans up. |
| Low | `src/monitor.ts` | pg-boss errors were logged without any detail. | The error name and code are logged (no message text, consistent with the existing logging policy). |

## Refactors (no behavior change)

- **One exchange enum and one CCXT id map:**
  - `exchangeSchema`, `ExchangeName` and `ccxtIds` are now defined in `src/domain/engine.ts`.
  - They replace nine `z.enum([...])` copies across `engine`, `files`, `markets`, `presets`, `studio` and `market-research`, plus the two identical id maps in `markets.ts` and `realtime.ts`.
  - Order is preserved. `history.ts` still has its own Gate-less list on purpose.
- **Telegram API helper:** the two byte-identical `call` closures in `telegram-destination.ts` are now one module-level `telegramCall`, with a shared `chatTypes` list. Each caller still maps every failure to its own `ApiError`, so the token never reaches a response.
- **SHA-256 helper:** `auth.ts` uses `hash` from `crypto.ts` instead of its own identical `digest`. Session hashes written at login and read by the gates now come from one function.
- **Dead code:** removed the unused `postDiscord`. Discord delivery goes through `notification-send.ts`.
- **Unused imports:** removed from `api.ts`, `destinations.ts`, `markets.ts` and `monitor.ts`. `tsc --noUnusedLocals` is now clean for `src/`.

## Open findings, not changed here

These need a product decision, provider testing, or a larger change than this pass should make.

### Medium

1. **AI quota refund on charged failures** (`src/ai/harness.ts`)
   - Every failure marks the ledger row `REFUNDED`, even after paid rounds: `AI_TOOL_LIMIT`, `AI_INCOMPLETE`, and `CONTEXT_CHANGED` after an edit mid-run.
   - **Deferred:** the current usage policy has no AI message limit, so there is no quota to evade yet.
   - Decide before launching Free/Pro limits: refund only when nothing was billed or the failure is provider-side, or cap refunds per month.
2. **Status churn** (`monitor.ts`)
   - Every evaluation writes `RECOVERING` and then `READY`.
   - This opens and resolves an admin incident per target per candle.
3. **Realtime reconnects all of an exchange's streams on any subscription change** (`realtime.ts`).
4. **History sync is serial across users and per-market** (`history-auto.ts`), so one large account can delay everyone.

### Low

- Delivery happens only when `event.time === latest`. If the queue lags more than one candle, a signal is stored as recovered and never sent.
- No count quota on chat images or imports.
- An admin's own session survives impersonation.
- The legacy unsigned-timestamp webhook signature header can be replayed.
- A client disconnect does not cancel the AI run.
- Process-wide research source budgets can be exhausted by one user.
- A bare `catch {}` around research tool errors drops the error kind from the trace.
- Preview cost is O(bars²) for long-warmup specs.

### Checked and sound

- **OAuth:** state, PKCE, nonce, aud/iss/azp and `email_verified` are all checked.
- **Session cookies:** flags are correct and hashes are stored server-side.
- **CSRF:** custom header, Origin check, Sec-Fetch-Site check and Host allowlist.
- **Webhooks:** Stripe, LINE and Telegram signatures are verified.
- **SQL:** parameterized everywhere.
- **Ownership:** every owner-scoped query filters by owner.
- **SSRF:** research hosts are fixed with validated path segments. Webhook delivery pins resolved public IPs and refuses redirects.
- **Frontend output:** chat text and artifacts are built with `textContent`, links are limited to http(s), and markdown images are never fetched.
- **Dependencies:** `npm audit` reports 0 vulnerabilities.

## Verification

Run on Windows with an isolated embedded PostgreSQL (`SNAAP_LOCAL_DB_PORT=55491`). Every new regression test was confirmed to fail against the previous code.

- `npm run typecheck`: pass. `tsc --noEmit --noUnusedLocals` is clean for `src/`.
- `npm test`: 603 pass, 0 fail (baseline 595, plus tests for route gates, proxy rate limits, XLSX archives, import accumulation and gap windows).
- `npm run test:integration:isolated`: integration, trade-sides, workspace-delete, setup-files and history all pass.
- `npm run test:notifications`, `npm run test:admin`, `npm run test:harness` and `npm run test:market-research`: pass.
- `npm audit`: 0 vulnerabilities.

No real notifications, exchange calls, payments or paid LLM requests were made. The proxy-dependent part of the critical finding (whether Railway's edge forwards `%61` or absolute-form targets unchanged) was not tested against the live host. The fix does not depend on it. Production check after the `X-Real-IP` change: repeated requests from one client must count down one bucket, and a spoofed `X-Real-IP` must not open a new bucket.
