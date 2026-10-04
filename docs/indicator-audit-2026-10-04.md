# Indicator expansion and audit — 4 October 2026

31 built-in output series (previously 10), plus CUSTOM declarative formula v1. A multi-output family such as MACD or Donchian counts each output separately; this is not a claim of 31 unrelated algorithms or every indicator available on every exchange.

Added: WMA, RMA, VWMA, ROC, MOM, population STDDEV/VARIANCE, HIGHEST/LOWEST, Donchian upper/lower/mid, raw STOCH_K, WILLIAMS_R, CCI, MFI, CMF, BB_MIDDLE/WIDTH/PERCENT and TR.

User-facing definitions and limitations are in `dist/indicator-guide.html`, linked from the editor. OHLC-specific indicators ignore the generic source setting, which is hidden in the editor. CCI uses the explicitly chosen source; choose hlc3 for typical price. Stochastic is raw %K, not smoothed K/D. Bollinger width is a percentage; %B is a fraction. Undefined denominator or insufficient data returns unknown rather than a manufactured zero.

## Audit evidence

- 48 total unit tests pass, including hand-calculated ramp fixtures for every added output, flat/zero-volume degeneracies, mixed-flow MFI and CMF, future-candle mutation invariance, and chart-point/rule-evidence equality for all added outputs.
- CUSTOM EMA12−EMA26 matches seeded MACD numerically. Strict schema rejects executable fields and more than eight terms; missing formula rejects strategy validation.
- Existing seeded EMA/MACD reference tests, multi-timeframe/no-future tests, replay and monitor integration tests remain green.
- TypeScript and frontend syntax checks pass.
- Browser: imported the shipped JSON through the actual file chooser and validation API, saw its title in the editor, summary and chart legend, and rendered against Binance BTC/USDT 15m closed candles. No console warnings/errors captured.
- Browser import only created an editable draft, never activated a setup or sent a notification.

These are evidence for the specified mathematical implementation, not a universal proof or exchange/TradingView numerical certification. No full cross-platform golden dataset was supplied or compared. Recursive seeded indicators may differ with historical start position. New exchange-specific indicators and arbitrary Pine semantics remain unsupported until implemented and tested.

## Import contract

SNAAP JSON v1: title, version=1, offset, up to 8 weighted terms of SMA/EMA/WMA/RMA/RSI/ATR/ROC/MOM/STDDEV. Each term has period 2–500 and bounded finite weight. Same operand timeframe; generic selected source applies except ATR uses original OHLC. Formula travels inside immutable strategy revision, so graph, replay and monitoring can evaluate it without a separate local library. Import validates server-side before applying to the draft. It never executes JavaScript, Python or Pine. This limited language does not support arbitrary custom indicators.

Example file: `dist/assets/indicator-example.json`. Import entry point: indicator operand → นำเข้าอินดิเคเตอร์ / TradingView. Undo uses the existing draft undo history.

## Sources

- [TradingView script types](https://www.tradingview.com/support/solutions/43000482573-what-are-the-different-types-of-published-scripts/): protected scripts do not expose source. The import help does not suggest bypassing protection.
- [TradingView built-in source availability](https://www.tradingview.com/support/solutions/43000481659-i-want-to-see-the-source-code-of-a-built-in-script/): not every built-in has accessible Pine source.
- [TradingView CCI](https://www.tradingview.com/support/solutions/43000502001-commodity-channel-index-cci/) and [CMF](https://www.tradingview.com/support/solutions/43000501974-chaikin-money-flow-cmf/): formula references. Code here is independently implemented; no external indicator source copied.

Next coverage should prioritize audited smoothed Stochastic/Stoch RSI, DMI/ADX, Supertrend and Ichimoku with displacement semantics, followed by exchange-matched fixtures. Importing arbitrary Pine is a separate interpreter/compiler project and is not presented as supported.
