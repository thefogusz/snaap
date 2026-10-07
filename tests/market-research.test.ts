import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSnapshots, screenQuerySchema, analyzeRows, analyzeAssets } from '../src/market-research.js';
import { marketTickers } from '../src/markets.js';
import ccxt from 'ccxt';
import { frames } from '../src/domain/engine.js';
import { lastClosedBoundary } from '../dist/timeframes.js';
import { instrumentMetadata } from '../dist/asset-catalog.js';
import { screenAssets } from '../src/market-research.js';

const query = { exchange: 'all', market: 'Spot', category: 'crypto', theme: null, sort: 'volume', limit: 10, minQuoteVolume: 0, excludeBases: [], newSinceDays: 7 };
const row = (pair: string, quoteVolume: number, changePercent: number | null) => ({ pair, quoteVolume, changePercent, last: 100, providerTime: null });
test('rankings use one real venue per USDT pair, preserve source, and exclude missing or incomparable data', () => {
  const snapshots = [
    { exchange: 'Binance', fetchedAt: 1000, items: [row('BTC/USDT', 200, 2), row('ETH/USDT', 100, -4), row('BTC/EUR', 100000, 2)] },
    { exchange: 'Bybit', fetchedAt: 1000, items: [row('BTC/USDT', 300, 3), row('NEW/USDT', 20, null), row('BAD/USDT', NaN, 99)] },
  ];
  const result = rankSnapshots(snapshots as any, screenQuerySchema.parse(query));
  assert.deepEqual(result.map(r => [r.pair, r.exchange, r.quoteVolume]), [['BTC/USDT', 'Bybit', 300], ['ETH/USDT', 'Binance', 100], ['NEW/USDT', 'Bybit', 20]]);
  assert.equal(result[0].changePercent, 3);
  assert.deepEqual(rankSnapshots(snapshots as any, screenQuerySchema.parse({ ...query, sort: 'losers' })).map(r => r.pair), ['ETH/USDT']);
  assert.deepEqual(rankSnapshots(snapshots as any, screenQuerySchema.parse({ ...query, sort: 'gainers', excludeBases: ['BTC'] })), []);
  assert.deepEqual(rankSnapshots(snapshots as any, screenQuerySchema.parse({ ...query, minQuoteVolume: 250 })).map(r => r.pair), ['BTC/USDT']);
  assert.equal(screenQuerySchema.safeParse({ ...query, limit: 1000 }).success, false);
  assert.equal(screenQuerySchema.safeParse({ ...query, market: 'stocks' }).success, false);
  assert.deepEqual(rankSnapshots([{ ...snapshots[0], items: [row('BTC/USDT', 200, 2)] }, { ...snapshots[1], items: [row('BTC/USDT', 300, -3)] }] as any, screenQuerySchema.parse({ ...query, sort: 'gainers' })), []);
});

test('analysis observes closed candles only and refuses stale, gapped or short histories', () => {
  const now = Date.now(), end = lastClosedBoundary(now, '1h'), step = frames['1h'];
  const rows = Array.from({ length: 240 }, (_, i) => ({ time: end - (239 - i) * step, open: 100 + i, close: 100 + i, high: 102 + i, low: 99 + i, volume: i === 239 ? 50 : 10 }));
  const result = analyzeRows(rows, '1h', now);
  assert.equal(result.status, 'CURRENT'); assert.equal(result.trend, 'UP');
  assert.ok(result.metrics!.ema20! > result.metrics!.ema50!);
  assert.equal(result.metrics!.rsi14, 100);
  assert.deepEqual(analyzeRows([...rows, { ...rows.at(-1)!, time: end + step, close: 1 }], '1h', now), result);
  assert.equal(analyzeRows(rows.slice(0, -1), '1h', now).trend, null);
  assert.equal(analyzeRows(rows.slice(0, -1), '1h', now).status, 'DELAYED');
  assert.equal(analyzeRows(rows.filter((_, i) => i !== 100), '1h', now).status, 'INSUFFICIENT');
  assert.equal(analyzeRows(rows.slice(-20), '1h', now).status, 'INSUFFICIENT');
});

test('1000 simultaneous requests share a snapshot; markets remain separate, malformed data is excluded, and stale failures retry', async () => {
  const constructor = (ccxt as any).mexc, realNow = Date.now;
  let calls = 0, fail = false;
  (ccxt as any).mexc = class {
    has = { fetchTickers: true };
    markets: Record<string, any>;
    constructor(options: any) {
      const spot = options.options.defaultType === 'spot';
      this.markets = Object.fromEntries(['BTC', 'BAD', 'STALE', 'MISSING'].map(base => {
        const symbol = base + '/USDT' + (spot ? '' : ':USDT');
        return [symbol, { symbol, active: true, spot, swap: !spot, linear: !spot, settle: 'USDT' }];
      }));
    }
    async loadMarkets() { return this.markets; }
    async fetchTickers() {
      calls++; if (fail) throw Error('offline');
      return Object.fromEntries(Object.keys(this.markets).map(symbol => [symbol, { symbol, last: 100, quoteVolume: symbol.startsWith('BAD') ? NaN : symbol.startsWith('MISSING') ? undefined : 500, timestamp: symbol.startsWith('STALE') ? Date.now() - 600000 : null, percentage: 3 }]));
    }
  };
  try {
    const results = await Promise.all(Array.from({ length: 1000 }, () => marketTickers('MEXC', 'Spot')));
    assert.equal(calls, 1); assert.ok(results.every(result => result === results[0]));
    assert.deepEqual(results[0].items.map(r => r.pair), ['BTC/USDT']);
    const swaps = await marketTickers('MEXC', 'Perpetual Futures'); assert.equal(calls, 2);
    assert.equal(swaps.items[0].changePercent, null, 'session-based change must not be ranked as rolling 24h');
    let expired = realNow() + 61000; Date.now = () => expired; fail = true;
    await assert.rejects(marketTickers('MEXC', 'Spot'), /โหลดสถิติ/);
    fail = false;
    await Promise.all(Array.from({ length: 1000 }, () => assert.rejects(marketTickers('MEXC', 'Spot'), /โหลดสถิติ/)));
    assert.equal(calls, 3, 'failed source must not be retried by each user');
    expired += 15001; const recovered = await marketTickers('MEXC', 'Spot');
    assert.equal(calls, 4); assert.notEqual(recovered, results[0]);
  } finally { (ccxt as any).mexc = constructor; Date.now = realNow; }
});

test('analysis preserves exact targets, bounds work and reports partial failure without replacing sources', async () => {
  const reads: any[] = [], query = { market: 'Perpetual Futures', timeframe: '1h', targets: [{ exchange: 'Binance', pair: 'BTC/USDT' }, { exchange: 'Binance', pair: 'BTC/USDT' }, { exchange: 'Bybit', pair: 'ETH/USDT' }] };
  const result = await analyzeAssets(query, async (...args) => { reads.push(args); if (args[0] === 'Bybit') throw Error('offline'); return []; });
  assert.deepEqual(reads, [['Binance', 'Perpetual Futures', 'BTC/USDT', '1h', 240], ['Bybit', 'Perpetual Futures', 'ETH/USDT', '1h', 240]]);
  assert.deepEqual(result.items.map(r => r.status), ['INSUFFICIENT', 'UNAVAILABLE']);
  await assert.rejects(analyzeAssets({ ...query, targets: Array(11).fill(query.targets[0]) }));
});

test('screening uses native classes and meme labels, with explicit provider launch evidence', async () => {
  const now = Date.now();
  const meme = instrumentMetadata('Binance', {info:{underlyingType:'COIN',underlyingSubType:['Meme'],onboardDate:now-1000}}, 'Perpetual Futures');
  assert.equal(meme.meme, true);
  assert.equal(meme.listedAt, now-1000);
  assert.equal(instrumentMetadata('Gate',{info:{contract_type:'stocks',launch_time:Math.floor(now/1000)-1}},'Perpetual Futures').meme,null);
  const reads:any = {
    instruments: async () => ({at:now,items:[{symbol:'DOGE/USDT',supported:true,...meme},{symbol:'TSLA/USDT',supported:true,category:'stocks',product:'reference_perpetual',meme:null,listedAt:null}]}),
    tickers: async () => ({exchange:'Binance',fetchedAt:now,items:[row('DOGE/USDT',50,2),row('TSLA/USDT',100,3)]}),
  };
  const db:any={ query:async()=>({rows:[]}),connect:async()=>({query:async(text:string)=>text.startsWith('SELECT observed')?{rows:[{observed_at:new Date(now)}]}:{rows:[],rowCount:0},release(){}})};
  const crypto = await screenAssets(db,{...query,exchange:'Binance',market:'Perpetual Futures',theme:'meme'},reads);
  assert.deepEqual(crypto.items.map(i=>i.pair),['DOGE/USDT']);
  const stocks = await screenAssets(db,{...query,exchange:'Binance',market:'Perpetual Futures',category:'stocks'},reads);
  assert.deepEqual(stocks.items.map(i=>i.pair),['TSLA/USDT']);
  const newly = await screenAssets(db,{...query,exchange:'Binance',market:'Perpetual Futures',sort:'new'},reads);
  assert.equal(newly.items[0].listingBasis,'PROVIDER_LAUNCH');
  assert.equal(newly.items[0].listedAt,now-1000);
});
