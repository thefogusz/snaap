# Setup Studio

The combined chat/setup view is a chart workspace. Desktop keeps the agent,
chart and condition inspector in independent panes. At 900–1279px the inspector
switches between agent, conditions and evidence; below 900px the chart stays above
the independently scrolling inspector. The mobile layout also responds to the
visual viewport when a software keyboard opens.

## Draft and chart semantics

- Standard intervals run from 5m through 1w (no 1m/3m/monthly/custom intervals).
  `dist/timeframes.js` shares durations and native exchange/market availability
  across the UI, schema and harness. Unsupported operands are rejected, including
  independent Short branches. Weekly streams and monitor checkpoints use Monday
  UTC boundaries. Changing exchange preserves draft values and visibly marks an
  unsupported saved interval; only chart navigation falls back to an available
  frame. The toolbar scrolls horizontally when its interval list is wider than
  the chart.

- `StrategySpec v2` remains the saved/evaluated strategy. The shared maximum is
  `MAX_SETUP_CONDITIONS = 24` in `dist/setup-limits.js`, including independently
  authored Short conditions. Mirrored Short templates count once. Existing group,
  nesting and stage limits are unchanged.
- Chart timeframe is navigation state. Changing it never rewrites
  `spec.timeframe`, which controls signal evaluation and cross/HOLD semantics.
- Indicator search adds a session-only chart indicator (up to eight per frame).
  “Use to create a condition” explicitly adds an AND condition without flattening
  existing OR/HOLD groups. Once promoted, its operand comes from the strategy.
- Hidden lines remain part of the evaluated strategy. Editing an identical
  operand shared by multiple conditions lists affected conditions before applying
  the change to all references. Validation and stale-draft guards run first.
- Chart preferences are scoped by user, workspace and conversation in
  `sessionStorage`; they are not exported or saved as executable strategy fields.
- All editor changes invalidate evidence and in-flight chart responses. Pending
  or failed previews leave the previous chart dimmed and noninteractive rather
  than presenting old evidence as current. UNKNOWN is shown as insufficient data.

## API and harness contract

`POST /api/v1/preview` accepts optional `chartTimeframe` alongside existing `spec`
and `indicators`. Omission preserves old chart behavior. `candles` and `overlays`
are chart data; `timeline` and `events` are evaluated on `spec.timeframe`.
`chartTimeframe` and `evaluationTimeframe` explicitly identify both datasets.
Timeline rows include actual closed-candle reference timestamps and stale flags
for evaluation timeframes. On a different chart timeframe the UI shows an event
list that opens the evaluation chart, without relocating signal markers.

Turn requests optionally carry `editorContext` with `pair`, `chartTimeframe`,
`conditionPath` and `selectedBarTime` (Unix milliseconds at candle close). Pairs
and condition paths must belong to the submitted draft. The context is a focus
hint, never market evidence. Invalid focus is rejected before provider/quota work.

The `inspect_setup_bar` tool accepts `pair` and `selectedBarTime`, uses only the
successfully proposed or current request draft, retrieves public closed candles,
and returns lifecycle-aware evidence from the preceding evaluation candle,
reference times and history coverage. It preserves existing deadlines, tool
budgets, source handling and activation restrictions. An empty historical window
returns no evaluation bar rather than inventing a result.

Manual changes made during an agent turn still require proposal comparison.
Change receipts come from `diffSetup`, link to affected editor conditions, and
cannot undo later edits. Saving and the existing activation confirmation remain
separate actions. No monitoring, trading or profit backtesting is added.

## Validation

- `npm run typecheck`, `npm test`, `npm run test:harness`.
- Added engine/API tests for chart/evaluation separation, 24/25 condition limits,
  OR/HOLD projections, shared operands, missing-data evidence, editor focus and
  preceding closed-bar inspection. Harness fixtures verify invalid focus never
  reaches the provider and exercise the inspection function call.
- `node --import tsx scripts/studio-ui-server.ts` runs an isolated development
  fixture at `http://127.0.0.1:4189`: synthetic candles, a local Responses API
  simulator and no monitor. The simulator uses port 4191 (4190 is blocked by
  Fetch). Database state is in a unique fixture schema, separate from real work.
- `node scripts/studio-browser-check.cjs` runs the browser scenarios against that
  fixture server. It requires Playwright (or `SNAAP_PLAYWRIGHT_PATH` pointing to
  its installed package) and uses Edge on Windows. Screenshots are written to
  `.local/audit/`. The runner never confirms activation.
- Browser checks cover search → settings → condition creation → manual edits,
  chart visibility during inspector scrolling, and 1440/1024/390px in both themes.
  Agent checks cover delayed proposal conflicts, keeping edits, receipts/undo,
  saving and opening/cancelling activation confirmation.

These are deterministic interaction tests. Real-provider quality, actual software
keyboard behavior on physical phones, and usability with real participants still
require separate evaluation; no live-model or user-study success is claimed.

Design references: [TradingView multi-condition alerts](https://www.tradingview.com/support/solutions/43000761492-multi-condition-alerts/),
[TrendSpider Sidekick](https://trendspider.com/blog/sidekick-ai-strategy-builder/),
[Composer Create with AI](https://help.composer.trade/article/108-create-with-ai).

Interval references: [Binance candles](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints),
[Bybit kline](https://bybit-exchange.github.io/docs/v5/market/kline),
[Bitget Spot](https://www.bitget.com/zh-CN/docs/catalog/classic-spot-market/classic-spot-market),
[MEXC Spot](https://mexcdevelop.github.io/apidocs/spot_v3_en/) and
[MEXC Futures](https://mexcdevelop.github.io/apidocs/contract_v1_en/).
Availability is also checked against the installed CCXT adapter definitions,
including Bitget's separate Spot/swap maps and OKX's default UTC REST candles.
