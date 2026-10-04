import {test} from 'node:test';
import assert from 'node:assert/strict';
import {presets,buildPreset,describePreset} from '../dist/preset-catalog.js';
import {strategySchema} from '../src/domain/engine.js';
for(const p of presets)for(const side of ['SPOT','LONG','SHORT','BOTH'])for(const timeframe of ['5m','15m','1h','4h','1d'])test(`preset ${p.id} ${side} ${timeframe}`,()=>{
 const s=strategySchema.parse(buildPreset(p.id,{exchange:'Binance',pair:'BTC/USDT',market:side==='SPOT'?'Spot':'Perpetual Futures',side,timeframe}));
 assert.equal(s.side,side);assert.equal(s.timeframe,timeframe);assert.equal(s.cooldownBars,3);assert.ok(s.exit);assert.equal(s.short!==undefined,side==='BOTH');assert.equal(s.mirrorShort,undefined);assert.ok(describePreset(s).includes('BTC/USDT'));
});
test('Short RSI recovery uses 70, rather than mirroring Long threshold 30',()=>{
 const s=strategySchema.parse(buildPreset('rebound',{exchange:'OKX',pair:'ETH/USDT',market:'Perpetual Futures',side:'SHORT'}));
 assert.equal(s.entry.kind,'COMPARE');if(s.entry.kind==='COMPARE'){assert.equal(s.entry.op,'CROSS_BELOW');assert.deepEqual(s.entry.right,{kind:'CONSTANT',value:70});}
});
test('templates differ and invalid preset fails',()=>{
 const entries=presets.map(p=>(buildPreset(p.id,{exchange:'Binance',pair:'BTC/USDT',market:'Spot',side:'SPOT'}) as any).entry);
 assert.equal(new Set(entries.map(e=>JSON.stringify(e))).size,6);
 assert.throws(()=>buildPreset('invalid',{exchange:'Binance',pair:'BTC/USDT',market:'Spot',side:'SPOT'}));
});
