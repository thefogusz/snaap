# Harness compatibility audit — 6 October 2026

Checkout: `codex/setup-studio`, integrated with main through `05608d8` before publication. No deployment.

## Findings and fixes

- Completed-edit claims without a validated proposal were accepted for analysis-only requests. These now fail with `AI_ACTION_MISSING` without forcing an unwanted edit. Thai and English completed-edit wording is covered.
- Missing/invalid provider usage could be treated as zero cost. Usage is now validated before accepting a response or calling another tool. The main branch intentionally removed per-request spend caps in #7; integration preserves that policy, full configured output allowance, high-cost requests and cumulative usage accounting. Failed requests refund application quota; this does not refund provider charges.
- Tool exhaustion was reported as a generic outage. It now returns `AI_TOOL_LIMIT`. Provider/request timeouts return `AI_TIMEOUT`; provider errors and raw credentials are not exposed.
- Real-model review found incorrect conversions of Unix candle times and inaccurate explanations of repeated entry signals. Inspection now supplies ISO UTC reference/coverage times. Guidance states the actual latch/rearm behavior and exact comparison operators; strict `>` must not become `>=`.
- Automatic and manual history sync could deadlock because connection and owner rows were locked in different orders. Automatic persistence now locks owner before connection, matching manual sync. Shutdown awaits the active sync.
- Merge verification found a startup event race: dynamic imports could resume after DOMContentLoaded while readyState stayed interactive. Readiness is now registered synchronously before imports. Weekly freshness validation also now uses Monday UTC boundaries, consistent with exchange candles. Both have regression tests. The footer now shares the current activation flow with saved setup cards; the removed legacy confirmation function is no longer called. Activation refreshes the saved state without editing the draft.
- Integration fixtures lagged current consent, transport protection, encrypted Telegram credentials, and multipart chart delivery contracts. Fixtures were updated. Integration checks run in disposable database schemas, with an explicit schema assertion to keep rules invisible to the local monitor.

## Validation

| Layer | Evidence |
| --- | --- |
| Type safety / unit tests | `npm run typecheck`; 510 tests pass |
| Harness contracts | 19 passing contract groups, including opt-in real 45-second provider-request timeout |
| Context / privacy | Owner-scoped history and images, personal data off, invalid pair/path, deleted sources, image deletion while awaiting a response |
| Draft / tools | Invalid MACD repair, actual diff, 24 accepted / 25 rejected, skill allowlist, six-tool limit, empty/incomplete output, no false edit claim |
| Accounting | Missing/negative usage rejected; high-cost requests accepted and recorded; provider failure/timeout refund quota |
| Integration | Rules/revisions/workspaces/inbox, concurrent edits, quota, durable dedup, Long/Short and mocked delivery, setup import/export, five exchanges × Spot/Futures history |
| Browser | 1440/1024/390, both themes; stale previews, new chat, pasted/sent images and failed-send retry, agent conflicts, diff/undo, footer save and activation; no JS errors |
| Real provider | Four standard turns: read-only explanation, MACD edit preserving EMA, closed-bar MTF inspection, synthetic image reading. ISO reference times checked against the tool. A targeted fifth follow-up verifies strict `>` wording and latch/rearm after guidance repair. No saved/activated rules |

Post-integration checks also cover chat save/retry/activation, signal insights, Harness smoke, and 100 simulated user-days / 1,859 authenticated API calls.

## Reproduction

```powershell
npm run typecheck
npm test
npm run test:harness
$env:RUN_HARNESS_TIMEOUT_CHECK='true'
npm run test:harness
Remove-Item Env:RUN_HARNESS_TIMEOUT_CHECK
npm run test:integration:isolated
# Requires an already configured provider and rates. At most four standard turns.
$env:RUN_PAID_EVALS='true'
npm run test:harness:provider
```

Browser check: set `SNAAP_PLAYWRIGHT_PATH` to the installed Playwright module, run the isolated `scripts/studio-ui-server.ts` fixture on 4189, then `node scripts/studio-browser-check.cjs`. Fixture rate limits still apply; repeated runs can require restarting that fixture.

Raw local evidence is in `.local/audit/harness-audit-*.txt`, `.local/audit/harness-provider-smoke.json`, and `.local/audit/harness-provider-read-only.json`. These contain synthetic test evidence, not user trading history. Provider output is probabilistic: the smoke cases do not establish universal trading correctness. One real-provider attempt failed before a response and was refunded; its retry succeeded.

Exchange endpoints and notification transport were mocked. This audit does not certify live exchange behavior, outbound notification delivery, returns/backtest performance, order placement, or the disabled Deep mode. The 90-second deadline, 45-second provider timeout, seven model rounds, and six tool calls remain unchanged. Per-request cost admission/actual spend caps and their budget-driven history compaction were removed to preserve main #7; application quota and cost accounting remain. Real-provider evidence above was collected before this main integration; post-integration provider protocol/retry tests use a mock transport.
