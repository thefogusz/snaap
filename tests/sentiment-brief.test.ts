import {test} from 'node:test';
import assert from 'node:assert/strict';
const {briefMarketState}=await import(new URL('../dist/sentiment-brief.js',import.meta.url).href);
test('Morning brief ranks fresh daily prices without calling them fund flows',()=>{
  const now=Date.parse('2026-10-08T10:00:00Z');
  const market=(id:string,change:number,stale=false,date='2026-10-07')=>({id,stale,days:[{date,close:100,change}]});
  const result=briefMarketState({markets:[market('spy',1),market('gld',-2),market('tlt',0),market('uso',9,true),market('uup',4,false,'2026-09-30')]},now);
  assert.deepEqual(result.rows.map((m:any)=>m.id),['spy','tlt','gld']);
  assert.equal(result.up.id,'spy');assert.equal(result.down.id,'gld');
  assert.equal(result.positive,1);assert.equal(result.negative,1);
  assert.equal(briefMarketState(null,now).rows.length,0);
});
