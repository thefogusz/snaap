# Asset-first selection and exact signal targets

Users select a category and search a ticker before choosing a source. Crypto catalogs combine supported Spot or USDT perpetual pairs from Binance, Bybit, OKX, Bitget and MEXC. Search filters rows without changing the selection. A setup supports at most 10 pairs and 50 source/pair targets.

`GET /api/v1/assets?market=Spot&refresh=false` returns merged `items`, a timestamp and per-exchange READY/UNAVAILABLE status. Partial catalogs remain usable; failure of every source returns 502. Refresh uses the existing instrument cache and request deduplication.

The default preserves existing sources and recommends a source for added assets. Recommendations use a stable exchange preference, pair availability and compatible timeframes; they do not rank liquidity or promise the best execution price. Users can explicitly recalculate recommended sources, select one exchange, or select every available exchange that supports the setup's frames. All is a snapshot; new listings or recovered sources are not added automatically.

Strategies can store `targets: [{exchange, pair}]`. `exchange` and `pairs` are the exact unions of those targets. Validation rejects duplicates, missing members and unavailable venue/pair combinations. Old strategies without targets retain the previous exchange × pairs behavior. Catalog failures do not silently remove selected assets or replace saved sources.

Monitoring, subscriptions, historical evaluation and replay use exact targets. Lifecycle/checkpoint and job keys remain isolated by rule revision, exchange and pair. Conditions are reused independently; these are alerts, not exchange orders. No prices are averaged across exchanges, and identical tickers alone do not prove token identity across venues.

Chart pair/source controls affect only the preview. The request contains one real source/pair, with source, market, exact symbol and last closed candle time displayed below the chart header. Changing the chart does not reduce saved targets. Activation and save validate each actual target against its own exchange catalog.

Stocks, ETFs, Forex, gold/commodities, indices and continuous futures offer a small starting list through the free [TradingView Advanced Chart widget](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/), with further symbol search inside the chart. Attribution remains visible. Broker reference prices, CFDs and continuous contracts are labeled. Availability and delay depend on the widget's symbol; these charts do not supply candles to Snaap's native signal engine. Options and new native noncrypto providers are deferred. No paid data subscription or new dependency was added.

Verification: unit/API checks cover catalog unions, partial outages, frame filtering, exact target validation, monitor/subscription counts, durable preset saves and chart request races. The local browser exercised real public crypto data, a MEXC-only pair plus BTC across five venues, preset application, the AAPL widget and widths 320/768/1024/1440. Preview monitoring was disabled and records used an isolated database.
