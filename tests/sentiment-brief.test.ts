import {test} from 'node:test';
import assert from 'node:assert/strict';
const {briefPositionState}=await import(new URL('../dist/sentiment-brief.js',import.meta.url).href);
test('Morning brief ranks the latest CFTC weekly change, not absolute positioning',()=>{
  const dataset={periods:['old','latest'],markets:[{id:'us-stocks',values:[50,40]},{id:'bonds',values:[-30,-20]},{id:'gold',values:[20,21]},{id:'missing',values:[1,null]}]};
  const result=briefPositionState(dataset);
  assert.equal(result.up.id,'bonds');assert.equal(result.down.id,'us-stocks');
  assert.deepEqual(result.rows.map((m:any)=>m.id),['bonds','gold','us-stocks']);
  assert.equal(result.max,10);
  assert.equal(briefPositionState({...dataset,markets:[]}).up,undefined);
});
