import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advance, replay, emptyLifecycle, strategySchema, frames, type Strategy, type Candle, type Series, type Signal} from '../src/domain/engine.js';
import {closedStreamCandles,subscriptionsFor,RealtimeMarkets} from '../src/realtime.js';

// Accelerated, deterministic synthetic market data. No accounts, API keys, or deliveries.
const personas = [
  ['มือใหม่ Spot 5 นาที','5m','Spot','Binance'],
  ['เล่นสั้น Long','5m','Perpetual Futures','Bybit'],
  ['เล่นสั้น Short','5m','Perpetual Futures','MEXC'],
  ['เล่นสองฝั่ง','15m','Perpetual Futures','OKX'],
  ['รอเงื่อนไขยืนยัน','15m','Spot','Bitget'],
  ['รอออกตามราคา','1h','Spot','MEXC'],
  ['พักแล้วกลับมา','5m','Spot','Bybit'],
  ['แก้เซ็ตอัพวันที่ห้า','15m','Spot','Binance'],
  ['เน็ตขาดช่วง','5m','Spot','OKX'],
  ['กรอบเวลาสูงข้อมูลไม่ครบ','1h','Spot','Bitget'],
] as const;
const price=(frame:string)=>({kind:'PRICE' as const,field:'close' as const,timeframe:frame});
const compare=(frame:string,op:string,value:number)=>({kind:'COMPARE' as const,op,left:price(frame),right:{kind:'CONSTANT' as const,value}});
const start=Date.UTC(2026,6,1);
const day=86400000;

test('10 trader personas over 10 simulated days: restart, duplicate, pause, revision and missing-data equivalence',async t=>{
 for(let p=0;p<personas.length;p++)await t.test(personas[p][0],()=>{
  const [,frame,market,exchange]=personas[p],step=frames[frame],count=10*day/step;
  const bars:Candle[]=Array.from({length:count},(_,i)=>{
   const close=100+8*Math.sin(i*.3)+2*Math.cos(i*.07);
   return {time:start+(i+1)*step,open:close-.2,high:close+1,low:close-1,close,volume:100+i%70};
  }).filter((_,i)=>p!==8||i%173!==71);
  const raw:any={schemaVersion:2,name:personas[p][0],exchange:[exchange],market,pairs:['BTC/USDT'],timeframe:frame,
   entry:compare(frame,'>',104),exit:compare(frame,'<',99),stages:[],cooldownBars:p%4,destinations:[]};
  if(market==='Perpetual Futures')raw.side=p===2?'SHORT':p===3?'BOTH':'LONG';
  if(p===2){raw.entry=compare(frame,'<',96);raw.exit=compare(frame,'>',101);}
  if(p===3)raw.short={entry:compare(frame,'<',96),exit:compare(frame,'>',101),stages:[],cooldownBars:2};
  if(p===4)raw.stages=[{condition:compare(frame,'>',106),withinBars:4}];
  if(p===9)raw.entry=compare('4h','>',100);
  const spec=strategySchema.parse(raw),series:Series={[frame]:bars};
  // Deliberately omit required 4h data: insufficient evidence must not generate entries.
  let current=spec,state=emptyLifecycle(),events:Signal[]=[];
  for(let i=0;i<bars.length;i++){
   const bar=bars[i];
   if(p===6&&bar.time>start+3*day&&bar.time<=start+4*day)continue;
   if(p===6&&bar.time===start+4*day+step){state=emptyLifecycle();state.lastTime=bar.time-step;}
   if(p===7&&bar.time===start+5*day+step){
    current=strategySchema.parse({...spec,entry:compare(frame,'>',106)});state=emptyLifecycle();state.lastTime=bar.time-step;
   }
   const result=advance(current,series,bar,state);state=JSON.parse(JSON.stringify(result.state));events.push(...result.events);
   assert.deepEqual(advance(current,series,bar,state).events,[],'duplicate must not repeat signals');
   assert.deepEqual(advance(current,series,{...bar,time:bar.time-step},state).events,[],'out-of-order must not rewind lifecycle');
  }
  if(p!==6&&p!==7)assert.deepEqual(events,replay(spec,series),'stream/restart and replay must match');
  if(p===6){
   const before=bars.filter(b=>b.time<=start+3*day),after=bars.filter(b=>b.time>start+4*day);
   assert.deepEqual(events,[...replay(spec,{[frame]:before}),...replay(spec,{[frame]:after})]);
   assert.ok(events.every(e=>e.time<=start+3*day||e.time>start+4*day));
  }
  if(p===7){
   const first=bars.filter(b=>b.time<=start+5*day),second=bars.filter(b=>b.time>start+5*day);
   assert.deepEqual(events,[...replay(spec,{[frame]:first}),...replay(current,{[frame]:second})]);
  }
  if(p===9)assert.equal(events.length,0);
  else assert.ok(events.some(e=>e.kind==='ENTRY'));
  if(p===8)assert.ok(events.some(e=>e.kind==='CANCEL'&&e.evidence.result==='UNKNOWN'));
  assert.equal(new Set(events.map(e=>`${e.time}:${e.side}:${e.kind}`)).size,events.length);
  t.diagnostic(`${personas[p][0]}: ${bars.length} closed bars, ${events.length} signals`);
 });
});

test('live close boundary excludes forming bars, future timestamps and invalid rows across all five exchanges',()=>{
 for(const exchange of ['Binance','Bybit','OKX','Bitget','MEXC'])for(const frame of ['5m','15m','1h'] as const){
  const step=frames[frame],row=(time:number)=>[time,100,101,99,100,10];
  assert.deepEqual(closedStreamCandles([row(start)],frame,start+step*100),[],`${exchange} ${frame}: last bar stays forming`);
  assert.deepEqual(closedStreamCandles([row(start+step),row(start)],frame,start+step).map(c=>c.time),[start+step]);
  assert.equal(closedStreamCandles([row(start),row(start+step)],frame,start+step-1).length,0);
  assert.equal(closedStreamCandles([[start,NaN,101,99,100,10],row(start+step)],frame,start+step).length,0);
 }
 const rows=personas.map(([,timeframe,market,exchange],i)=>({id:`persona-${i}`,revision:1,spec:strategySchema.parse({
  schemaVersion:2,name:'audit',exchange:[exchange],market,pairs:['BTC/USDT'],timeframe,
  ...(market==='Spot'?{}:{side:'LONG'}),entry:compare(timeframe,'>',104),stages:[],cooldownBars:0,destinations:[]
 })}));
 const subs=subscriptionsFor(rows);
 assert.equal([...subs.values()].reduce((n,s)=>n+s.targets.length,0),10);
 for(const sub of subs.values())assert.ok(sub.targets.every(target=>target.exchange===sub.exchange));
});

test('realtime target revision and subscribe/pause/resume retain one emission per closed bar per listener',async()=>{
 const emitted:any[]=[];const clients:{resolve?: (rows:number[][])=>void;closed:number}[]=[];
 const spec=strategySchema.parse({schemaVersion:2,name:'audit',exchange:['Binance'],market:'Spot',pairs:['BTC/USDT'],timeframe:'5m',entry:compare('5m','>',104),stages:[],cooldownBars:0,destinations:[]});
 const manager=new RealtimeMarkets(async(targets,time)=>{emitted.push({targets,time});},()=>{
  const state={closed:0} as typeof clients[number];clients.push(state);
  return {has:{watchOHLCV:true},watchOHLCV:()=>new Promise(resolve=>{state.resolve=resolve;}),close:async()=>{state.closed++;}};
 });
 const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
 const row=(i:number)=>[start+i*frames['5m'],100,110,90,105,10];
 try{
  manager.reconcile([{id:'audit',revision:1,spec}]);clients[0].resolve!([row(0),row(1)]);await tick();
  clients[0].resolve!([row(0),row(1)]);await tick();assert.equal(emitted.length,1);
  manager.reconcile([{id:'audit',revision:2,spec}]);clients[0].resolve!([row(0),row(1),row(2)]);await tick();
  assert.equal(emitted[1].targets[0].revision,2);assert.equal(clients.length,1);
  manager.reconcile([]);assert.equal(clients[0].closed,1);
  manager.reconcile([{id:'audit',revision:2,spec}]);clients[1].resolve!([row(1),row(2),row(3)]);await tick();
  assert.equal(emitted.length,3);assert.equal(emitted[2].time,start+frames['5m']*3);
 }finally{await manager.stop();}
});
