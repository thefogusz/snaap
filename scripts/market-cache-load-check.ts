import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import ccxt from 'ccxt';
import * as markets from '../src/markets.js';
import { frames, value } from '../src/domain/engine.js';

// Exercise the real cache with deterministic public-market replies; never open exchange sockets.
const realNow = Date.now, step = frames['5m'], end = Math.floor(realNow() / step) * step;
Date.now = () => end + 1000;
const raw = Array.from({length:2400},(_,i)=>[end-(2400-i)*step,100+i*.01,102+i*.01,98+i*.01,100+i*.01,100]);
const original = (ccxt as any).binance;
let requests = 0, offline = false;
(ccxt as any).binance = class {
  has = {fetchOHLCV:true};
  markets = {'LOAD/USDT':{active:true,spot:true}};
  async loadMarkets(){return this.markets;}
  async fetchOHLCV(_pair:string,_frame:string,since:number,limit:number){
    requests++; if(offline)throw new Error('simulated outage');
    return raw.filter(row=>row[0]>=since).slice(0,limit);
  }
};
try {
  for(const bars of [500,700,1000,2032])await markets.candles('Binance','Spot','LOAD/USDT','5m',bars);
  const closed = raw.slice(-300).map(row=>({time:row[0]+step,open:row[1]!,high:row[2]!,low:row[3]!,close:row[4]!,volume:row[5]!}));
  markets.ingestClosedCandles('Binance','Spot','LOAD/USDT','5m',closed);
  const before = await markets.candles('Binance','Spot','LOAD/USDT','5m',2032);
  const indicator = {kind:'INDICATOR' as const,name:'TEMA',period:500,timeframe:'5m' as const};
  const evidence = value(indicator,{'5m':before},end);
  assert.ok(Number.isFinite(evidence));
  const requestCount = requests, cpu = process.cpuUsage(), begin = performance.now();
  for(let i=0;i<5000;i++)markets.ingestClosedCandles('Binance','Spot','LOAD/USDT','5m',closed.map(bar=>({...bar})));
  const elapsed = performance.now()-begin, usedCpu=process.cpuUsage(cpu);
  const after = await markets.candles('Binance','Spot','LOAD/USDT','5m',2032);
  assert.deepEqual(after,before,'unchanged stream updates must preserve every candle');
  assert.equal(value(indicator,{'5m':after},end),evidence,'indicator evidence must stay identical');
  assert.equal(requests,requestCount,'stream updates must not fetch REST history');
  const correction={...closed.at(-1)!,close:closed.at(-1)!.close+.25};
  markets.ingestClosedCandles('Binance','Spot','LOAD/USDT','5m',[correction]);
  assert.equal((await markets.candles('Binance','Spot','LOAD/USDT','5m',2032)).at(-1)!.close,correction.close);
  markets.invalidateCandles('Binance','Spot','LOAD/USDT','5m');
  offline=true;
  await assert.rejects(markets.candles('Binance','Spot','LOAD/USDT','5m',2032));
  offline=false;
  const recovered=await markets.candles('Binance','Spot','LOAD/USDT','5m',2032);
  assert.deepEqual(recovered,before,'recovery must restore the provider history');
  console.log(JSON.stringify({scenario:'4 warmup variants; 5000 unchanged 300-bar stream snapshots; simulated outage/recovery',
    elapsedMs:Math.round(elapsed),nodeCpuMs:Math.round((usedCpu.user+usedCpu.system)/1000),
    preservesSharedArray:after===before,restWarmupRequests:requestCount,errors:0}));
} finally {(ccxt as any).binance=original;Date.now=realNow;}
