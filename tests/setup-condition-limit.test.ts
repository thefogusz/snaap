import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('editor permits the twentieth condition and stops the twenty-first across branches', async () => {
  const source = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
  const leaf={kind:'COMPARE'}, group=(n:number)=>({kind:'GROUP',children:Array(n).fill(leaf)});
  const state:any={draft:{entry:group(19),stages:[]}}; const warnings:string[]=[];
  const context=vm.createContext({state,toast:(text:string)=>warnings.push(text)});
  vm.runInContext(source.slice(source.indexOf('const MAX_SETUP_CONDITIONS'),source.indexOf('function renderDesigner()'))+';globalThis.allow=canAddSetupCondition;',context);
  assert.equal(context.allow(),true);
  state.draft.exit={kind:'HOLD',condition:leaf}; assert.equal(context.allow(),false);
  assert.match(warnings[0],/20/);
  state.draft={entry:group(10),short:{entry:group(9),stages:[{condition:leaf}]}};
  assert.equal(context.allow(),false);
  state.draft={entry:group(19),mirrorShort:true}; assert.equal(context.allow(),true);
});
