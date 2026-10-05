# Smoke and Harness audit — 5 October 2026

Branch: `codex/ai-signal-research`. Existing research and chat-save changes retained.
No push, merge or deployment. All browser data lived in an isolated PostgreSQL
schema; no exchange requests, paid provider calls or notification worker ran.

## Bugs fixed

| Finding | Fix and regression coverage |
|---|---|
| Mobile split view inherited a horizontal flex layout for the conversation. At 320px the composer occupied a narrow column beside messages; the document overflowed to 331px. | Stack conversation children vertically and constrain their widths below 1100px. Verified 320/390/768/1280px in the browser. |
| A delayed history request could render messages into a different conversation or workspace. An older refresh could overwrite the current workspace's rules or conversation list. | Capture scope and request generation; discard superseded responses before committing state. Refresh applies one complete response snapshot. Actual production functions are exercised by VM regression tests. |
| Legacy history could request a save card solely because an AI proposal had recorded changes, even when no accepted draft was stored. | Materialize a legacy card only when the conversation has a persisted accepted draft. Regression test covers unaccepted proposals. |
| Chat changes had lost the per-proposal undo action. | Restore it in a compact receipt with before/after values. Undo requires the same conversation, workspace and exact resulting draft; it invalidates replay and queues persistence. Busy or superseded drafts cannot be overwritten. |
| Advanced editor save and proposal acceptance did not hold the shared busy guard through their asynchronous work. | Hold the guard, disable the editor while saving, and always release it. Proposal dialogs also capture their original conversation/workspace. |
| A modified draft of an active setup did not explain clearly which conditions were running. | Card states explicitly that the saved version still alerts; saving changes pauses it. Verified against an active setup changing to BOTH. |
| A client sending `draft:null` was incompatible with the optional Harness draft schema. | UI omits an absent draft; Harness treats null as absent for client compatibility and still validates every concrete spec. Real route contract test covers it. |
| Exceeding the tool budget surfaced a generic provider-unavailable error. | Return `AI_TOOL_LIMIT` with a concrete instruction to narrow the request; refund the quota. |

## Validation matrix

`npm run test:harness-smoke` sends 25 scenarios through the real Harness and a
local Responses API provider fixture, rather than intercepting the turns route.
Market dependencies use deterministic supported instruments and closed candles.
The production defaults continue to use the normal exchange adapters.

Coverage includes:

- Text only and null/absent initial drafts.
- Every Harness tool: `read_skill`, `find_instruments`, `propose_strategy`,
  `replay_strategy`, including tool output linkage and multi-round responses.
- Spot, Short, BOTH, Break & Retest, stages, multiple frames, nested AND/OR/HOLD,
  and the maximum six conditions across five frames with mirrored Short.
- Malformed JSON, unknown tool, unsupported pair, excessive conditions,
  unowned destinations, specialist/tool budgets and the unavailable deep mode.
- Provider 500, incomplete response, empty response, refunded usage and no
  remaining RESERVED ledger entries or RUNNING agent runs.
- Valid image input and cropping, rejected unavailable image, excessive text,
  repeated complex turns, and confirmation that Harness never saves or activates
  a rule by itself.

`npm run test:chat-save` additionally checks simultaneous saves: three requests
with one expected revision produce one successful update and two conflicts,
while retaining the original rule ID and risk plan. Existing preset routes remain
compatible.

Browser verification used `scripts/harness-smoke.ts --serve`:

- Fresh chat → proposal → save → activate → refine → save revision → reload.
- Short and BOTH summaries, distinction between active saved rules and drafts.
- Provider failure → restored composer → successful retry.
- Slow response while the user edits a name → proposal-review dialog → keep
  user draft → save through advanced editor; the user name is retained.
- Safe undo, Break & Retest required-level validation and wizard completion.
- ATR numeric validation and save, export/share-code preview/import with ATR.
- Empty signals and monitoring pages.
- Responsive chat/split layouts at 320, 390, 768 and 1280px; light/dark theme.
- No browser console errors or warnings. Final mobile split document width is
  exactly 320px at a 320px viewport.

Screenshots: `.local/smoke-desktop.png`, `.local/smoke-mobile-split.png`.

Other passing checks: TypeScript, full unit suite, existing Harness contracts,
general integration and signal-insight integration. These checks establish
protocol and application behavior with fixtures; they do not measure a paid
model's Thai reasoning quality or verify live notification delivery.
