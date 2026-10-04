# Snaap full-system audit — 4 October 2026

## Verdict

Core save, validation, privacy and signal paths passed the final automated suite after five reproduced defects were repaired. Chat responsiveness and answer quality still need work. This is not a production-readiness certification.

## What actually ran

- Three parallel audit tracks: data/lifecycle, signal engine/market cache, and LLM/harness. Browser interaction ran separately against an isolated database schema on port 4175.
- Ten users × ten accelerated sessions: 100 conversations, sparse save/review/pause/resume activity. This compresses ten logical days; it is not ten elapsed days of uptime.
- Signal replay: ten personas × ten simulated days, 17,743 synthetic bars, 17,455 unique processed bars and 1,727 synthetic signals. These counts are not trading-performance evidence.
- Ten real GLM scenarios, at most two concurrent, using synthetic information. The ten-day LLM lifecycle matrix is a plan rather than 100 live provider calls.
- Final `npm test`: **362 passed, zero failed**. `npm run typecheck`: passed. `npm run test:harness`: seven contract groups passed.
- Isolated PostgreSQL lifecycle script: **884 assertions passed**. These assertions and focused agent suites are not added to the 362-test count.

## Persona coverage

| Trader scenario | Main checks |
| --- | --- |
| Beginner | Plain-language indicator explanation and simple setup |
| History reviewer | Style analysis without confusing fills with positions |
| Trend follower | Explicit setup proposal, validation and save |
| Active futures trader | Honest answer about unavailable live positions |
| News trader | No invented live internet/news access |
| Casual visitor | Friendly brief off-topic conversation |
| Risk-focused trader | Position-risk arithmetic |
| Complex setup author | Six-condition limit and invalid seven-condition request |
| Adversarial uploaded source | Source instructions cannot override assistant rules |
| Visual trader | Image recognition and reference-image handling |

Signal and lifecycle fixtures additionally cover both directions, lower/higher timeframes, extended indicators, pauses, revision changes, replay, duplicate and out-of-order candles, data gaps, stale revisions, parallel image uploads, and locked Pro mode.

## Reproduced and repaired

1. **Personal data toggle bypass:** an API call with `useMyData:false` and omitted selection could include private imports in the provider context. Imports, library images and earlier messages carrying those sources are now gated; explicitly selected setups and temporary chat attachments remain available. Mock-provider regression checks pass.
2. **Image deletion scope:** DELETE checked ownership but ignored workspace visibility. It now uses the same workspace scope as GET/PATCH. This affected another workspace of the same owner, not access across users.
3. **Long indicator warmup:** TEMA 500 requested 2,032 bars but the market cache discarded everything beyond 1,000, leaving the accepted condition UNKNOWN. The requested window is retained up to the existing 2,400-bar fetch budget and survives stream updates.
4. **Preset conversation status:** a successful preset save left the conversation marked as analysis-only. Its saved status now updates in the same transaction. Stale saves and repeat saves are covered.
5. **Fresh chat startup:** pair availability attempted to read `exchange` from a null draft. Both availability and picker paths now guard draft absence; three startup regressions pass and the fresh isolated browser console has no errors.

## Remaining findings, in priority order

### Chat quality and latency

- Nine of ten real GLM cases returned successfully; the seven-condition case timed out with HTTP 502. Quota was refunded. A ten-case sample does not establish a production failure rate.
- Successful end-to-end latency: **7.7–51.2 seconds**, median **30.7 seconds**. It does not yet feel consistently responsive.
- One reply referred to an attached image when none was present; another inferred planned trading rounds from fill timestamps. Some prose exposed internal fields such as `valid:true`, `CROSS_ABOVE` and `destinations`.
- The draft path recovered from one invalid proposal using harness validation and repair. Safety worked, but the extra round costs time.
- Provider-reported usage was **238,187 input / 3,667 output tokens**. Estimated cost from configured prices was **$0.06688075**, excluding unknown provider usage for the timeout. Even a simple request used approximately 15,800 input tokens; policy/catalog overhead deserves reduction.
- Recommended next work: load only relevant catalog/tools, make style conclusions evidence-based and direct, keep tool vocabulary out of final replies, and provide a clear retry state after a timeout.

### Signal freshness

A REST fixture one complete 5-minute candle behind still reported READY because the freshness tolerance permits two timeframe widths. This proves optimistic status logic, not actual exchange latency. Distinguish connection health from caught-up candle state, and show the latest close timestamp. The chart still polls closed candles every 30 seconds; it does not display every live price tick.

### Workspace and audit tooling

Imports/connections have scoped listings but owner-level deletion semantics. Clarify whether deletion is global and make the UI communicate that. The older history integration script needs updated consent and MEXC fixtures.

## Browser UX evidence

Exercised fresh chat, rotating prompt, workspace creation/switching, preset selection and three-step application, inactive preset save, recent conversations, split chat/setup, a public Binance chart with 500 bars, reload recovery, and navigation to notifications/history. The preset status defect was first observed in the UI and then reproduced and retested through the real database path.

Additional checks covered light/dark history views and a 390 × 844 mobile viewport. The document had no horizontal page overflow in the measured mobile history view; controls stacked inside the frame. This does not certify every dialog or every populated mobile state. Screenshots are in `.local/audit/ui-desktop-2026-10-04.png` and `.local/audit/ui-mobile-2026-10-04.png`.

## Boundaries

No real orders were placed, no user assets were deleted, and no real account credentials were submitted by the audit. Test setups stayed inactive. No external notifications were sent. Actual exchange account integration, channel delivery latency, live reconnect behavior, six-hour sync reliability and ten-day uptime remain unverified by this compressed run.

## Supporting reports and reruns

- `docs/audit-data-2026-10-04.md`
- `docs/audit-signals-2026-10-04.md`
- `docs/audit-llm-2026-10-04.md`
- `.local/audit/final-full-tests-2026-10-04.log`
- `.local/audit/final-harness-2026-10-04.log`
- `scripts/audit-data-lifecycle.ts`
- `scripts/audit-persona-llm-2026-10-04.ts` — calls the paid provider; rerun deliberately.
- `scripts/audit-ui-server.ts` — separate schema, monitoring and paid-provider keys disabled.
