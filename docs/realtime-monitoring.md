# Realtime monitoring

Supported closed-candle timeframes: 5m, 15m, 1h, 4h and 1d. The same frame definitions drive strategy validation, replay, REST history, realtime subscriptions and monitoring. Selecting 5m does not change existing indicator timeframes or guarantee one alert per five minutes.

Active setups share CCXT Pro OHLCV subscriptions by exchange, market, pair and required timeframe. Clients are shared per exchange/market. No AI request runs on market updates. MEXC Spot requires the installed protobufjs decoder.

Only candles followed by a later candle in the stream are treated as closed. A wall-clock boundary alone is insufficient confirmation. This conservative unified approach can wait for the next trade in a quiet instrument; it does not promise an immediate candle-close event on every exchange. Minute REST scans remain active for recovery and quiet streams. Subscription changes are reconciled during those scans, so a newly activated instrument can take up to a scan cycle to subscribe.

Stream updates merge into shared REST history caches. History is bootstrapped with REST; missing current closed candles bypass the normal 30-second cache, including higher timeframes. On stream failure caches are invalidated and reconnect attempts back off to 30 seconds. Evaluation refuses a series missing the required most recent higher/lower timeframe candle. The same rule engine is used for replay and monitoring.

An evaluation commits signals and pending deliveries, then immediately enqueues their IDs. PostgreSQL LISTEN/NOTIFY wakes workers; polling remains a backstop. The minute scan also recovers pending deliveries if a process crashes between commit and enqueue. Checkpoint locks and signal deduplication protect against concurrent REST/stream evaluation. External delivery remains at-least-once or ambiguous where providers cannot confirm a timeout; signal deduplication does not guarantee exactly-once Telegram delivery.

Validation: 54 unit tests, general integration tests, a separate temporary-schema check for committed delivery IDs, deduplication, missing higher timeframe and queue wakeup. Live BTC/USDT Spot stream subscriptions succeeded on Binance, Bybit, OKX, Bitget and MEXC. This does not validate every instrument or perpetual market, nor does it measure candle-close-to-mobile latency. No paid stream service was added.
