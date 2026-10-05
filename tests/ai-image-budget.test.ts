import assert from 'node:assert/strict';
import test from 'node:test';
import { boundCost, compactHistoryForBudget } from '../src/ai/budget.js';

test('five images do not reserve tokens or charge base64 bytes in the estimate', () => {
  const rate = { input: 0.25, output: 2, cap: 0.03 };
  const instructions = 'x'.repeat(40000);
  const messages = Array.from({ length: 5 }, () => ({ image_url: 'data:image/webp;base64,' + 'A'.repeat(100000) }));
  assert.equal(boundCost(instructions, messages, rate, 6000), boundCost(instructions, Array.from({ length: 5 }, () => ({ image_url: '[image]' })), rate, 6000));
  assert.ok(boundCost(instructions, messages, rate, 6000) < rate.cap);
});

test('budget pressure drops oldest history turns and keeps current images and tool results intact', () => {
  const rate = {input:.25,output:2,cap:.03};
  const current = {role:'user',content:[{type:'input_text',text:'แก้เซตอัปหลายไทม์เฟรม'},{type:'input_image',image_url:'data:image/webp;base64,AAA'}]};
  const toolCall = {type:'function_call',call_id:'repair',arguments:'{"spec":{}}'};
  const toolResult = {type:'function_call_output',call_id:'repair',output:'{"valid":false}'};
  const messages = [{role:'user',content:'เก่า'.repeat(4000)},{role:'assistant',content:'คำตอบ'.repeat(4000)},{role:'user',content:'recent'},{role:'assistant',content:'recent answer'},current,toolCall,toolResult];
  const compacted = compactHistoryForBudget(messages,4,'rules'.repeat(3000),rate,.013);
  assert.deepEqual(compacted,{historyCount:2,removed:2});
  assert.deepEqual(messages,[{role:'user',content:'recent'},{role:'assistant',content:'recent answer'},current,toolCall,toolResult]);
  assert.ok(.013 + boundCost('rules'.repeat(3000),messages,rate,2000) <= rate.cap);
});

test('an irreducible request cannot bypass the spend cap or discard current input', () => {
  const current = {role:'user',content:'x'.repeat(200000)};
  const messages = [current];
  const rate = {input:.25,output:2,cap:.03};
  assert.deepEqual(compactHistoryForBudget(messages,0,'rules',rate,0),{historyCount:0,removed:0});
  assert.deepEqual(messages,[current]);
  assert.ok(boundCost('rules',messages,rate,2000) > rate.cap);
});
