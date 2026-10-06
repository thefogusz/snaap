import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const interactions = await readFile(new URL('../dist/interactions.js', import.meta.url), 'utf8');
const selects = await readFile(new URL('../dist/selects.js', import.meta.url), 'utf8');
const workbench = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');

function element(parentElement: any = null) {
  return {nodeType: 1, isConnected: true, parentElement, closest: () => null};
}
function decorationFixture() {
  const frames: Array<() => void> = [], decorated: any[] = [];
  let observer: any;
  const context = vm.createContext({
    document: {body: {}},
    requestAnimationFrame: (fn: () => void) => { frames.push(fn); return frames.length; },
    MutationObserver: class { constructor(fn: any) { observer = fn; } observe() {} },
    decorateControls: (root: any) => decorated.push(root),
  });
  const start = interactions.indexOf('let decorationFrame;');
  const end = interactions.indexOf('\ndecorateControls();', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(interactions.slice(start, end), context);
  return {notify: (records: any[]) => observer(records), flush: () => { while(frames.length) frames.shift()!(); }, decorated};
}

test('chat text mutations do not trigger global control decoration', () => {
  const fixture = decorationFixture();
  fixture.notify([{target: element(), addedNodes: [{nodeType: 3}]}]);
  fixture.flush();
  assert.equal(fixture.decorated.length, 0);
});
test('new controls and changed button labels are decorated within their own subtree', () => {
  const fixture = decorationFixture(), button = element(), child = element(button);
  fixture.notify([{target: {...element(), closest: () => button}, addedNodes: [child]}]);
  fixture.flush();
  assert.deepEqual(fixture.decorated, [button]);
});
test('500 sibling rows are decorated in one parent pass', () => {
  const fixture = decorationFixture(), list = element();
  const rows = Array.from({length: 500}, () => element(list));
  fixture.notify(rows.map(row => ({target: list, addedNodes: [row]})));
  fixture.flush();
  assert.deepEqual(fixture.decorated, [list]);
});
test('removed controls are not decorated after a queued frame', () => {
  const fixture = decorationFixture(), button = element();
  fixture.notify([{target: element(), addedNodes: [button]}]);
  button.isConnected = false;
  fixture.flush();
  assert.equal(fixture.decorated.length, 0);
});

function selectFixture(opened: any = null) {
  const scanned: any[][] = [], jobs: Array<() => void> = [];
  let observer: any;
  const context = vm.createContext({
    document: {body: {}}, pendingSelects: new Set(), scheduled: false, opened,
    queueMicrotask: (fn: () => void) => jobs.push(fn),
    scan: (items: Set<any>) => scanned.push([...items]),
    MutationObserver: class { constructor(fn: any) { observer = fn; } observe() {} },
  });
  const start = selects.indexOf('new MutationObserver(');
  const end = selects.indexOf('\n  scan();', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(selects.slice(start, end), context);
  return {notify: (records: any[]) => observer(records), flush: () => { while(jobs.length) jobs.shift()!(); }, scanned};
}
test('unrelated DOM changes do not rescan existing selects', () => {
  const fixture = selectFixture();
  fixture.notify([{target: element(), addedNodes: [{...element(), matches: () => false, querySelectorAll: () => []}]}]);
  fixture.flush();
  assert.equal(fixture.scanned.length, 0);
});
test('option and disabled changes update only their owning select', () => {
  const fixture = selectFixture(), select = element();
  fixture.notify([{target: {...element(), closest: () => select}, addedNodes: []}]);
  fixture.flush();
  assert.deepEqual(fixture.scanned, [[select]]);
});
test('new selects nested in added markup are enhanced', () => {
  const fixture = selectFixture(), select = element();
  fixture.notify([{target: element(), addedNodes: [{...element(), matches: () => false, querySelectorAll: () => [select]}]}]);
  fixture.flush();
  assert.deepEqual(fixture.scanned, [[select]]);
});
test('removing an open select schedules menu cleanup without a global scan', () => {
  const fixture = selectFixture({select: {...element(), isConnected: false}});
  fixture.notify([{target: element(), addedNodes: []}]);
  fixture.flush();
  assert.deepEqual(fixture.scanned, [[]]);
});

test('enabling My Data loads context and images concurrently and updates the switch only on success', async () => {
  const calls: string[] = [], resolvers: Array<() => void> = [];
  const label={textContent:'ใช้ข้อมูลของฉัน'};
  const button = {disabled: false, querySelector:()=>label, setAttribute: () => {calls.push('checked');}};
  const state = {busy: false, useMyData: false};
  const context = vm.createContext({
    state, chatTools: {querySelector: () => button}, sources: {hidden: true}, persistRecovery: () => {},
    refreshContext: () => new Promise<void>(resolve => {calls.push('context'); resolvers.push(resolve);}),
    renderLabImageChoices: () => new Promise<void>(resolve => {calls.push('images'); resolvers.push(resolve);}),
  });
  const start = workbench.indexOf('async function setMyData(');
  const end = workbench.indexOf('\nconst conversations', start);
  vm.runInContext(workbench.slice(start, end), context);
  const pending = context.setMyData(true);
  assert.deepEqual(calls, ['context', 'images']);
  assert.equal(state.useMyData, false);
  assert.equal(button.disabled, true);
  assert.equal(label.textContent, 'กำลังเตรียมข้อมูล…');
  resolvers.forEach(resolve => resolve());
  await pending;
  assert.equal(state.useMyData, true);
  assert.equal(button.disabled, false);
  assert.equal(label.textContent, 'ใช้ข้อมูลของฉัน');
  assert.deepEqual(calls, ['context', 'images', 'checked']);
});
