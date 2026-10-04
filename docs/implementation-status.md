# Implementation status — 2026-10-03

## Implemented locally

- Existing brand, light/dark themes and “คุยกับ snaap” navigation retained. Desktop chat/editor and narrow-screen tabs, nested conditions, undo, proposal review, activation confirmation.
- PostgreSQL UTF-8, opaque cookie sessions, Google OIDC/PKCE/nonce and invite allowlist, server owner filtering, origin/Host/CSRF checks. Google is not tested with live credentials.
- Versioned StrategySpec v2; price/volume, EMA/SMA/RSI/MACD/BB/ATR, explicit price source, AND/OR, crossings, HOLD, sequential deadlines, cancel, exit, cooldown. Shared closed-bar transition function for replay and monitor checkpoints. No real positions/orders.
- Public REST candles for all five exchanges, shared cache, independent failure states and no source substitution. BTC/USDT Spot fetch was verified on all five. Market availability remains per instrument/type; futures are not fully certified.
- pg-boss scan/evaluation/outbox, persisted checkpoints, immutable signal revision and dedup IDs. Per-exchange status, inbox and delivery state. REST polling every minute; no WebSocket transport in this implementation.
- Private image upload/re-encoding, preview/crop, source selection/date window, conversations and automatically saved valid drafts. Saves serialize, keep revision checks, and flush before switching drafts. Invalid or conflicting changes remain visibly unsaved and trigger a warning before leaving. Evidence-backed context, invalidated deleted sources, versioned domain skills. Agent validation/replay tools, request deadline/round/tool/token/cost bounds, quota reservation/refund.
- Free/Pro limits (3/20 active,20/100 standard,0/10 deep). Expired entitlement blocks over-limit monitoring until the user reduces active rules.
- CSV/XLSX normalized import with preview, missing-fee count, account-scoped trade IDs; anonymous fills retained rather than silently deduplicated. Encrypted read-only API connection code for Binance/Bybit Spot; one explicit bounded page per sync.
- Telegram challenge binding and optional dev long polling, LINE signed challenge binding, Discord embeds and verified allowlisted HTTPS webhook with pinned public IPv4/DNS and HMAC. Channel Studio provides setup guides, previews, saved per-destination appearance and test sends. LINE has durable per-user/shared monthly caps. Retry/outbox and ambiguous-delivery states remain explicit. No real channel delivery tested. See [channel setup](notification-channels.md).
- Stripe Checkout card subscription/PromptPay one-time, raw signed webhook, event/payment deduplication, grant ledger and full-refund rollback; partial refunds do not prematurely consume the full-refund handler. Customer portal. Real provider flow not tested.

## Verification performed

- TypeScript check, domain/security unit tests and PostgreSQL integration tests.
- Ownership, CSRF, immutable versions, stale edit rejection, rule limit, repeated monitor evaluation, Thai persistence.
- Payment-event fixtures: duplicate events/payment IDs, partial→full refund, stacked renewal refund, concurrent payment/refund and refund-before-payment. Surviving PromptPay purchases each contribute 30 days from their recorded receipt time or the previous surviving expiry. Card periods remain tied to invoice periods. These do not prove Stripe Checkout or current webhook payload compatibility.
- 100 concurrent simulated users, 300 authenticated reads: no errors; measured 181 ms total and 147 ms p95 per three-read user scenario on this machine. Excludes AI, image and market load.
- Application snapshot restored into a newly created PostgreSQL database; all app table counts matched. Not a production cluster disaster-recovery test.
- Browser: Thai name edit/save, real-candle chart/replay, private image preview/crop, CSV preview/confirmed import exercised. Mobile editor checked at 390px in both themes with no horizontal overflow. Browser error log was empty in that test tab. Agent-created test records were removed after verification.
- Follow-up browser verification: draft auto-save survives reload, immediate conversation switching flushes the latest EMA edit, undo restores the persisted value and correct save status. No browser errors in the verification tab. API integration also checks draft owner isolation and stale revision rejection.
- Prepared 100 agent evaluation inputs (80 Thai text variants, 20 synthetic chart images) with review expectations. Run `npm run eval:prepare`, then configure credentials/prices and `RUN_PAID_EVALS=true` before `npm run eval:agent`. Results require semantic human review; none are counted as passing without running the model.

## Open implementation and acceptance work (do not sell yet)

1. Full private-history adapters for OKX/Bitget/MEXC, pagination completeness, exchange-native file mapping and richer history analysis. Current UI explicitly reports only the implemented capability.
2. Agent semantic evaluation on at least 100 Thai/image cases, calibrated evidence quality, cost measurement with configured models. No actual model request has been made without the user's server credentials.
3. Production-grade fair scheduling and large target universes; provider reconnect/backfill, rate limits and all futures capability checks. Current cache is process-local; one worker process is the supported initial deployment.
4. Real Google callback, Stripe test-mode card and PromptPay flow, invoice failures/cancellation/out-of-order/refunds, Telegram/LINE delivery and OA quota recovery using configured test accounts. No real charges or messages sent.
5. Complete 48-hour worker/provider soak, realistic mixed 100-user load and production backup/restore procedure. Soak runner currently checks HTTP/database only.
6. Final accessibility, mobile, crop, invalid/offline-draft recovery, per-rule revisions UI, archive/data-retention and cost observability review. Valid drafts autosave after 700 ms; invalid drafts do not overwrite the last valid version. No browser-local recovery for invalid/offline drafts yet.
7. Checkout attempt reuse and duplicate subscription prevention, subscription-state UI, and mixed card/PromptPay renewal policy require implementation before enabling live billing.

## External reference review

Domain skill prose was independently written. No third-party skill code or autonomous shell tools were installed.

- ML4T Skills: Apache-2.0 license reviewed at https://raw.githubusercontent.com/ml4t/skills/main/LICENSE . Principle used: validation/leakage discipline.
- Vibe-Trading: MIT license reviewed at https://raw.githubusercontent.com/HKUDS/Vibe-Trading/main/LICENSE . Principle used: distinguish design, data and validation questions.
- QuantConnect Research Guide: https://www.quantconnect.com/docs/v2/writing-algorithms/key-concepts/research-guide . Conceptual research reference; documentation/code not copied.
- Telegram webhook secret: https://core.telegram.org/bots/api#setwebhook ; LINE raw-body HMAC: https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/ ; PromptPay: https://docs.stripe.com/payments/promptpay . Provider credentials/setup remain necessary.
