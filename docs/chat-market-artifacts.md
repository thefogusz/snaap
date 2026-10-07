# Market artifacts in Snaap chat

The existing research tools now deliver an immutable JSON snapshot directly to the chat UI. The model receives identities, coverage and interpretation limits. Selected comparison and analysis metrics remain available for reasoning; large ranking rows and historical series stay in the UI. Its response is instructed to stay within two short sentences. No generated HTML, arbitrary chart configuration, new dependency or model call is needed to render the data.

## Supported views

| Question/data | Tool | View |
| --- | --- | --- |
| Volume, gainers, losers, meme products, new contracts | `screen_assets` | Ranked bars with quote turnover, price and 24-hour change |
| Price comparison, up to five exact venue/pair targets | `read_market_visual` | Price cards |
| Closed-price history, up to three targets and 300 candles | `read_market_visual` | Interactive Lightweight Charts lines; multiple targets indexed to 100 at the first common timestamp |
| EMA/RSI/ATR and volume ratio | `analyze_assets` | Indicator cards with freshness/status |
| Supported publisher headlines | `read_market_news` | News list with original links and publication/update distinction |
| DEX pool volume/liquidity/change | `read_dex_pools` | Ranked pools with chain, token and pool identities |
| Reported chain/protocol TVL | `read_defi_context` | USD TVL bars |
| Sampled Bitcoin / bounded finalized EVM transfers | Chain readers | Evidence lists, amounts, links and coverage limits |

Pure conversation and unsupported questions remain text. These visuals do not introduce new market-data coverage, predict prices, identify unknown wallet owners, or make DEX pools signal targets.

## Persistence and controls

`messages.artifacts` stores the original snapshot atomically with a successful assistant reply. Live NDJSON completion and paginated message history render the same snapshots. Failed turns do not persist successful-looking artifacts. Follow-up context retains exact historical selections and selected metrics without historical series, explicitly dated as past snapshots rather than current evidence.

Expand, crosshair inspection and image/data export run in the browser. Charts initialize when visible and dispose when removed. Refresh reuses the stored tool/query through an authenticated, conversation-owner/workspace-scoped endpoint; it never calls the model, accepts replacement query parameters, or overwrites original chat evidence. The refreshed view is explicitly marked temporary. Provider caches and public API limits still apply.

Histories verify supported native instruments and candle integrity before rendering. Missing, invalid and delayed sources remain visible. Source links use HTTPS with no embedded credentials; all external names/headlines render as text. Dollar values, USDT turnover, raw transfer quantities and normalized price indices remain distinct.

## Verification

- `npm run typecheck`, `npm test`, `npm run test:harness`.
- Artifact checks cover series omission, invalid/unsupported history, persisted snapshots, refresh ownership/workspace boundaries, unchanged drafts, no model call on refresh, and compact follow-up context.
- Seven real OpenRouter `deepseek/deepseek-v4.1-flash` cases used live public data: rankings, comparisons, histories, news, DEX pools, TVL and EVM transfers. All completed with artifacts and no saved/activated rules. Audit output is local under `.local/audit/artifact-real-model-20261008.json`.
- Browser checks confirmed ranking recovery, temporary refresh, expansion/Escape, comparison cards and a follow-up history request using the previously selected two instruments. A 390px viewport had no page/card overflow; expanded charts and crosshair values remained usable. Container queries also adapt controls to narrow desktop chat panels. PNG generation produced a valid download link; the automation browser explicitly does not support blob downloads, so saving that file to disk could not be verified through that browser.
- The final 100-candle, two-pair history case included explicit available/requested candle counts: full data was 8,570 JSON bytes and the model receipt 826 bytes (90.4% smaller), recorded in `.local/audit/artifact-history-final-20261008.json`. This measures tool payload bytes, not total LLM tokens or total conversation cost. Small metadata-heavy receipts can be larger than their original dataset.

No new paid data service is required. Existing LLM and hosting costs remain. This feature is implemented on the task branch; production rollout is separate.
