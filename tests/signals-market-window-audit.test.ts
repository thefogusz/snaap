import {test} from 'node:test';
import assert from 'node:assert/strict';
import ccxt from 'ccxt';
import {strategySeries,candles,marketHealth,ingestClosedCandles} from '../src/markets.js';
import {strategySchema,value,frames} from '../src/domain/engine.js';

// Isolated in node:test's worker process: ccxt constructor is replaced before first use.
// No sockets, real exchange calls, owner records, or notifications.
const now=Date.now(),step=frames['5m'],end=Math.floor(now/step)*step;
const raw=Array.from({length:2400},(_,i)=>[end-(2400-i)*step,100+i*.01,102+i*.01,98+i*.01,100+i*.01,100]);
const original=(ccxt as any).binance;
let mode:'normal'|'lagging'='normal';
(ccxt as any).binance=class {
 has={fetchOHLCV:true};
 markets=Object.fromEntries(['AUDITTEMA/USDT','AUDITLAG/USDT'].map(symbol=>[symbol,{active:true,spot:true}]));
 async loadMarkets(){return this.markets;}
 async fetchOHLCV(_symbol:string,_frame:string,since:number,limit:number){
  return raw.filter(row=>row[0]>=since&&(mode!=='lagging'||row[0]+step<=end-step)).slice(0,limit);
 }
};

test('accepted TEMA 500 retains its requested warmup and yields finite evidence',async()=>{
 const spec=strategySchema.parse({schemaVersion:2,name:'audit TEMA',exchange:['Binance'],market:'Spot',pairs:['AUDITTEMA/USDT'],timeframe:'5m',
  entry:{kind:'COMPARE',op:'>',left:{kind:'INDICATOR',name:'TEMA',period:500,timeframe:'5m'},right:{kind:'CONSTANT',value:0}},stages:[],cooldownBars:0,destinations:[]});
 const series=await strategySeries(spec,'Binance','AUDITTEMA/USDT');
 const actual=value(spec.entry.kind==='COMPARE'?spec.entry.left:{kind:'CONSTANT',value:0},series,end);
 const full=raw.slice(-2032).map(row=>({time:row[0]+step,open:row[1],high:row[2],low:row[3],close:row[4],volume:row[5]}));
 const expected=value(spec.entry.kind==='COMPARE'?spec.entry.left:{kind:'CONSTANT',value:0},{'5m':full},end);
 assert.ok(Number.isFinite(expected),'indicator is valid with requested warmup');
 assert.ok(series['5m']!.length>=2032,'market fetch must retain requested warmup');
 assert.ok(Number.isFinite(actual),'valid saved indicator must not remain UNKNOWN');
 ingestClosedCandles('Binance','Spot','AUDITTEMA/USDT','5m',series['5m']!.slice(-1));
 const cached=await candles('Binance','Spot','AUDITTEMA/USDT','5m',2032);
 assert.equal(cached.length,series['5m']!.length,'WebSocket update must preserve REST warmup');
 assert.ok(Number.isFinite(value(spec.entry.kind==='COMPARE'?spec.entry.left:{kind:'CONSTANT',value:0},{'5m':cached},end)));
});

test('REST labels one full bar behind as DELAYED',async()=>{
 mode='lagging';
 const series=await candles('Binance','Spot','AUDITLAG/USDT','5m');
 assert.equal(series.at(-1)!.time,end-step);
 assert.equal(marketHealth.get('BinanceSpot')?.status,'DELAYED');
});

test.after(()=>{(ccxt as any).binance=original;});
