import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeSetupCode,normalizeSetupCode,setupCodeHash} from '../src/domain/setup-codes.js';
test('codes are random, readable and accept pasted case or separator variations',()=>{const codes=Array.from({length:100},makeSetupCode);assert.equal(new Set(codes).size,100);for(const code of codes){assert.equal(normalizeSetupCode(code.toLowerCase().replaceAll('-',' ')),code);assert.equal(setupCodeHash(code).length,64);}});
test('rejects missing, invalid and ambiguous code characters',()=>{for(const code of ['','SNAAP-1234','SNAAP-OOOO-OOOO-OOOO','<script>','SNAAP-AAAA-BBBB-CCCC-DDDD'])assert.throws(()=>normalizeSetupCode(code));});
