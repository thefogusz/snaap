import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indicator,value,operand,strategySchema,type Candle} from '../src/domain/engine.js';
import {preview} from '../src/domain/preview.js';
const rows:Candle[]=[1,2,3,4,5,6].map((close,i)=>({time:(i+1)*900000,open:close,high:close+1,low:close-1,close,volume:10}));
const expected:Record<string,number>={WMA:32/6,RMA:4+8/27,VWMA:5,ROC:100,MOM:3,STDDEV:Math.sqrt(2/3),VARIANCE:2/3,HIGHEST:6,LOWEST:4,DONCHIAN_UPPER:7,DONCHIAN_LOWER:3,DONCHIAN_MID:5,STOCH_K:75,WILLIAMS_R:-25,CCI:100,MFI:100,CMF:0,BB_MIDDLE:5,BB_WIDTH:4*Math.sqrt(2/3)/5*100,BB_PERCENT:(1+2*Math.sqrt(2/3))/(4*Math.sqrt(2/3)),TR:2};
for(const [name,target]of Object.entries(expected))test(`${name}: hand-calculated ramp, warmup and finite output`,()=>{
 assert.ok(Math.abs(indicator(rows,name,3)!-target)<1e-10,`${name}: ${indicator(rows,name,3)} != ${target}`);
 assert.equal(indicator(rows.slice(0,2),name,3),undefined);
 const o=operand.parse({kind:'INDICATOR',name,period:3,timeframe:'15m'});
 const before=value(o,{'15m':rows},rows[4].time);
 const changed=[...rows.slice(0,5),{...rows[5],close:1e9,high:1e9}];
 assert.equal(value(o,{'15m':changed},rows[4].time),before);
});
test('range/volume degeneracies remain unknown, not NaN or invented signals',()=>{
 const flat=rows.map(c=>({...c,open:10,close:10,high:10,low:10,volume:0}));
 for(const n of ['VWMA','STOCH_K','WILLIAMS_R','CCI','MFI','CMF','BB_PERCENT'])assert.equal(indicator(flat,n,3),undefined,n);
 assert.equal(indicator(flat,'ROC',3),0);
});
test('custom formula equals MACD with same seed and does not execute code',()=>{
 const c=Array.from({length:80},(_,i)=>({...rows[0],time:(i+1)*900000,close:100+i+Math.sin(i)}));
 const o=operand.parse({kind:'INDICATOR',name:'CUSTOM',period:14,timeframe:'15m',formula:{title:'spread',version:1,offset:0,terms:[{name:'EMA',period:12,weight:1},{name:'EMA',period:26,weight:-1}]}});
 assert.ok(Math.abs(value(o,{'15m':c},c.at(-1)!.time)!-indicator(c,'MACD',12)!)<1e-10);
 assert.equal(operand.safeParse({...o,formula:{...('formula'in o?o.formula:{}),code:'process.exit()'}}).success,false);
 assert.equal(operand.safeParse({...o,formula:{title:'bad',version:1,terms:Array(9).fill({name:'SMA',period:3,weight:1})}}).success,false);
 const spec={schemaVersion:2,name:'test',exchange:['MEXC'],market:'Spot',pairs:['BTC/USDT'],timeframe:'15m',entry:{kind:'COMPARE',op:'>',left:{kind:'INDICATOR',name:'CUSTOM',period:14,timeframe:'15m'},right:{kind:'CONSTANT',value:0}},stages:[],cooldownBars:0,destinations:[]};
 assert.equal(strategySchema.safeParse(spec).success,false);
});
test('MFI and CMF mixed-direction hand fixture',()=>{
 const c=[{close:2,high:3,low:1,volume:10},{close:4,high:5,low:3,volume:20},{close:3,high:4,low:2,volume:30},{close:6,high:7,low:5,volume:40}].map((b,i)=>({...b,open:b.close,time:i*900000}));
 // Positive money = 4*20 + 6*40 = 320; negative = 3*30 = 90.
 assert.ok(Math.abs(indicator(c,'MFI',3)!-100*320/410)<1e-10);
 const shifted=c.map(b=>({...b,close:b.high}));
 assert.equal(indicator(shifted,'CMF',3),1);
 assert.equal(indicator(c.map(b=>({...b,close:b.low})),'CMF',3),-1);
});
test('every new indicator chart point equals the rule evidence on the same closed bar',()=>{
 for(const name of Object.keys(expected)){
  const spec=strategySchema.parse({schemaVersion:2,name,exchange:['MEXC'],market:'Spot',pairs:['BTC/USDT'],timeframe:'15m',entry:{kind:'COMPARE',op:'>',left:{kind:'INDICATOR',name,period:3,timeframe:'15m'},right:{kind:'CONSTANT',value:0}},stages:[],cooldownBars:0,destinations:[]});
  const out=preview(spec,{'15m':rows});
  out.timeline.forEach((b,i)=>assert.equal(out.overlays[0].points[i].value,b.entry.left??null,name));
 }
});
