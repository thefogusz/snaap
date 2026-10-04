import {test} from 'node:test';
import assert from 'node:assert/strict';
import {closedStreamCandles,subscriptionsFor,RealtimeMarkets} from '../src/realtime.js';
const width=900000;
const bar=(i:number)=>[i*width,100,110,90,105,10];
const spec={schemaVersion:2,name:'test',exchange:['MEXC'],market:'Spot',pairs:['BTC/USDT'],timeframe:'15m',entry:{kind:'COMPARE',op:'>',left:{kind:'PRICE',field:'close',timeframe:'1h'},right:{kind:'CONSTANT',value:100}},stages:[],cooldownBars:0,destinations:[]};
test('never treats the last stream candle as closed solely because time passed',()=>{
  assert.deepEqual(closedStreamCandles([bar(0)],'15m',width*10),[]);
  assert.deepEqual(closedStreamCandles([bar(2),bar(0),bar(1)],'15m',width*10).map(c=>c.time),[width,width*2]);
  assert.equal(closedStreamCandles([bar(0),bar(1)],'15m',width-1).length,0);
  assert.equal(closedStreamCandles([[0,NaN,1,1,1,1],bar(1)],'15m',width*2).length,0);
});
test('users share streams and include indicator timeframes without mixing markets',()=>{
  const subs=subscriptionsFor([{id:'a',revision:1,spec},{id:'b',revision:2,spec},{id:'c',revision:1,spec:{...spec,market:'Perpetual Futures'}}]);
  assert.equal(subs.size,4);
  assert.deepEqual(subs.get('MEXC:Spot:BTC/USDT:15m')!.targets.map(t=>t.ruleId),['a','b']);
});
test('repeated updates emit once, target revisions refresh, and unsubscribing closes client',async()=>{
  const emitted:any[]=[]; let closeCount=0, factoryCount=0;
  let waiting:((rows:number[][])=>void)|undefined;
  const manager=new RealtimeMarkets(async(targets,time)=>{emitted.push({targets,time});},()=>{
    factoryCount++;
    return {has:{watchOHLCV:true},watchOHLCV:()=>new Promise(resolve=>{waiting=resolve;}),close:async()=>{closeCount++;}};
  });
  const simple={...spec,entry:{kind:'COMPARE',op:'>',left:{kind:'PRICE',field:'close',timeframe:'15m'},right:{kind:'CONSTANT',value:100}}};
  manager.reconcile([{id:'a',revision:1,spec:simple}]);
  waiting!([bar(0),bar(1)]); await new Promise(resolve=>setImmediate(resolve));
  waiting!([bar(0),bar(1)]); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(emitted.length,1);
  manager.reconcile([{id:'a',revision:2,spec:simple}]);
  waiting!([bar(0),bar(1),bar(2)]); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(emitted[1].targets[0].revision,2); assert.equal(factoryCount,1);
  manager.reconcile([]); assert.equal(closeCount,1);
  await manager.stop();
});
