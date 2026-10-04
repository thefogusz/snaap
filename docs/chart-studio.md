# Interactive setup studio — 2026-10-04

The editor now selects one exchange and one chart pair. Existing multi-target records are retained; preview asks the user to select a single target instead of silently choosing the first.

## Shipped

- Condition timeframe views: the chart has one button per timeframe used by the setup, including confirmation, exit, cancel and independent Short conditions. Each comparison also offers a direct “ดูกราฟ” shortcut. Selecting a view changes candles and visible indicators only; the draft and evaluation timeframe remain unchanged.
- Preview accepts optional `chartFrame` restricted to the setup's required frames. `source.frame` identifies the displayed candles and `source.evaluationFrame` identifies the signal clock. Raw `timeline` and `events` remain evaluated on the original strategy. Separate `chartTimeline` uses the most recent non-stale evaluation at or before each displayed close; `chartEvents` places signals on their containing displayed closed candle, retaining the original `signalTime`. Gaps have no invented evidence or markers.

- Locally served Lightweight Charts 5.2.0, Apache 2.0 license/NOTICE and TradingView attribution.
- Candles, condition indicator overlays/panes, entry/exit/cancel/expiry markers, zoom/pan, play/pause, step, timeline scrub, and per-bar evidence.
- Debounced automatic preview after editor or agent draft updates; response generations reject stale results. Preview is authenticated and does not persist replay rows on every keystroke.
- Optional chart-only indicators explicitly separated from alert conditions; up to eight additions. These visual additions last for the current page session.
- Shared engine operand evaluation for chart values and alerts, including closed higher-timeframe bars and insufficient-data gaps.
- Searchable instrument catalog from CCXT loadMarkets, active Spot and swap markets. The evaluator currently supports Spot and USDT-settled linear swaps; other swaps are displayed as unsupported. API catalogs are not a guarantee of parity with every instrument in an exchange website.
- Draft proposals apply automatically only if the user has not edited the draft while waiting. Conflicting replies require comparison. Undo remains available. Draft application does not activate an alert.
- Agent can search actual instruments and must validate a proposed instrument before returning a draft.

## Verification

- 21 unit tests passed, including shared-engine preview parity, higher-timeframe future exclusion, and insufficient data. TypeScript check passed.
- Read-only Spot catalog probes returned Binance 1372, Bybit 530, OKX 1143, Bitget 3387, MEXC 1822 pairs at test time (counts change).
- Browser: Binance and MEXC real candle previews; EMA 200 -> 50 changed the plotted line and signal count; RSI extra pane; play/pause; latest; per-bar evidence; search ETH/BTC in Binance catalog.
- Mobile layout checked at 390px; compact controls adjusted after finding tab wrapping. Both themes use existing tokens.

## Explicit limits

- Market candles are fetched through REST and refreshed every 30 seconds, not a tick-by-tick WebSocket stream. Only closed candles are used.
- Fetch window is up to 500 candles per timeframe; warm-up can leave some indicators unavailable. Preview is signal replay, not execution or profit backtesting.
- No claim that formulas match every exchange chart or that all exchange UI indicators are supported.
- Local AI is not configured. End-to-end model behavior, image-to-draft quality, and adversarial harness evaluation remain unverified.
- Saving an already active rule still follows existing backend behavior: creates a revision and pauses it pending activation. Chat draft changes do not touch that active rule.

References: https://github.com/tradingview/lightweight-charts ; https://tradingview.github.io/lightweight-charts/tutorials/how_to/panes ; https://tradingview.github.io/lightweight-charts/tutorials/how_to/series-markers ; https://www.mexc.com/api-docs/spot-v3/market-data-endpoints
