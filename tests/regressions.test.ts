import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indicator,type Candle} from '../src/domain/engine.js';
test('linear-time MACD preserves seeded EMA reference at every prefix',()=>{
 const bars:Candle[]=Array.from({length:120},(_,i)=>({time:i,open:0,high:0,low:0,close:100+Math.sin(i)*8+i*.1,volume:1}));
 const ema=(v:number[],n:number)=>{if(v.length<n)return undefined;let r=v.slice(0,n).reduce((a,b)=>a+b,0)/n;for(const x of v.slice(n))r+=(x-r)*2/(n+1);return r;};
 for(let end=26;end<=120;end++){
  const c=bars.slice(0,end),v=c.map(x=>x.close),d=[];
  for(let j=26;j<=end;j++)d.push(ema(v.slice(0,j),12)!-ema(v.slice(0,j),26)!);
  assert.ok(Math.abs(indicator(c,'MACD',12)!-d.at(-1)!)<1e-10);
  const sig=ema(d,9),actual=indicator(c,'MACD_SIGNAL',12);
  if(sig===undefined)assert.equal(actual,undefined);else assert.ok(Math.abs(actual!-sig)<1e-10);
 }
});
