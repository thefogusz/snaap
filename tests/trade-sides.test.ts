import {test} from 'node:test';import assert from 'node:assert/strict';
import {strategySchema,replay,advance,emptyLifecycle,value,type Series} from '../src/domain/engine.js';
import {mirrorCondition,signalDirection,selectDirections,setShortMirroring} from '../dist/trade-direction.js';
import {preview} from '../src/domain/preview.js';
const entry={kind:'COMPARE',op:'>',left:{kind:'PRICE',field:'close',timeframe:'15m'},right:{kind:'CONSTANT',value:100}};
const base={schemaVersion:2,name:'Directional setup',exchange:['MEXC'],market:'Perpetual Futures',pairs:['BTC/USDT'],timeframe:'15m',entry,stages:[],cooldownBars:0,destinations:[]};
const series:Series={'15m':[90,110,90,80].map((close,i)=>({time:(i+1)*900000,open:close,high:close,low:close,close,volume:1}))};
test('single side events identify market and direction; short favorable movement is positive',()=>{
 const spec=strategySchema.parse({...base,side:'SHORT',exit:{kind:'COMPARE',op:'>',left:{kind:'ENTRY_RETURN'},right:{kind:'CONSTANT',value:10}}});
 const events=replay(spec,series);assert.deepEqual(events.map(e=>[e.kind,e.side,e.market]),[['ENTRY','SHORT','Perpetual Futures'],['EXIT','SHORT','Perpetual Futures']]);
 assert.ok(Math.abs(value({kind:'ENTRY_RETURN'},series,3600000,100,'15m','SHORT')!-20)<1e-10);
});
test('both sides have independent conditions and survive checkpoint serialization',()=>{
 const spec=strategySchema.parse({...base,side:'BOTH',short:{entry:{...entry,op:'<'},stages:[],cooldownBars:0}});
 let state=emptyLifecycle();const events=[];
 for(const bar of series['15m']!){const next=advance(spec,series,bar,JSON.parse(JSON.stringify(state)));state=next.state;events.push(...next.events);}
 assert.deepEqual(events,replay(spec,series));assert.deepEqual(events.map(e=>e.side),['SHORT','LONG','SHORT']);
});
test('spot is explicit; ambiguous legacy futures never invent a direction',()=>{
 assert.equal(replay(strategySchema.parse({...base,market:'Spot'}),series)[0].side,'SPOT');
 assert.equal(replay(strategySchema.parse(base),series)[0].side,'UNSPECIFIED');
 assert.throws(()=>strategySchema.parse({...base,market:'Spot',side:'SHORT'}));
 assert.throws(()=>strategySchema.parse({...base,side:'BOTH'}));
 assert.throws(()=>strategySchema.parse({...base,side:'LONG',short:{entry,stages:[],cooldownBars:0}}));
});

test('one Long template generates distinct mirrored Short signals, including Short-only',()=>{
 const spec=strategySchema.parse({...base,side:'BOTH',mirrorShort:true});
 assert.deepEqual(replay(spec,series).map(e=>e.side),['SHORT','LONG','SHORT']);
 assert.deepEqual(replay({...spec,side:'SHORT'},series).map(e=>e.side),['SHORT','SHORT']);
 const frame=preview(spec,series).timeline[0];
 assert.deepEqual(frame.branches.map(b=>[b.side,b.entry.result]),[['LONG','FALSE'],['SHORT','TRUE']]);
 assert.equal(signalDirection({side:'SHORT',market:'Perpetual Futures'},'Spot','SPOT'),'Short (ขาย) · Futures');
 assert.equal(signalDirection({},'Spot'),'Spot (ซื้อ)');
 assert.equal(signalDirection({},'Perpetual Futures'),'Futures · ยังไม่ระบุฝั่ง');
});

test('mirroring reverses comparisons and crossing; signed return targets stay unchanged',()=>{
 for(const [op,inverse] of [['>','<'],['>=','<='],['<','>'],['<=','>='],['CROSS_ABOVE','CROSS_BELOW'],['CROSS_BELOW','CROSS_ABOVE']])assert.equal(mirrorCondition({...entry,op}).op,inverse);
 const returns={kind:'COMPARE',op:'>',left:{kind:'ENTRY_RETURN'},right:{kind:'CONSTANT',value:5}};
 assert.deepEqual(mirrorCondition(returns),returns);
 const condition={kind:'HOLD',bars:2,condition:{kind:'GROUP',op:'AND',children:[entry,returns]}};
 assert.deepEqual(mirrorCondition(mirrorCondition(condition)),condition);
 const spec=strategySchema.parse({...base,side:'BOTH',mirrorShort:true,exit:returns});
 assert.deepEqual(replay(spec,series).map(e=>[e.kind,e.side]),[['ENTRY','SHORT'],['ENTRY','LONG'],['EXIT','SHORT']]);
 assert.throws(()=>strategySchema.parse({...base,side:'LONG',mirrorShort:true}));
 assert.throws(()=>strategySchema.parse({...base,side:'BOTH',mirrorShort:true,short:{entry,stages:[],cooldownBars:0}}));
});

test('direct Short uses entered conditions; only BOTH exposes automatic mirroring',()=>{
 const short=selectDirections({...base,side:'LONG'},['SHORT']);
 assert.deepEqual(short.entry,entry);assert.equal((short as any).mirrorShort,undefined);
 const both=selectDirections(short,['LONG','SHORT']);
 assert.equal((both as any).mirrorShort,true);assert.equal(both.entry.op,'<');
 const restored=selectDirections(both,['SHORT']);assert.deepEqual(restored.entry,short.entry);
 const separate=setShortMirroring(both,false) as any;
 assert.equal(separate.mirrorShort,undefined);assert.deepEqual(separate.short.entry,short.entry);
 assert.equal(strategySchema.parse(separate).side,'BOTH');
 // Materialize a previously saved Short template without changing its behavior.
 const old=strategySchema.parse({...base,side:'SHORT',mirrorShort:true});
 const normalized=selectDirections(old,['SHORT']);
 assert.deepEqual(replay(normalized,series),replay(old,series));
});
