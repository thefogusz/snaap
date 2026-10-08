import {test} from 'node:test';
import assert from 'node:assert/strict';
const {briefMarketState}=await import(new URL('../dist/sentiment-brief.js',import.meta.url).href);
test('Morning brief keeps recent saved prices with their observation dates',()=>{
  const now=Date.parse('2026-10-08T10:00:00Z');
  const market=(id:string,change:number,stale=false,date='2026-10-07')=>({id,stale,days:[{date,close:100,change}]});
  const result=briefMarketState({markets:[market('spy',1),market('gld',-2),market('tlt',0),market('uso',9,true),market('uup',4,false,'2026-09-30')]},now);
  assert.deepEqual(result.rows.map((m:any)=>m.id),['uso','spy','tlt','gld']);
  assert.equal(result.rows[0].stale,true);assert.equal(result.rows[0].date,'2026-10-07');
  assert.equal(result.up.id,'uso');assert.equal(result.down.id,'gld');
  assert.equal(result.positive,2);assert.equal(result.negative,1);
  const mixed=briefMarketState({markets:[market('spy',1,false,'2026-10-08'),market('gld',8,true,'2026-10-07')]},now);
  assert.deepEqual(mixed.rows.map((m:any)=>m.id),['spy']); // Do not rank returns observed on different days together.
  assert.equal(briefMarketState(null,now).rows.length,0);
});
