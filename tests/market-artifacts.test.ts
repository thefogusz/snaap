import test from 'node:test';
import assert from 'node:assert/strict';
import { marketArtifact, artifactReceipt, readMarketVisual } from '../src/market-artifacts.js';
import { lastClosedBoundary } from '../dist/timeframes.js';

test('visual snapshots keep full data out of the model and reject broken or unsupported histories', async () => {
  const end = lastClosedBoundary(Date.now(), '1h');
  let reads = 0;
  const readers = {
    instruments: async () => ({ items: [{ symbol: 'BTC/USDT', supported: true }] }),
    candles: async () => { reads++; return Array.from({length: 50}, (_, i) => ({ time:end-(49-i)*3600000,open:10,high:12,low:9,close:11,volume:20 })); },
  } as any;
  const query = { kind:'history', market:'Spot', targets:[{exchange:'Binance',pair:'BTC/USDT'}],timeframe:'1h',bars:50 };
  const data = await readMarketVisual(query, readers);
  const artifact = marketArtifact('read_market_visual', query, data)!;
  assert.equal(artifact.kind, 'history');
  assert.equal(artifact.data.items[0].points.length, 50);
  assert.equal(artifactReceipt(artifact).items[0].points, undefined);
  const partial=await readMarketVisual({...query,bars:100},readers);
  assert.equal((partial.items[0] as any).bars,50);
  assert.equal((partial.items[0] as any).historyCoverage,'PARTIAL');
  assert.equal(partial.requestedBars,100);
  assert.ok(JSON.stringify(artifactReceipt(artifact)).length < JSON.stringify(data).length / 2);
  const missing = await readMarketVisual({...query,targets:[{exchange:'Binance',pair:'BAD/USDT'}]}, readers);
  assert.equal(missing.items[0].status, 'UNAVAILABLE'); assert.equal(reads, 2);
  const broken = await readMarketVisual(query, {...readers,candles:async()=>[{time:end,open:10,high:8,low:9,close:11,volume:20}]});
  assert.equal(broken.items[0].status, 'INSUFFICIENT'); assert.deepEqual((broken.items[0] as any).points, []);
  assert.equal(marketArtifact('screen_assets', {}, {error:'unavailable'}), null);
  const ranking = marketArtifact('screen_assets', {sort:'volume'}, {items:Array.from({length:20},(_,i)=>({pair:`C${i}/USDT`,exchange:'Binance',quoteVolume:20-i,providerTime:null}))})!;
  assert.equal(ranking.data.items.length, 20); assert.equal(artifactReceipt(ranking).items[19].quoteVolume, undefined);
  const comparison=marketArtifact('read_market_visual',{kind:'comparison'},{items:[{pair:'BTC/USDT',last:10,quoteVolume:100,changePercent:2}]})!;
  assert.equal(artifactReceipt(comparison).items[0].last,10);
  const analysis=marketArtifact('analyze_assets',{}, {items:[{pair:'BTC/USDT',metrics:{rsi14:80}}]})!;
  assert.equal(artifactReceipt(analysis).items[0].metrics.rsi14,80);
});
