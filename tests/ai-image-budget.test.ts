import assert from 'node:assert/strict';
import test from 'node:test';
import { pricing } from '../src/ai/budget.js';

test('legacy per-request cost caps cannot block accounting configuration', () => {
  const keys=['AI_STANDARD_INPUT_USD_PER_MILLION','AI_STANDARD_OUTPUT_USD_PER_MILLION','AI_STANDARD_MAX_USD'];
  const before=keys.map(key=>process.env[key]);
  try {
    process.env[keys[0]]='0.25';process.env[keys[1]]='2';
    for (const cap of ['0','0.000001','invalid']) {
      process.env[keys[2]]=cap;
      assert.deepEqual(pricing('standard'),{input:0.25,output:2});
    }
  } finally {keys.forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});}
});
