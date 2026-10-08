import assert from 'node:assert/strict';
import test from 'node:test';
import { claimsDraftChange, requestsDraftChange, toolSpec, instrumentSearch } from '../src/ai/completion.js';
import { outputLimit } from '../src/ai/budget.js';
test('draft success prose is distinguished from questions and advice',()=>{
  assert.equal(claimsDraftChange('ส่งร่างเข้า editor แล้วครับ (valid: true)'),true);
  assert.equal(claimsDraftChange('ลบเงื่อนไขออกแล้ว'),true);
  for (const word of ['เซ็ตอัพ','เซตอัพ','เซตอัป','เซ็ตอัป']) {
    assert.equal(claimsDraftChange(`ปรับ${word}เรียบร้อยแล้วครับ`),true);
  }
  assert.equal(claimsDraftChange("I've updated the setup."),true);
  assert.equal(claimsDraftChange('Would you like me to update the setup?'),false);
  assert.equal(claimsDraftChange('อยากให้เพิ่ม exit แบบไหนดีครับ'),false);
  assert.equal(claimsDraftChange('ไม่สามารถเปิดออเดอร์จริงได้'),false);
  assert.equal(requestsDraftChange('เปลี่ยน RSI จาก 30 เป็น 35'),true);
  assert.equal(requestsDraftChange('แนะนำการปรับพารามิเตอร์ อย่าแก้เซ็ตอัพ'),false);
  assert.equal(requestsDraftChange('ส่งคำสั่งเปิดออเดอร์เงินจริงให้เลย'),false);
});
test('compatible provider spec wrapper is normalized without inventing fields',()=>{
  assert.deepEqual(toolSpec('{"spec":{"schemaVersion":2,"name":"test"}}'),{schemaVersion:2,name:'test'});
  assert.deepEqual(toolSpec('{"schemaVersion":2,"name":"test"}'),{schemaVersion:2,name:'test'});
  assert.equal(toolSpec('{"type":"object"}'),undefined);
  assert.throws(()=>toolSpec('malformed'));
  assert.deepEqual(toolSpec('{"spec":{"market":"Perpetual Futures","pairs":["BTC/USDT:USDT"]}}').pairs,['BTC/USDT']);
  assert.equal(instrumentSearch('BTC/USDT perpetual'),'BTCUSDT');
  assert.equal(instrumentSearch('BTCUSDT'),'BTCUSDT');
  assert.equal(instrumentSearch('BTC/USDT:USDT'),'BTCUSDT');
});
test('configured reasoning/output limit remains independent of request cost',()=>{
  assert.equal(outputLimit('standard'),6000);
});

test('English setup edits and negations retain the same draft-action guard as Thai', () => {
  for (const verb of ['design', 'build', 'update', 'adjust']) {
    assert.equal(requestsDraftChange(`${verb} my setup`), true);
    assert.equal(requestsDraftChange(`Do not ${verb} my setup`), false);
    assert.equal(requestsDraftChange(`Don't ${verb} my setup`), false);
  }
});

test('Gate search and native perpetual targets use the same canonical pair identity', () => {
  assert.equal(instrumentSearch('Gate TSLA/USDT perpetual'), 'TSLAUSDT');
  const spec = toolSpec(JSON.stringify({ spec: { market: 'Perpetual Futures', pairs: ['TSLA/USDT:USDT'], targets: [{ exchange: 'Gate', pair: 'TSLA/USDT:USDT' }] } }));
  assert.deepEqual(spec.pairs, ['TSLA/USDT']);
  assert.deepEqual(spec.targets, [{ exchange: 'Gate', pair: 'TSLA/USDT' }]);
});

test('condition-only proposals retain exact sources when the model omits targets', () => {
  const previous = { market: 'Perpetual Futures', exchange: ['Binance', 'Gate'], pairs: ['BTC/USDT', 'TSLA/USDT'], targets: [{ exchange: 'Binance', pair: 'BTC/USDT' }, { exchange: 'Gate', pair: 'TSLA/USDT' }] };
  const { targets, ...withoutTargets } = previous;
  const revised = { ...withoutTargets, pairs: [...previous.pairs].reverse(), name: 'Renamed' };
  assert.deepEqual(toolSpec(JSON.stringify({spec:revised}), previous).targets, targets);
  assert.equal(toolSpec(JSON.stringify({spec:{...revised,market:'Spot'}}), previous).targets, undefined);
  assert.equal(toolSpec(JSON.stringify({spec:{...revised,pairs:['BTC/USDT']}}), previous).targets, undefined);
  const explicit = [{ exchange: 'Gate', pair: 'BTC/USDT' }, { exchange: 'Gate', pair: 'TSLA/USDT' }];
  assert.deepEqual(toolSpec(JSON.stringify({spec:{...revised,targets:explicit}}), previous).targets, explicit);
});
