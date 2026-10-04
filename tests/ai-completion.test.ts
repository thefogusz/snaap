import assert from 'node:assert/strict';
import test from 'node:test';
import { claimsDraftChange, requestsDraftChange, toolSpec, instrumentSearch } from '../src/ai/completion.js';
import { boundCost, outputLimit } from '../src/ai/budget.js';
test('draft success prose is distinguished from questions and advice',()=>{
  assert.equal(claimsDraftChange('ส่งร่างเข้า editor แล้วครับ (valid: true)'),true);
  assert.equal(claimsDraftChange('ลบเงื่อนไขออกแล้ว'),true);
  assert.equal(claimsDraftChange('อยากให้เพิ่ม exit แบบไหนดีครับ'),false);
  assert.equal(claimsDraftChange('ไม่สามารถเปิดออเดอร์จริงได้'),false);
  assert.equal(requestsDraftChange('เปลี่ยน RSI จาก 30 เป็น 35'),true);
  assert.equal(requestsDraftChange('แนะนำการปรับพารามิเตอร์ อย่าแก้เซตอัป'),false);
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
test('output reservation includes the configured reasoning/output limit',()=>{
  const rate={input:0.25,output:2,cap:0.03};
  assert.equal(Number((boundCost('',[],0,rate,6000)-boundCost('',[],0,rate,2000)).toFixed(6)),0.008);
  assert.equal(outputLimit('standard'),6000);
});
