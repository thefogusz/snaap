import {test} from 'node:test';
import assert from 'node:assert/strict';
import {strategySchema,replay,advance,emptyLifecycle} from '../src/domain/engine.js';
test('Spot/Long/Short/Both across all frames and cooldowns match durable incremental evaluation',()=>{
 let scenarios=0;
 for(const timeframe of ['5m','15m','1h','4h','1d'])for(const side of ['SPOT','LONG','SHORT','BOTH'])for(const cooldownBars of [0,1,5,20]){
  const width=({'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000} as Record<string,number>)[timeframe];
  const entry={kind:'COMPARE',op:side==='SHORT'?'<':'>',left:{kind:'PRICE',field:'close',timeframe},right:{kind:'CONSTANT',value:100}};
  const spec=strategySchema.parse({schemaVersion:2,name:'matrix',exchange:['Binance'],market:side==='SPOT'?'Spot':'Perpetual Futures',side,pairs:['BTC/USDT'],timeframe,entry,stages:[],cooldownBars,destinations:[],...(side==='BOTH'?{mirrorShort:true}:{})});
  const bars=Array.from({length:120},(_,i)=>{const close=i%2?110:90;return{time:(i+1)*width,open:close,high:close+1,low:close-1,close,volume:10};});
  const series={[timeframe]:bars};let state=emptyLifecycle();const events=[];
  for(const bar of bars){const next=advance(spec,series,bar,JSON.parse(JSON.stringify(state)));state=next.state;events.push(...next.events);}
  assert.deepEqual(events,replay(spec,series));assert.ok(events.length>0);
  if(cooldownBars===0){assert.equal(events.length,side==='BOTH'?120:60);assert.equal(events[0].time,(side==='SPOT'||side==='LONG'?2:1)*width);}
  assert.ok(events.every(e=>e.market===spec.market&&(side==='BOTH'?['LONG','SHORT'].includes(e.side):e.side===side)));
  scenarios++;
 }
 assert.equal(scenarios,80);
});
