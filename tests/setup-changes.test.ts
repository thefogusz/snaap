import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSetup, describeSetupValue } from '../dist/setup-changes.js';

test('reports precise additions, removals and parameter changes', () => {
  const before = { entry: { kind: 'COMPARE', right: { kind: 'INDICATOR', name: 'EMA', period: 200, timeframe: '15m' } }, exit: {kind:'CONSTANT',value:1}, stages: [] };
  const after = { entry: { kind: 'COMPARE', right: { kind: 'INDICATOR', name: 'EMA', period: 100, timeframe: '1h' } }, stages: [{withinBars:5,condition:{kind:'CONSTANT',value:2}}] };
  const changes = diffSetup(before, after);
  assert.deepEqual(changes.map(c => [c.path,c.action]), [['entry.right.period','change'],['entry.right.timeframe','change'],['exit','remove'],['stages.0','add']]);
  assert.equal(changes[0].before, 200);
  assert.equal(changes[0].after, 100);
});
test('ignores object key order but detects array order and empty destinations', () => {
  assert.deepEqual(diffSetup({name:'x',entry:{kind:'CONSTANT',value:1}}, {entry:{value:1,kind:'CONSTANT'},name:'x'}), []);
  assert.equal(diffSetup({pairs:['BTC/USDT','ETH/USDT']},{pairs:['ETH/USDT','BTC/USDT']}).length,1);
  assert.equal(diffSetup({destinations:['id']},{destinations:[]})[0].action,'change');
});
test('renders condition changes as readable values', () => {
  assert.equal(describeSetupValue({kind:'HOLD',bars:3,condition:{kind:'COMPARE',op:'CROSS_ABOVE',left:{kind:'PRICE',field:'close',timeframe:'15m'},right:{kind:'CONSTANT',value:50}}}), 'ราคาปิด (15m) ตัดขึ้นเหนือ 50 ต่อเนื่อง 3 แท่ง');
});

test('direction and automatic Short mirroring appear in the chat change notice',()=>{
 const changes=diffSetup({side:'LONG'},{side:'BOTH',mirrorShort:true});
 assert.deepEqual(changes.map(c=>c.path),['side','mirrorShort']);
 assert.equal(changes[0].label,'ฝั่ง');
 assert.equal(describeSetupValue(changes[0].after),'Long + Short');
 assert.equal(describeSetupValue(changes[1].after),'เปิด');
});
