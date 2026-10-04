# Snaap notification channels

## User workflow

Open **การแจ้งเตือน → ช่องทาง → เชื่อมต่อ / คู่มือ** (or **ดูคู่มือ** when the provider is not configured). Channel Studio has three steps: guide, connection, appearance. Guides and sample previews work before operator credentials are configured. A preview does not send anything.

1. Follow the channel-specific guide. Discord connection sends one clearly disclosed TEST message. Telegram and LINE require a one-time `/start` challenge in the recipient's private chat. Webhook connection POSTs a verification challenge and requires its exact text back.
2. Check the binding status for Telegram/LINE; challenges expire after ten minutes. A disconnected or expired challenge cannot reconnect the destination. Add a new destination to reconnect.
3. Customize card/minimal layout, accent, Thai/English, heading, reference price, setup, time and ID. Optional creator attribution supports a custom name (13 characters) and is off by default. Pair, direction, event and Snaap attribution remain visible. Save then send a test. Tests use the saved appearance; drafts only affect the preview.
4. Select the verified destination in each setup and save the setup's channels before activation. Connecting a destination alone does not subscribe every setup.

Saved appearance belongs to the destination, so two destinations on the same provider can look different. Existing Telegram destinations default to minimal text. LINE defaults to a Flex bubble, Discord to an embed. Telegram's card option sends a small Snaap PNG with a caption using multipart upload, so it works without public image hosting. Its three brand accents have matching PNG variants. Minimal messages use no bot HTML/Markdown markup; Discord escapes formatting and disables mentions.

## Operator setup

Keep credentials in `.env`/your deployment secret store; never in chat or browser code. Restart the server after changing environment configuration. `npm run dev` stays on loopback with its existing private PostgreSQL; this change does not deploy or create a tunnel.

| Channel | Required configuration | Receive mode |
| --- | --- | --- |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (without @) | Dev defaults to long polling. Production defaults to webhook and also requires `TELEGRAM_WEBHOOK_SECRET`. Explicitly set `TELEGRAM_RECEIVE_MODE=polling` or `webhook` to override. |
| LINE | `LINE_CHANNEL_SECRET`, `LINE_ACCESS_TOKEN`; set `LINE_OA_URL` to an add-friend link | Register `${APP_ORIGIN}/api/v1/hooks/line` in LINE Developers, verify it, and enable Use webhook. A public HTTPS runtime is required for real inbound LINE events. |
| Discord | `DATA_ENCRYPTION_KEY` | User provides an incoming webhook from their text channel; no bot token or Nitro subscription is required. |
| Webhook | `DATA_ENCRYPTION_KEY`, `WEBHOOK_ALLOWED_HOSTS` | Operator-reviewed exact public HTTPS hostnames only. Private networks, IP literals, redirects and arbitrary hosts remain rejected. |

Use a separate Telegram bot for development. Polling checks for an existing webhook and stops rather than deleting it or taking over production. Only one receiver process may poll a bot. The cursor is durable and namespaced by a hash of the bot token; challenge binding is atomic and one-time. Webhook mode must be registered with Telegram's `setWebhook`, including the matching `secret_token`; the application does not change provider webhook settings on its own.

`DATA_ENCRYPTION_KEY` is the existing 32-byte hex key. Back it up separately. Discord URLs and newly connected Webhook URLs/signing secrets are encrypted and scoped to owner plus destination ID. List/preview routes never return credentials. New Webhook signing secrets are shown only in the connection response: store them before closing the guide. Losing one requires a new connection. Legacy Webhook destinations still use `WEBHOOK_SIGNING_SECRET`.

### Branding and return links

When `APP_ORIGIN` is a public HTTPS origin, LINE/Discord cards include the hosted Snaap brand image and a return link to the notification page. Telegram includes a return button; minimal text includes the URL. With loopback/HTTP origins, the UI and renderer omit unusable external return links and hosted LINE/Discord images. LINE's colored branded header and Discord's Snaap footer still work. The preview explicitly describes this limitation. Verify the public PNG returns HTTP 200 without authentication before sending live cards. The banner's market line is brand artwork, not a price chart or trading evidence.

### LINE cost guardrails

The operator owns the shared OA. Default limits are **30 sends per user per Bangkok calendar month**, **250 sends across the application per month**, including tests. Override `LINE_MONTHLY_USER_LIMIT` and `LINE_MONTHLY_TOTAL_LIMIT` only after checking the OA's actual plan, regional limits, and other senders using that account. Zero blocks sends. These limits control Snaap's traffic; they do not control broadcasts or other applications sending through the same OA, and do not guarantee the account's billing outcome. No paid broadcast or OA package upgrade is enabled by this code.

Reservations commit before provider I/O, serialize through a database advisory lock, and retain failed/ambiguous requests conservatively. A retry retains its request UUID and quota reservation within the same month; crossing the month boundary reserves a slot again. LINE retries retain `X-Line-Retry-Key`; 409 counts as accepted only with `x-line-accepted-request-id`. Provider quota/rate-limit failures leave the signal in the web inbox. An accepted API request is not proof the user received/read it.

## Custom Webhook receiver

Download [the self-contained Node.js example](../dist/assets/snaap-webhook-example.mjs) from the in-app guide. It listens on loopback; deploy it behind your own HTTPS proxy and allowlist that domain in Snaap. It handles challenge verification before a signing secret exists. Set `SNAAP_WEBHOOK_SECRET` on the receiver to the one-time secret returned by Snaap, then send a test.

Signal payloads retain `id`, `event`, `pair`, `exchange`, and `revision`, and add `type: snaap.signal`, `version: 1`, `test`, and `presentation` (rendered text, appearance, brand, and optional public image/link). Appearance never removes evidence from `event`.

Check `x-snaap-signature-v1` as lowercase hex HMAC-SHA256(secret, `x-snaap-timestamp + "." + rawBody`) using constant-time comparison; reject timestamps outside a five-minute window. Match `x-snaap-id` to body ID and persist events with a unique ID before acknowledging HTTP 2xx. The example's in-memory dedup set is bounded and illustrative; replace it with durable storage for production. The legacy `x-snaap-signature` (HMAC over raw body only) is also sent for existing receivers. At-least-once retries require receiver deduplication.

## Verification

Run `npm run typecheck`, `npm test`, `npm run test:notifications`, and `npm run test:integration`. The notification integration check creates and cleans up only isolated local test accounts and makes no external provider calls. Unit transport fixtures verify LINE Flex/retry headers, Telegram text/multipart image requests and absence of paid-broadcast parameters. Browser checks cover guides, live preview controls, unavailable-channel UX and responsive layout. Real provider credentials, Telegram polling delivery, LINE webhook delivery and actual Discord/Webhook destinations still require explicit end-to-end verification with configured test accounts.

Official format and delivery references: [Telegram Bot API](https://core.telegram.org/bots/api), [LINE Flex Messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/), [LINE retry semantics](https://developers.line.biz/en/docs/messaging-api/retrying-api-request/), [Discord incoming webhooks](https://docs.discord.com/developers/resources/webhook).

## Optional signal charts

Enable the candlestick-chart option in appearance settings. New signals preserve up to 60 closed candles from their exchange, pair and timeframe at evaluation; delivery never fetches newer prices to replace this snapshot. Old signals without snapshots fall back to their normal message. The chart PNG contains only candles, price-axis labels and a reference-price line. Snaap branding appears once in the card header. Sample context is shown outside the preview card; cards and chart images omit test/DEMO markings. Structured webhook metadata retains the test flag.

Telegram and Discord upload the PNG directly. LINE uses the image in its Flex hero, which requires a public HTTPS APP_ORIGIN. Generic webhooks receive presentation.chart and a signed image URL when a public origin exists. Image URLs require a per-signal/accent HMAC and become invalid after encryption-key rotation. They include market data only. No external chart service or paid image hosting is used.

Creator names appear as a plain signature with no Created by label. LINE Flex and its studio preview place the name at the top right of the header, replacing the heading, and omit the footer. Discord uses its native embed footer; Telegram/minimal messages place the name last because provider apps control text alignment. Creator names are custom presentation labels, not verified identities; disabling attribution omits the name from recipient payloads. Provider apps control fonts for text messages. The studio uses larger, higher-contrast type and LINE Flex cards specify larger text sizes.

Protocol references: [LINE image/Flex API](https://developers.line.biz/en/reference/messaging-api/) and [Discord uploads](https://github.com/discord/discord-api-docs/blob/main/developers/reference.mdx).

Minimal layout is always plain text, even if a previously saved appearance has showChart enabled. It never renders or attaches an image, a Flex card, a Discord embed, or Telegram buttons. Discord suppresses automatic URL embeds and Telegram disables link previews. Direction/status uses one symbol: green Long/Spot buy, red Short, yellow exit, gray cancellation/expiry/unspecified direction.

Snaap cards default to a chart-enabled dark presentation with bright text and an accent color, while explicit showChart=false is respected. LINE Flex sets dark header/body/footer colors. The chart PNG itself is dark on every platform; Discord embed and Telegram caption backgrounds follow the recipient app theme. Minimal text appearance is unchanged.

LINE cards use a compact kilo bubble: one header row with optional creator name, a full chart with tap-to-open image action, and baseline label/value rows. The studio preview is capped at 280 CSS pixels and keeps readable 14px values. Long text wraps without truncation. Reference: https://developers.line.biz/en/reference/messaging-api/#bubble

The compact LINE card header displays snaap.me as bold white text at the top left, with the optional creator name at the top right. The brand label needs no hosted image. Chart output is capped at 1024 pixels to comply with LINE Flex image limits.

Cards emphasize direction with a green Long/Buy or red Short badge, separate from the pair title. LINE renders the pill as a colored box; Discord uses the direction color on the embed. Minimal test text is unchanged.

Chart annotations for timestamps, candle counts, pair/exchange, event labels and repeated branding are omitted for a clean compact card. The card body retains the readable signal details. Discord card footers show only the optional creator signature; LINE uses its header. Redundant Snaap footer text and return links are omitted.

Cards and chart backgrounds use matte neutral black #151515. Accent selections remain independent of the background. LINE uses the native kilo bubble with flexible label/value proportions and font scaling for data rows, following https://developers.line.biz/en/docs/messaging-api/flex-message-layout/ rather than a fixed pixel width in the outgoing JSON. The browser preview width is illustrative; actual LINE rendering varies with device and text settings.

All channel appearance forms use an optional heading (35 characters) in the first field. Channel names are derived from the heading or retained automatically. LINE cards display custom headings in the body; Discord includes them in the embed description and uses the selected accent color; Telegram includes them in message/caption text. Custom webhooks receive presentation.heading, signature, fields, directionBadge, accent and brandName in addition to existing text/appearance/image/chart data. These additions do not remove raw event evidence or change webhook signature verification. Each destination still saves its own appearance.
