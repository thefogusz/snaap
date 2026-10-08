import assert from 'node:assert/strict';
import test from 'node:test';
import { pricing, usageCost } from '../src/ai/budget.js';

test('legacy per-request cost caps cannot block accounting configuration', () => {
  const keys=['AI_STANDARD_INPUT_USD_PER_MILLION','AI_STANDARD_OUTPUT_USD_PER_MILLION','AI_STANDARD_MAX_USD','AI_STANDARD_CACHED_INPUT_USD_PER_MILLION'];
  const before=keys.map(key=>process.env[key]);
  try {
    process.env[keys[0]]='0.25';process.env[keys[1]]='2';delete process.env[keys[3]];
    for (const cap of ['0','0.000001','invalid']) {
      process.env[keys[2]]=cap;
      assert.deepEqual(pricing('standard'),{input:0.25,output:2,cachedInput:0.25});
    }
  } finally {keys.forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});}
});

test('cached input uses its own rate only when configured at or below the input rate', () => {
  const keys=['AI_STANDARD_INPUT_USD_PER_MILLION','AI_STANDARD_OUTPUT_USD_PER_MILLION','AI_STANDARD_CACHED_INPUT_USD_PER_MILLION'];
  const before=keys.map(key=>process.env[key]);
  try {
    process.env[keys[0]]='0.25';process.env[keys[1]]='2';
    process.env[keys[2]]='0.025';
    const rate=pricing('standard');
    assert.equal(rate.cachedInput,0.025);
    // 20k input of which 15k cached, 500 output.
    assert.ok(Math.abs(usageCost(rate,{input:20000,cachedInput:15000,output:500})-(5000*0.25+15000*0.025+500*2)/1e6)<1e-15);
    for (const invalid of ['0','-1','0.5','invalid']) {
      process.env[keys[2]]=invalid;
      assert.equal(pricing('standard').cachedInput,0.25,`${invalid} falls back to the full input rate`);
    }
    delete process.env[keys[2]];
    assert.equal(usageCost(pricing('standard'),{input:1000,cachedInput:800,output:0}),1000*0.25/1e6,'unconfigured cache is costed as full input');
  } finally {keys.forEach((key,i)=>{if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];});}
});
