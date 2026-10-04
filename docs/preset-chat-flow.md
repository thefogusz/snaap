# Preset chat flow — 2026-10-04

Six editable deterministic templates: trend price/EMA 20 with EMA 200 filter; EMA 20/50 crossover; RSI 50 + EMA 50 momentum; RSI 30/70 recovery; Bollinger 20/2 breakout with volume ratio >1.5; Supertrend 10/3 direction change. Defaults are starting examples, not optimized or profit-tested strategies. Each includes an indicator-based exit and three closed bars of cooldown after the signal cycle ends. These are alerts, not exchange orders or guaranteed stop losses.

## Audience selection

The picker describes intended audience, screen attention, experience level and one concrete limitation per style. Filters: all, beginner, short term, multi-session trend following. The labels describe intent; they promise neither a holding duration nor a signal count. Indicator mechanics are progressively disclosed in the first chat card, followed by actual conditions in review. Market, price-source exchange and direction remain explicit choices in chat. These audience labels are Snaap design judgments rather than backtest findings.

No template is labeled safe or optimized for high leverage. Optional guidance explains that closed-bar alerts do not track an individual liquidation price or place exchange stop orders. Reference: [Bybit margin and effective leverage](https://www.bybit.com/en/help-center/article/?id=000001053&language=en_US). Leverage itself is not an implemented Snaap setup parameter.

## Source concepts

- [TradingView Moving Averages](https://www.tradingview.com/support/solutions/43000502589-moving-averages/): trend confirmation and crossing concepts.
- [TradingView Bollinger Bands](https://in.tradingview.com/support/solutions/43000501840-bollinger-bands-bb/): baseline 20-period average and volatility bands.
- [TradingView Technical Ratings](https://www.tradingview.com/support/solutions/43000614331-technical-ratings/): RSI recovery context. The concrete presets and combinations above are Snaap's implementation choices, not claimed TradingView strategies or endorsement.

## Flow

Preset button is a sibling below the composer, aligned right, outside the composer scroll area. Empty-chat bottom padding adapts to available height. Opening the picker makes no draft or LLM request. Selecting a style starts three local card steps: exchange/market/direction, live catalog pair/timeframe, explicit review/apply. Applying replaces this conversation's draft with revision checks, and stores an assistant summary plus `messages.ui_card` in one transaction.

Only the latest preset card can save a conversation draft. Older cards remain historical snapshots. Save verifies instruments, schema, owned verified destinations and draft revision; creates one rule per card; repeated unchanged saves reuse its ID and revision. Changes to existing saved rules require their current revision and pause the rule. Activation calls the existing real activation endpoint, enforcing monitoring readiness, instrument data, destination verification and quota. It never calls an LLM.

Notification choices, channel connection instructions and verification refresh are available inside the card. External providers must be configured on the server; the present local server has none configured, so only the in-app inbox can be verified here. Ordinary typed AI turns continue through the existing paid harness.

## Verification

- Full suite: 307 tests pass, typecheck passes.
- Template matrix: 122 new checks, including six styles, all five frames, Spot/Long/Short/Both. RSI Short independently crosses below 70; Long crosses above 30.
- `scripts/preset-contract-check.ts`: isolated owner/session/workspace, durable summary/card, real rule and revision persistence, repeat-save idempotency, stale-draft and superseded-card conflicts, activation/pause, zero usage ledger entries, unknown-conversation rejection. Test records cleaned afterward.
- Real in-app browser: Futures Both ETH/USDT RSI; Spot BTC/USDT EMA; filtered live pairs; actual chat save; repeat save keeps v1; reload restores card; external-channel unavailable state remains in chat. An event-selector collision found on the first UI save was fixed by using `data-preset-save` instead of the designer's `data-save`.
- At 1280×720: composer client/scroll height 152/152; chat pane 503/503. Preset visible below the right edge of the composer without scrolling.
