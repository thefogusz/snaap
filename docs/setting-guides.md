# Contextual setting guides

Implemented in dist/setting-guides.js and dist/setting-guides.css. A shared SVG exclamation icon opens one descriptive tooltip on hover (220 ms), keyboard focus, or click/touch. Escape and outside pointer press dismiss it. Pointer can enter the tooltip without closing it. Position updates on scrolling/resizing and stays inside viewport. Short SVG/CSS motion plays once per opening; prefers-reduced-motion disables it. There are no chart data requests or external animation dependencies.

Guides cover exchange, market, pair, direction and mirroring, checking timeframe versus operand timeframe, operand type, OHLC/volume, source, all selectable indicator names, period, numeric threshold, MACD slow/signal, Bollinger deviation, each comparison operator, AND/OR, hold bars, confirmation window, entry/exit/cancel, cooldown, destinations and indicator import. Ordinary field values and strategy evaluation are unchanged. New dynamically rendered fields receive the same guide component.

Comparison content follows src/domain/engine.ts: CROSS_ABOVE requires previous left <= right and current left > right; CROSS_BELOW reverses them. Cooldown applies after ENTRY/EXIT and repeated entry requires the condition to become false first. CANCEL can reset a pending or active signal lifecycle. Chart captions explain the setting directly. The redundant simulation disclaimer was removed at the user’s request.

Primary design references:
- https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
- https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
- https://floating-ui.com/docs/tooltip

Choice: native SVG/CSS and one viewport-aware positioning component suit the existing vanilla JavaScript frontend. Floating UI was researched as an alternative; no React or animation framework is introduced.

Manual browser checks: comparison selector still works; selected CROSS_ABOVE changes the description; Escape dismisses; keyboard Tab from comparison focuses help and opens it; input accessible names remain intact; 390 x 844 viewport has no horizontal overflow and tooltip stays within viewport. JavaScript syntax check passed. Static animations respect reduced-motion by CSS rule; an actual OS reduced-motion preference was not changed. SVG graphics are decorative; equivalent explanation is in text.

Visual refinement: help icons sit inline next to the field caption, with 10 px separation above the input. Hover uses the existing SVG ring in accent colour, without an outer outline; keyboard focus strengthens the same ring. Tooltip body uses 15 px text and notes 14 px. Chart labels are HTML above/below the SVG plot, so candle bodies cannot overlap them.

## Semantic scenes (follow-up correction)

Removed the shared decorative candlestick fallback. `dist/guide-scenes.js` explicitly maps each setting to its teaching example. Exchange routes the selected public data source; market compares assets and perpetual contracts; pair splits base/quote; timeframe shows exact aggregation multiples; OHLC uses one labelled candle; volume shows quantity bars; comparisons calculate true/false for each close including equality and a crossing that triggers once; groups show AND versus OR; hold and confirmation use different timelines; entry, exit, cancellation, cooldown and mirroring have their own state examples. Period reads the actual indicator and operand timeframe. All 31 built-in indicator names have a specific formula or calculation example matching the engine. Names, destinations, imports and custom formulas have no unrelated animation.

Formula cards are short animated explanations, not live indicator charts. Numeric values illustrate a calculation and are explicitly labelled as example inputs. Comparison/OHLC chart geometry follows the illustrated close/open values. Captions remain outside the plot.

Knowledge references (in addition to the evaluator implementation):
- https://www.binance.com/en/academy/glossary/candlestick
- https://www.tradingview.com/support/solutions/43000502589-moving-averages/
- https://www.tradingview.com/support/solutions/43000501840-bollinger-bands-bb/

## Beginner legibility correction

OHLC now anchors labels directly to the high/low wick tips and open/close body edges, with prices 110/95/100/106 and highlighting for the chosen field. Volume labels every bar. Comparison labels prices at close dots and the reference level. Timeframe illustrates labelled smaller candles and their aggregation. Standard moving average examples compute their displayed lines from example prices, with line legends and endpoint values; bounded oscillator examples show a labelled numeric scale; Bollinger examples show explicit upper/middle/lower levels; volume ratio shows average versus latest quantity. Composite sources use the same OHLC picture with numeric HL2/HLC3/OHLC4 calculations. Formula-only cases remain short calculation examples where a graphic would add little.

Indicator settings use two columns, with operand kind across the top. The formula-reference link sits in a separate footer after all fields, preventing it from consuming a grid slot and creating a large empty row. Mobile uses one column. Visual samples are illustrative numbers, not fetched market prices. Strategy behaviour remains unchanged.
