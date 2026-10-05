import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('editor permits the twenty-fourth condition and stops the twenty-fifth across branches', async () => {
  const source = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
  const leaf={kind:'COMPARE'}, group=(n:number)=>({kind:'GROUP',children:Array(n).fill(leaf)});
  const state:any={draft:{entry:group(23),stages:[]}}; const warnings:string[]=[];
  const context=vm.createContext({state,toast:(text:string)=>warnings.push(text)});
  vm.runInContext('const MAX_SETUP_CONDITIONS=24;'+source.slice(source.indexOf('function setupConditionCount'),source.indexOf('function renderDesigner()'))+';globalThis.allow=canAddSetupCondition;',context);
  assert.equal(context.allow(),true);
  state.draft.exit={kind:'HOLD',condition:leaf}; assert.equal(context.allow(),false);
  assert.match(warnings[0],/24/);
  state.draft={entry:group(12),short:{entry:group(11),stages:[{condition:leaf}]}};
  assert.equal(context.allow(),false);
  state.draft={entry:group(23),mirrorShort:true}; assert.equal(context.allow(),true);
});
