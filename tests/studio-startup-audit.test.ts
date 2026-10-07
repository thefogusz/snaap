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

test('unchanged draft saves keep chart evidence, while edits and conversation changes invalidate it', async () => {
  const workbench = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
  const start=workbench.indexOf('function queueDraftSave() {'), end=workbench.indexOf('async function leaveDraft()',start);
  let events=0;
  const sandbox=vm.createContext({state:{draft:{name:'Native',pairs:['TSLA/USDT']},undo:[]},lastNotifiedDraft:'',conversationScope:()=>sandbox.scope,scope:'chat-one',persistRecovery:()=>{},document:{dispatchEvent:()=>events++},Event,panel:{querySelector:()=>null},hasEntryCondition:()=>true,draftDirty:()=>false,clearTimeout:()=>{},draftTimer:null,draftFlight:null,showDraftStatus:()=>{}});
  vm.runInContext(workbench.slice(start,end)+';globalThis.save=queueDraftSave;',sandbox);
  sandbox.save();assert.equal(events,1);
  sandbox.save();assert.equal(events,1,'read-only chat must retain its selected closed-bar evidence');
  sandbox.state.draft.name='Renamed';sandbox.save();assert.equal(events,2);
  sandbox.scope='chat-two';sandbox.save();assert.equal(events,3,'never reuse another conversation evidence');
});

test('pair guidance uses canonical asset metadata rather than the multi-pair button label', async () => {
  const guide=await readFile(new URL('../dist/guide-scenes.js',import.meta.url),'utf8');
  const sandbox=vm.createContext({window:{},document:{querySelector:()=>({dataset:{pairExample:'TSLA/USDT'},textContent:'2 คู่เทรด เปลี่ยน ▾'})}});
  vm.runInContext(guide,sandbox);
  const markup=sandbox.window.SnaapGuideScenes.render('pair');
  assert.match(markup,/TSLA/);assert.match(markup,/USDT/);assert.doesNotMatch(markup,/undefined|2 คู่เทรด/);
});
