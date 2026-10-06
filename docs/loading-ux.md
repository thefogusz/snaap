# Loading feedback audit

Base: origin/main at 8d6dfda. User-facing workspace flows were reviewed against the current source.

| Flow | Feedback |
| --- | --- |
| My Data first visit / new workspace | Three static placeholders reflecting the image library, connections and file sections; heading is immediately visible |
| My Data refresh | Keep existing content while reading; preserve the existing 12-second deadline and per-section failure handling |
| Recent conversations, cold cache | Three placeholder rows; cached conversations stay usable during background refresh; failure clears placeholders and offers retry |
| Open a conversation | Message-shaped placeholders removed in finally, including failure and superseded selection |
| Chart first load | Static chart silhouette inside the existing chart bounds |
| Chart refresh / setup edits | Retain last chart with loading status; abort superseded requests; 20-second deadline and retry feedback; disable stale replay controls |
| Notifications: signals / channels / overview | Rows or cards until initial data arrives; retain loaded content on refresh; 12-second read deadline; failure removes placeholders |
| Pair picker / preset pair catalog | Placeholder rows replaced by catalog or error/retry |
| Channel appearance preview | Placeholder on first preview; keep previous preview during updates |
| Import a setup code / export a setup code | Placeholder preview; export dialog opens immediately; error replaces loading feedback |
| History file validation | Placeholder in preview area, replaced by validation results or error |
| Enable My Data in chat | Immediate “กำลังเตรียมข้อมูล…” button label, restored on success or failure; context and images continue loading concurrently |
| AI reply / chat image upload / workspace switch / save and test actions | Retain existing thinking/streaming, upload progress, workspace overlay and disabled action controls; content skeletons do not fit these operations |
| App startup | Retain existing branded boot feedback and retry rather than displaying duplicate skeletons |

## Cost and limitations

Shared plain JavaScript and CSS, no package changes, image assets, animation, MutationObserver, requestAnimationFrame loops, or skeleton timers. Shapes are static, use theme colors, and have no continuing animation work. Only initial missing content uses placeholders; existing loaded data is not discarded to show them. Screen readers receive one loading status instead of decorative shapes.

This improves immediate feedback, not backend response time. My Data still awaits its concurrent reads before replacing the page; one slow section can hold the initial view until its deadline. Chart preview calculation/network latency still needs backend measurement before claiming a speed improvement. Aborting obsolete browser requests reduces unnecessary response handling; it does not guarantee cancellation of server computation.

Browser verification uses this checkout on port 4187 with an isolated local database and local demo market data. Delays/failures are injected in browser routing for repeatable checks, not deployed to production.

## Verification

- `npm test`: 547 tests passed, including loading, retry, superseded chart/conversation requests and workspace scope checks.
- `npm run typecheck` and `git diff --check`: passed.
- Chromium: delayed My Data and notifications resolve without leftover placeholders; initial chart and pair picker render placeholders; failed chart refresh disables replay and retry restores loading; mobile My Data at 390px has no horizontal overflow and no animation.
- Light and dark screenshots inspected. Existing chart controls, condition editor, notification tabs and library controls remain present.
- Preview asset hash matches the checkout's loading-ui.js; server process runs the isolated preview script from this checkout.
- Shared helper and CSS: 3,715 bytes uncompressed; 1,466 bytes when gzip compressed. Transfer size depends on server compression.
