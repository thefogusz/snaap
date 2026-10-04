import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operand,value,strategySchema,type Candle} from '../src/domain/engine.js';
import {extendedIndicators} from '../dist/indicator-catalog.js';
import {ADX,OBV,PSAR,Stochastic,WEMA,SMA,CCI} from 'technicalindicators';
import {z} from 'zod';
const step=300000;
const rows:Candle[]=Array.from({length:600},(_,i)=>{const close=100+i*.07+Math.sin(i*.35)*4;return {time:(i+1)*step,open:close-.4,high:close+2,low:close-2,close,volume:100+i%29};});
function input(name:string){const d=extendedIndicators.find(d=>d.name===name)!;return {kind:'INDICATOR',name,period:d.params.find(p=>p.key==='period')?.value??14,timeframe:'5m',params:Object.fromEntries(d.params.filter(p=>p.key!=='period').map(p=>[p.key,p.value]))};}
for(const d of extendedIndicators)test(`${d.name}: finite default, causal prefix, gaps and short history`,()=>{
 const o=operand.parse(input(d.name));
 assert.ok(Number.isFinite(value(o,{'5m':rows},rows.at(-1)!.time)),d.name);
 const prefix=rows.slice(0,350),v=value(o,{'5m':prefix},prefix.at(-1)!.time);
 const actual=value(o,{'5m':rows},prefix.at(-1)!.time);
 assert.ok(v===actual||(v!==undefined&&actual!==undefined&&Math.abs(v-actual)<1e-8),`${d.name} used future bars: ${v} / ${actual}`);
 for(const count of [1,2,3,10]){const x=value(o,{'5m':rows.slice(0,count)},rows[count-1].time);assert.ok(x===undefined||Number.isFinite(x));}
 const gap=[...rows.slice(0,200),...rows.slice(250,260)];
 assert.equal(value(o,{'5m':gap},gap.at(-1)!.time),value(o,{'5m':rows.slice(250,260)},gap.at(-1)!.time));
});
test('parameter validation prevents hidden or invalid settings',()=>{
 const base={schemaVersion:2,name:'test',exchange:['Binance'],market:'Spot',pairs:['BTC/USDT'],timeframe:'5m',entry:{kind:'COMPARE',op:'>',left:input('PSAR'),right:{kind:'CONSTANT',value:0}},stages:[],cooldownBars:0,destinations:[]};
 assert.equal(strategySchema.safeParse(base).success,true);
 for(const params of [{acceleration:1,maximum:.1},{unknown:2},{maximum:NaN}])assert.equal(strategySchema.safeParse({...base,entry:{...base.entry,left:{...input('PSAR'),params}}}).success,false);
});
test('hand-calculated OBV, rolling/session VWAP and Ichimoku displacement',()=>{
 const c=[10,12,11,13].map((close,i)=>({time:(i+1)*step,open:close,high:close+1,low:close-1,close,volume:10}));
 const at=c.at(-1)!.time;
 assert.equal(value(operand.parse(input('OBV')),{'5m':c},at),10);
 assert.equal(value(operand.parse({...input('VWAP_ROLLING'),period:2}),{'5m':c},at),12);
 assert.equal(value(operand.parse(input('VWAP_SESSION')),{'5m':c},at),11.5);
 const cloud=operand.parse({...input('ICHIMOKU_SPAN_B'),params:{conversion:2,base:2,span:2,displacement:1}});
 assert.equal(value(cloud,{'5m':c},at),11.5);
});
test('independent library agreement for directional, stochastic, SAR and volume studies',()=>{
 const high=rows.map(c=>c.high),low=rows.map(c=>c.low),close=rows.map(c=>c.close),volume=rows.map(c=>c.volume);
 const adx=ADX.calculate({high,low,close,period:14}).at(-1)!;
 const stoch=Stochastic.calculate({high,low,close,period:14,signalPeriod:3}).at(-1)!;
 // The convenience StochasticRSI rounds RSI to two decimals internally.
 // Compose independent primitives to compare full precision instead.
 const change=close.slice(1).map((x,i)=>x-close[i]);
 const gains=WEMA.calculate({values:change.map(x=>Math.max(0,x)),period:14});
 const losses=WEMA.calculate({values:change.map(x=>Math.max(0,-x)),period:14});
 const rs=gains.map((x,i)=>losses[i]===0?100:100*x/(x+losses[i]));
 const raw=Stochastic.calculate({high:rs,low:rs,close:rs,period:14,signalPeriod:1}).map(x=>x.k);
 const k=SMA.calculate({values:raw,period:3}),d=SMA.calculate({values:k,period:3});
 const references:Record<string,number>={ADX:adx.adx,DI_PLUS:adx.pdi,DI_MINUS:adx.mdi,STOCH_D:stoch.d,PSAR:PSAR.calculate({high,low,step:.02,max:.2}).at(-1)!,OBV:OBV.calculate({close,volume}).at(-1)!,STOCH_RSI_K:k.at(-1)!,STOCH_RSI_D:d.at(-1)!};
 // STOCH_D here deliberately uses unsmoothed K, matching this reference's variant.
 for(const [name,expected] of Object.entries(references)){
  const o=operand.parse({...input(name),...(name==='STOCH_D'?{params:{smooth:1,signal:3}}:{})});
  const actual=value(o,{'5m':rows},rows.at(-1)!.time)!;
  assert.ok(Math.abs(actual-expected)<1e-6*Math.max(1,Math.abs(expected)),`${name}: ${actual} != ${expected}`);
 }
 // Legacy CCI with hlc3 is the standard typical-price variant.
 const cci=operand.parse({kind:'INDICATOR',name:'CCI',period:14,timeframe:'5m',source:'hlc3'});
 assert.ok(Math.abs(value(cci,{'5m':rows},rows.at(-1)!.time)!-CCI.calculate({high,low,close,period:14}).at(-1)!)<1e-8);
});
test('Supertrend hand fixture switches only after crossing its prior upper band',()=>{
 const c=[10,11,12,13,14,15].map((close,i)=>({time:(i+1)*step,open:close,high:close+1,low:close-1,close,volume:10}));
 const o=operand.parse({...input('SUPERTREND_LINE'),period:3,params:{factor:1}});
 assert.equal(value(o,{'5m':c},c[1].time),undefined);
 assert.equal(value(o,{'5m':c},c[2].time),14);
 assert.equal(value(o,{'5m':c},c[4].time),14);
 assert.equal(value(o,{'5m':c},c[5].time),13);
 const direction=operand.parse({...input('SUPERTREND_DIRECTION'),period:3,params:{factor:1}});
 assert.equal(value(direction,{'5m':c},c[4].time),-1);
 assert.equal(value(direction,{'5m':c},c[5].time),1);
});
test('session VWAP assigns a midnight closing bar to its opening day',()=>{
 const c=[{time:86400000,open:10,high:10,low:10,close:10,volume:10},{time:86400000+step,open:20,high:20,low:20,close:20,volume:10}];
 assert.equal(value(operand.parse(input('VWAP_SESSION')),{'5m':c},c[1].time),20);
});
test('harness JSON schema and runtime expose the same extended names',()=>{
 const schema=JSON.stringify(z.toJSONSchema(strategySchema,{unrepresentable:'any'}));
 for(const d of extendedIndicators)assert.ok(schema.includes(`"${d.name}"`),d.name);
 assert.ok(schema.includes('"params"'));
});
