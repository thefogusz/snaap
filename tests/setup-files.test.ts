import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupFile} from '../src/domain/setup-files.js';
const spec={schemaVersion:2,name:'EMA setup',exchange:['MEXC'],market:'Spot',pairs:['BTC/USDT'],timeframe:'15m',entry:{kind:'COMPARE',op:'>',left:{kind:'PRICE',field:'close',timeframe:'15m'},right:{kind:'INDICATOR',name:'EMA',period:200,timeframe:'15m'}},stages:[],cooldownBars:0,destinations:['00000000-0000-4000-8000-000000000001']};
test('portable setup round trips mathematics and removes recipient-specific destinations',()=>{
 const file=setupFile(spec);assert.equal(file.format,'snaap.trade-setups');assert.deepEqual(file.setups[0].destinations,[]);
 assert.deepEqual(file.setups[0].entry,spec.entry);assert.deepEqual(setupFile(JSON.parse(JSON.stringify(file))),file);
 assert.deepEqual(spec.destinations,['00000000-0000-4000-8000-000000000001']);
});
test('preserves custom indicator formula and lifecycle conditions',()=>{
 const custom=structuredClone(spec) as any;custom.entry.right.name='CUSTOM';custom.entry.right.formula={title:'My EMA',version:1,offset:0,terms:[{name:'EMA',period:20,weight:1}]};custom.exit={kind:'COMPARE',op:'<',left:{kind:'ENTRY_RETURN'},right:{kind:'CONSTANT',value:-2}};
 assert.deepEqual(setupFile(custom).setups[0].entry,custom.entry);assert.deepEqual(setupFile(custom).setups[0].exit,custom.exit);
});
test('rejects unsupported versions, credentials, invalid calculations, empty and oversized bundles',()=>{
 for(const input of [{format:'snaap.trade-setups',version:2,setups:[spec]},{...spec,apiKey:'secret'},{...spec,entry:{...spec.entry,right:{...spec.entry.right,period:0}}},{format:'snaap.trade-setups',version:1,setups:[]},{format:'snaap.trade-setups',version:1,setups:Array(51).fill(spec)}])assert.throws(()=>setupFile(input));
});
