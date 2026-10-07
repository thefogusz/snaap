import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import { strategyTargets } from '../dist/asset-catalog.js';
const source=await readFile(new URL('../dist/studio.js',import.meta.url),'utf8');
const start=source.indexOf('let availabilityGeneration = 0;');
const end=source.indexOf("document.addEventListener('setup-rendered', checkPairAvailability);",start);
assert.ok(start>=0&&end>start);
function checker(draft:unknown,hint:unknown=null) {
  let calls=0;
  const context=vm.createContext({state:{draft},assetToolsReady:Promise.resolve(),assetTools:{strategyTargets},panel:{querySelector:()=>hint},api:async()=>{calls++;return {items:[{supported:true,symbol:'BTC/USDT'}]};}});
  // Run the actual trusted production function in a test-only VM, without a browser or network.
  vm.runInContext(source.slice(start,end)+';globalThis.auditCheck=checkPairAvailability;',context);
  return {check:context.auditCheck as ()=>Promise<void>,calls:()=>calls};
}
test('fresh chat startup has no draft: pair availability does not throw or fetch',async()=>{
  const fixture=checker(null);await assert.doesNotReject(fixture.check());assert.equal(fixture.calls(),0);
});
test('hidden/absent designer hint does not fetch pair availability',async()=>{
  const fixture=checker({exchange:['Binance'],market:'Spot',pairs:['BTC/USDT']});await fixture.check();assert.equal(fixture.calls(),0);
});
test('visible designer resolves pair availability using the selected draft',async()=>{
  const hint={textContent:'',hidden:false,isConnected:true,style:{color:''}};
  const fixture=checker({exchange:['Binance'],market:'Spot',pairs:['BTC/USDT']},hint);
  await fixture.check();assert.equal(fixture.calls(),1);assert.equal(hint.textContent,'');assert.equal(hint.hidden,true);
});

test('studio context carries the same saved source as the visible native chart', async () => {
  const studio = await readFile(new URL('../dist/setup-studio.js', import.meta.url), 'utf8');
  const start = studio.indexOf('  function context() {'), end = studio.indexOf('  window.SnaapStudio =', start);
  const draft = { exchange:['Binance','Gate'], pairs:['BTC/USDT','TSLA/USDT'], targets:[{exchange:'Binance',pair:'BTC/USDT'},{exchange:'Gate',pair:'TSLA/USDT'}] };
  const sandbox = vm.createContext({ state:{draft}, window:{SnaapChart:{pair:'TSLA/USDT',selectedTime:123}}, hasEntryCondition:()=>true, session:()=>{}, view:{frame:'5m'}, focusPath:null, assetTools:{strategyTargets} });
  vm.runInContext(studio.slice(start,end)+';globalThis.result=context();',sandbox);
  assert.equal(sandbox.result.exchange,'Gate');
  assert.equal(sandbox.result.pair,'TSLA/USDT');
  assert.equal(sandbox.result.selectedBarTime,123);
});
