import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const startup = await readFile(new URL('../dist/boot-ui.js', import.meta.url), 'utf8');
const workbench = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
const boot = workbench.slice(workbench.indexOf('async function boot() {'), workbench.indexOf('\nboot();'));

test('slow startup keeps the uninitialized application hidden and offers retry', () => {
  const root = {dataset: {} as Record<string,string>};
  const message = {textContent: ''}, retry = {hidden: true};
  let deadline = () => {};
  const context = vm.createContext({
    document: {documentElement: root, addEventListener() {}, querySelector: (selector: string) => selector.includes('message') ? message : retry},
    window: {}, setTimeout: (callback: () => void) => {deadline = callback;}, clearTimeout() {},
  });
  vm.runInContext(startup, context);
  deadline();
  assert.equal(root.dataset.boot, 'loading');
  assert.equal(retry.hidden, false);
  assert.match(message.textContent, /โหลดนาน/);
  context.window.SnaapBoot.finish();
  assert.equal(root.dataset.boot, undefined);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {resolve = done;});
  return {promise, resolve};
}
function bootFixture(failure = false) {
  const workspace = deferred(), rules = deferred(), recovery = deferred();
  let revealed = 0;
  const failures: string[] = [];
  const context = vm.createContext({
    directionToolsReady: Promise.resolve(), indicatorCatalogReady: Promise.resolve(), entryFlexReady: Promise.resolve(),
    state: {draft: {}, me: null}, workbench: {hidden: false}, status: {textContent: '', hidden: true},
    api: async (url: string) => url === '/health' ? {ai: true} : {local: false},
    initWorkspaces: () => failure ? Promise.reject(Error('workspace unavailable')) : workspace.promise,
    refresh: () => rules.promise, restoreRecovery: () => recovery.promise,
    $: () => ({textContent: ''}), navigate() {}, showDesigner() {}, setWorkbenchTab() {}, renderDesigner() {},
    sizeWorkbench() {}, sessionStorage: {removeItem() {}}, location: {hash: '#home', replace() {}},
    document: {querySelectorAll: () => []}, requestAnimationFrame: (callback: () => void) => callback(),
    window: {SnaapBoot: {finish: () => {revealed++;}, fail: (message: string) => failures.push(message)}},
  });
  vm.runInContext(boot + ';globalThis.start=boot;', context);
  return {start: context.start as () => Promise<void>, workspace, rules, recovery, revealed: () => revealed, failures};
}

test('first real frame waits for workspace, account, rules and recovered view', async () => {
  const f = bootFixture();
  const running = f.start();
  await new Promise(done => setImmediate(done));
  assert.equal(f.revealed(), 0);
  f.workspace.resolve();
  await new Promise(done => setImmediate(done));
  assert.equal(f.revealed(), 0);
  f.rules.resolve();
  await new Promise(done => setImmediate(done));
  assert.equal(f.revealed(), 0);
  f.recovery.resolve();
  await running;
  assert.equal(f.revealed(), 1);
});

test('failed workspace initialization shows an error without revealing demo HTML', async () => {
  const f = bootFixture(true);
  await f.start();
  assert.equal(f.revealed(), 0);
  assert.deepEqual(f.failures, ['workspace unavailable']);
});
