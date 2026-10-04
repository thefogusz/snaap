# Chat + setup UX audit — 2026-10-04

## Implemented

- Separate scroll containers for chat history and the graph/setup pane on desktop (1100px+). The composer remains visible; scrolling one pane leaves the other pane and page in place.
- Preserve split view while sending a message. New drafts no longer force mobile users away from chat.
- Follow the latest message when already at the bottom; preserve reading position otherwise. A latest-message button returns to the bottom. Its position follows the composer height.
- Graph/setup jump buttons and sticky setup controls keep the editor reachable.
- Compact change cards show old/new values in pills, an accent border, count and undo. Historical cards explicitly describe an earlier proposal rather than the current draft.
- Mobile chat uses a bounded history region with a visible composer. Setup remains a separate tab.
- Refresh the conversation picker on opening. Reuse the same pagination loader on reload and conversation selection. Preserve reading position when prepending older messages.
- Reset the image input so choosing the same file again works. Show upload progress, prevent sending before upload finishes, and guard against attaching a late upload to another workspace/conversation.
- Reject crops outside image bounds or crops without exactly one image before reserving quota/calling the provider.

## Evidence from this run

| Check | Result |
| --- | --- |
| TypeScript typecheck and browser JS syntax checks | Pass |
| Unit tests | 83/83 pass |
| Setup matrix | 64 combinations: Spot/Long/Short/Both × 15m/1h/4h/1d × cooldown 0/1/5/20; 120 synthetic candles each. Replay equals serialized incremental evaluation; cooldown 0 counts and initial timestamps match expected alternating-price signals. |
| Harness contracts | 5 groups pass: incomplete response refund, concurrency isolation, removed source filtering, missing tool action repair, invalid crop rejection |
| General integration suite | Pass: ownership, workspaces, draft versions, quota, durable monitoring/deduplication and payment fixtures |
| Long-history API | 240 seeded messages paginate 200+40 with no duplicates. An actual GLM request changes cooldown 5→7 and deep equality confirms every other draft field preserved. Provider request took about 6.4s. |
| Long-history browser | Load 200 then 40 older messages; first message becomes number 1. Reload exposes the older-message button. Actual chat edits 5→7 and 7→8 return cards; undo restores the draft to 7. The synthetic conversation is retained as `UX audit · 240 messages`. |
| Independent scrolling | Setup scroll moved 762→1345 while chat stayed 36096 and page stayed 0. Chat PageUp moved 36096→35658 while setup stayed 1345. Latest button returns chat to its maximum. |
| Responsive browser checks | 320×740, 768×900, 1024×768, 1440×900: no horizontal overflow; composer bottoms 728/888/756/880 respectively. Temporary viewport overrides reset. |
| Image + real model via API | Synthetic PNG upload 201; GLM vision response 200; deletion 200; attempting to reuse removed image 404 IMAGE_NOT_FOUND. |
| Browser file chooser | Opens and accepts the test path, but attachment preview does not appear in the controlled in-app browser. UI upload is **not verified**; API vision success does not prove the complete browser flow. No captured console error identifies the cause. |
| Queue wakeup fixture | 59ms from enqueuing a no-op delivery job to completed worker state. Not candle-close-to-device delivery latency. |

Evidence files: `.local/audit/long-chat-results.json`, `image-results.json`, and `ux-long-chat.jpg`. `scripts/audit-long-chat.ts` uses the real configured provider and creates a clearly named local UI fixture. Re-running requires `RUN_PAID_EVALS=1`. Unit/Harness fixtures do not call OpenRouter.

## Remaining scope and limitations

1. **Conversation memory:** the model receives the last 10 messages plus the current draft and selected sources. A 240-message history can be stored/read, and the canonical draft survives, but older preferences outside the draft can be forgotten. The seeded-history check is not 240 consecutive real AI turns. A durable, editable summary of goals/constraints would improve this; it must track later corrections and removed sources.
2. **Frequent alerts:** at the initial audit time the minimum was 15m. A subsequent change on the same date added 5m throughout validation, editor, chart, replay and monitoring; the matrix now covers 80 combinations. Conditions are evaluated on closed candles. There is no 1m or intrabar alert mode, and cooldown 0 does not imply an alert every tick while a condition remains true.
3. **Latency:** new subscriptions reconcile during the minute scan, so activation can wait up to a scan cycle. REST fallback adds up to roughly a minute of scheduling delay plus fetch/queue/provider time. Realtime closure conservatively waits for a later candle in the stream; quiet pairs can wait for another trade. External retries can add delay. The 59ms fixture is not an external delivery SLA.
4. **Live market coverage:** the 64-case matrix uses synthetic candles. This run does not prove all exchange perpetual streams, all instruments, Telegram/LINE delivery or mobile push latency. External delivery and a sustained live soak remain unverified.
5. **Image UX:** verify file selection/preview/crop/submit on the user's actual browser before claiming this flow complete. Historical image pixels are not automatically resent each turn; users must explicitly select/attach images again when needed.
6. **Additional UX:** safe rich-text rendering would improve assistant answers currently displayed as plain text; resizable split proportions and a compact current-draft summary would make narrower desktop layouts easier. These are follow-on enhancements, not included in this patch.

No user setup was activated and no order was placed during this audit.
