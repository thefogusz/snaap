# Repository review and refactor — 4 October 2026

## Scope

Reviewed module boundaries, routes and ownership checks, OAuth/session handling, encrypted exchange and notification credentials, imports and source selection, domain evaluation, signal monitoring, LLM boundaries, frontend entry points, runtime storage, dependency audit, and publication contents. This is a code review with existing automated checks, not a security certification or proof of production uptime.

## Changes

- Extracted `ApiError` into `src/errors.ts` and SHA-256 session hashing into `src/crypto.ts`. Route modules no longer import the server merely to access these helpers, removing the API/route import cycles. Existing imports from `src/api.ts` remain supported through re-exports.
- Consolidated toast timing, replacement, reduced-motion handling and fade animations in `dist/toast.js`. The workbench and retained prototype use the same lifecycle.
- Replaced the repeatedly added workspace action click listener with a single assigned handler.
- Formatted maintained Backend and development scripts with the project's existing Prettier dependency for consistent readability; no domain algorithm rewrite was performed.
- Excluded browser traces, local runtime metadata, logs and key-file formats from Git. Added a staged-file publication check that reports filenames without printing matching credentials.
- Updated README with the current explicit local-login behavior and real deployment requirements.

## Verification in this review

- `npm run typecheck`: passed.
- `npm test`: 362 passed, 0 failed.
- `npm run test:integration`: workspace isolation, migration, API ownership/CSRF, durable monitoring, revisions/quota and payment-event fixtures passed.
- `npm run test:harness`: 7 mock-provider contract groups passed, including privacy, stale/deleted-source filtering, quota refunds and draft repair.
- `npm audit --omit=dev`: 0 reported production dependency vulnerabilities at review time.
- Full `npm audit`: 0 reported vulnerabilities including development tools.
- Browser: explicit local login and the restored chat UI loaded on the isolated port 4175; browser error log was empty. This does not verify a real Google callback.
- Frontend JavaScript syntax and the staged publication check are checked before publication; rerun as code changes.

No real trades, payments, notification deliveries or paid LLM requests were initiated in this review. Local run logs remain under `.local/audit/` and are excluded from publication.

## Publication

The supplied GitHub repository was empty when inspected. The local repository's historical commits included browser traces, so publication uses a fresh root commit containing only the reviewed source snapshot. The original local history is retained on `main`; the clean publication branch is `codex/github-release`, published as GitHub `main`. No remote history is force-pushed.

## Remaining work before public launch

- Google OAuth needs real Client ID/Secret and callback validation against the production domain.
- Real Discord/Telegram/LINE delivery, exchange private-history integration and sustained reconnect behavior need provider verification.
- API and monitor currently share one entry point. Splitting services requires a worker entry point and coordination design; adding another server replica alone is insufficient.
- Multi-pair fan-out can be large. Load/capacity and fair scheduling must be measured before broad public use.
- The existing freshness fixture documents that READY can tolerate a one-candle lag. READY is not proof of zero market delay.
- LLM response quality, latency and prompt overhead retain the findings in [the prior full-system audit](full-system-audit-2026-10-04.md).
- Persistent image storage, backup/restore, retention and encryption-key recovery must be configured on the chosen host.
- Live billing and the detailed Pro mode remain disabled; their future launch requires acceptance checks.

Earlier audit reports are dated evidence for earlier snapshots. Statements in the older implementation-status document should be read with this report and the later feature documents.
