import {test} from 'node:test';
import assert from 'node:assert/strict';
const {briefFlowState}=await import(new URL('../dist/sentiment-brief.js',import.meta.url).href);
test('Morning brief uses the latest flow period and handles all-out, all-in and missing categories',()=>{
  const dataset={periods:['old','latest'],total:[999,-20],markets:[{id:'equity',values:[900,-50]},{id:'bond',values:[10,30]},{id:'mixed',values:[20,-1]},{id:'unknown',values:[1,null]}]};
  const result=briefFlowState(dataset);
  assert.equal(result.into.id,'bond');assert.equal(result.out.id,'equity');assert.equal(result.total,-20);
  assert.deepEqual(result.rows.map((m:any)=>m.id),['bond','equity','mixed']);assert.equal(result.max,50);
  const allOut={...dataset,markets:[{id:'equity',values:[2,-50]},{id:'bond',values:[3,-30]}]};
  assert.equal(briefFlowState(allOut).into,undefined);assert.equal(briefFlowState(allOut).out.id,'equity');
  const allIn={...dataset,markets:[{id:'equity',values:[2,50]},{id:'bond',values:[3,30]}]};
  assert.equal(briefFlowState(allIn).out,undefined);assert.equal(briefFlowState(allIn).into.id,'equity');
  assert.equal(briefFlowState({...dataset,markets:[{id:'equity',values:[2,0]}]}).into,undefined);
  assert.equal(briefFlowState({...dataset,markets:[]}).out,undefined);
});
