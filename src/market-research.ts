import { z } from 'zod';
import type pg from 'pg';
import { candles, instruments, marketTickers, observeCatalog, type TickerSnapshot } from './markets.js';
import { ApiError } from './errors.js';
import { exchangeSchema, frames, indicator, timeframe, type Candle } from './domain/engine.js';
import { freshness } from './domain/insights.js';
import { lastClosedBoundary } from '../dist/timeframes.js';

export const researchExchange = exchangeSchema;
export const screenQuerySchema = z.object({
  exchange: z.enum(['all', ...researchExchange.options]), market: z.enum(['Spot', 'Perpetual Futures']),
  category: z.enum(['crypto','stocks','forex','metals','commodities','indices','other']).nullable(),
  theme: z.enum(['meme']).nullable(),
  sort: z.enum(['volume', 'gainers', 'losers', 'new']), limit: z.number().int().min(1).max(20),
  minQuoteVolume: z.number().finite().nonnegative(), excludeBases: z.array(z.string().regex(/^[A-Z0-9]{1,30}$/)).max(20),
  newSinceDays: z.number().int().min(1).max(90),
}).strict();
type ScreenQuery = z.infer<typeof screenQuerySchema>;
type RankedTicker = TickerSnapshot['items'][number] & { exchange: z.infer<typeof researchExchange>; fetchedAt: number; firstObservedAt?: string; listingBasis?: 'PROVIDER_LAUNCH'|'FIRST_OBSERVED' };
export function rankSnapshots(snapshots: TickerSnapshot[], query: ScreenQuery, newlyObserved = new Map<string, string>()) {
  const rows = new Map<string, RankedTicker>();
  for (const snapshot of snapshots) for (const item of snapshot.items) {
    const [base, quote] = item.pair.split('/');
    const firstObservedAt = newlyObserved.get(snapshot.exchange + ':' + item.pair);
    const recentLaunch = item.listedAt != null && item.listedAt <= Date.now() && item.listedAt >= Date.now()-query.newSinceDays*86400000;
    if (quote !== 'USDT' || query.excludeBases.includes(base) || !Number.isFinite(item.quoteVolume) || item.quoteVolume < query.minQuoteVolume) continue;
    if (query.sort === 'new' && !firstObservedAt && !recentLaunch) continue;
    // One actual venue per pair; this is neither summed turnover nor a worldwide coin ranking.
    const key = [item.category ?? 'crypto',item.product ?? query.market,item.pair].join(':');
    const previous = rows.get(key);
    if (!previous || item.quoteVolume > previous.quoteVolume) rows.set(key, { ...item, exchange: snapshot.exchange, fetchedAt: snapshot.fetchedAt, ...(firstObservedAt ? { firstObservedAt } : {}), ...(query.sort==='new' ? {listingBasis: recentLaunch ? 'PROVIDER_LAUNCH' : 'FIRST_OBSERVED'} : {}) });
  }
  return [...rows.values()].filter(item => query.sort === 'gainers' ? item.changePercent !== null && Number.isFinite(item.changePercent) && item.changePercent > 0 : query.sort === 'losers' ? item.changePercent !== null && Number.isFinite(item.changePercent) && item.changePercent < 0 : true)
    .sort((a, b) => query.sort === 'gainers' ? b.changePercent! - a.changePercent! : query.sort === 'losers' ? a.changePercent! - b.changePercent! : query.sort === 'new' ? (b.listingBasis==='PROVIDER_LAUNCH'?b.listedAt!:Date.parse(b.firstObservedAt!)) - (a.listingBasis==='PROVIDER_LAUNCH'?a.listedAt!:Date.parse(a.firstObservedAt!)) : b.quoteVolume - a.quoteVolume).slice(0, query.limit);
}
export async function screenAssets(db: pg.Pool, raw: unknown, reads = { instruments, tickers: marketTickers }) {
  const query = screenQuerySchema.parse(raw);
  const exchanges = query.exchange === 'all' ? researchExchange.options : [query.exchange];
  const results = await Promise.allSettled(exchanges.map(async exchange => {
    const catalog = await reads.instruments(exchange, query.market);
    await observeCatalog(db, exchange, query.market, catalog);
    const snapshot = await reads.tickers(exchange, query.market);
    const supported = new Map(catalog.items.filter(m => m.supported).map(m => [m.symbol,m]));
    return { ...snapshot, items: snapshot.items.flatMap(item => {
      const meta = supported.get(item.pair);
      if (!meta || !item.pair.endsWith('/USDT') || (query.category && (meta.category??'crypto')!==query.category) || (query.theme==='meme' && meta.meme!==true)) return [];
      return [{...item,category:meta.category??'crypto',product:meta.product,meme:meta.meme??null,listedAt:meta.listedAt??null}];
    }) };
  }));
  const snapshots = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  if (!snapshots.length) throw new ApiError(502, 'SCREEN_UNAVAILABLE', 'แหล่งข้อมูลคัดกรองไม่พร้อม กรุณาลองใหม่');
  const newlyObserved = new Map<string, string>();
  if (query.sort === 'new') {
    const found = await db.query('SELECT exchange,pair,first_observed_at FROM market_listings WHERE exchange=ANY($1::text[]) AND market=$2 AND NOT baseline AND first_observed_at>=now()-($3::int * interval \'1 day\')', [snapshots.map(s => s.exchange), query.market, query.newSinceDays]);
    for (const row of found.rows) newlyObserved.set(row.exchange + ':' + row.pair, new Date(row.first_observed_at).toISOString());
  }
  return { category: query.category, theme:query.theme, market: query.market, quote: 'USDT', window: 'rolling 24 hours', ranking: 'highest-volume venue per exact category/product/pair; not summed or global turnover; tickers do not prove identical contracts or coin addresses',
    sources: results.map((result, i) => ({ exchange: exchanges[i], status: result.status === 'fulfilled' ? 'READY' : 'UNAVAILABLE', fetchedAt: result.status === 'fulfilled' ? new Date(result.value.fetchedAt).toISOString() : null,
      reason: result.status === 'fulfilled' ? null : result.reason instanceof ApiError && result.reason.code === 'TICKER_DATA_INCOMPARABLE' ? 'INCOMPARABLE_DATA' : 'PUBLIC_DATA_UNAVAILABLE',
      volumeCoverage: result.status === 'fulfilled' ? result.value.items.length : 0,
      ...(['gainers','losers'].includes(query.sort) ? {changeCoverage: result.status === 'fulfilled' ? result.value.items.filter(item => item.changePercent !== null).length : 0} : {}),
    })),
    items: rankSnapshots(snapshots, query, newlyObserved), criteria: query,
    ...(query.sort === 'new' ? { listingMeaning: 'PROVIDER_LAUNCH: provider contract launch/onboard time, not token creation. FIRST_OBSERVED: First observed by Snaap after baseline, not an official listing date.' } : {}),
    ...(query.theme==='meme' ? {themeCoverage:'Only products explicitly tagged Meme by their own venue metadata; unknown labels excluded. Empty results do not imply no meme coins.'} : {}),
  };
}

export const analysisQuerySchema = z.object({
  market: z.enum(['Spot', 'Perpetual Futures']), timeframe,
  targets: z.array(z.object({ exchange: researchExchange, pair: z.string().regex(/^[A-Z0-9._-]+\/[A-Z0-9._-]+$/).max(80) }).strict()).min(1).max(10),
}).strict();
export function analyzeRows(rows: Candle[], frame: keyof typeof frames, now = Date.now()) {
  const closed = rows.filter(row => row.time <= lastClosedBoundary(now, frame)), state = freshness(frame, closed, now);
  const status = state.status === 'CURRENT' && closed.length < 232 ? 'INSUFFICIENT' : state.status;
  const base = { ...state, status, bars: closed.length, trend: null as 'UP' | 'DOWN' | 'MIXED' | null, metrics: null as null | { close: number; ema20: number | null; ema50: number | null; rsi14: number | null; atr14: number | null; volumeRatio20: number | null } };
  if (status !== 'CURRENT') return base;
  const metric = (name: string, period: number) => { const value = indicator(closed, name, period); return value !== undefined && Number.isFinite(value) ? value : null; };
  const metrics = { close: closed.at(-1)!.close, ema20: metric('EMA', 20), ema50: metric('EMA', 50), rsi14: metric('RSI', 14), atr14: metric('ATR', 14), volumeRatio20: metric('VOLUME_RATIO', 20) };
  const trend = metrics.ema20 === null || metrics.ema50 === null ? null : metrics.close > metrics.ema20 && metrics.ema20 > metrics.ema50 ? 'UP' : metrics.close < metrics.ema20 && metrics.ema20 < metrics.ema50 ? 'DOWN' : 'MIXED';
  return { ...base, trend, metrics };
}
export async function analyzeAssets(raw: unknown, read = candles) {
  const query = analysisQuerySchema.parse(raw);
  const targets = [...new Map(query.targets.map(target => [target.exchange + ':' + target.pair, target])).values()];
  const results = await Promise.allSettled(targets.map(async target => ({ ...target, ...analyzeRows(await read(target.exchange, query.market, target.pair, query.timeframe, 240), query.timeframe) })));
  return { market: query.market, timeframe: query.timeframe, interpretation: 'Closed-candle observations, not a prediction. UP: close > EMA20 > EMA50; DOWN: close < EMA20 < EMA50; otherwise MIXED.',
    items: results.map((result, i) => result.status === 'fulfilled' ? result.value : { ...targets[i], status: 'UNAVAILABLE', trend: null, metrics: null }),
  };
}
