import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const startup = await readFile(new URL('../dist/boot-ui.js', import.meta.url), 'utf8');
const workbench = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
const boot = workbench.slice(workbench.indexOf('async function boot() {'), workbench.indexOf('\nboot();'));

test('slow startup keeps the uninitialized application hidden and offers retry', () => {
  const root = {dataset: {} as Record<string,string>};
  const message = {textContent: '', classList: {remove() {}}}, retry = {hidden: true};
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
  const workspace = deferred(), rules = deferred(), recovery = deferred(), health = deferred();
  let revealed = 0;
  const failures: string[] = [];
  const context = vm.createContext({
    conversationCacheReady: Promise.resolve(), companionScriptsReady: Promise.resolve(), setupLimitsReady: Promise.resolve(), timeframeToolsReady: Promise.resolve(), directionToolsReady: Promise.resolve(), indicatorCatalogReady: Promise.resolve(), entryFlexReady: Promise.resolve(),
    state: {draft: {}, me: null}, workbench: {hidden: false}, status: {textContent: '', hidden: true},
    healthReady: Promise.resolve(),
    api: async (url: string) => url === '/health' ? health.promise : {local: false},
    initWorkspaces: () => failure ? Promise.reject(Error('workspace unavailable')) : workspace.promise,
    refresh: () => rules.promise, restoreRecovery: () => recovery.promise,
    $: () => ({textContent: ''}), navigate() {}, showDesigner() {}, setWorkbenchTab() {}, renderDesigner() {},
    sizeWorkbench() {}, sessionStorage: {removeItem() {}}, location: {replace() {}},
    document: {querySelectorAll: () => []}, requestAnimationFrame: (callback: () => void) => callback(),
    window: {SnaapRouter: {current: () => 'home'}, SnaapBoot: {finish: () => {revealed++;}, fail: (message: string) => failures.push(message)}},
  });
  vm.runInContext(boot + ';globalThis.start=boot;', context);
  return {start: context.start as () => Promise<void>, workspace, rules, recovery, health, revealed: () => revealed, failures};
}

test('first real frame waits for required data and recovery, without waiting for health', async () => {
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

test('recovery starts history, context and images together and waits for them before revealing', async () => {
  const started: string[] = [];
  const jobs = [deferred(), deferred(), deferred()];
  const stored = {version: 1, designerOpen: true, conversation: 'chat', draft: {schemaVersion: 2}, useMyData: true};
  const context = vm.createContext({
    recoveryReady: true, localStorage: {getItem: () => JSON.stringify(stored)}, recoveryKey: () => 'key',
    state: {conversationRows: [{id: 'chat'}], rules: []}, conversations: {},
    $: () => ({value: '', dispatchEvent() {}}), Event: class {}, setWorkbenchTab() {}, showDesigner() {}, queueDraftSave() {}, renderConversationTitle() {},
    loadChatHistory: () => {started.push('history'); return jobs[0].promise;},
    setMyData: () => {started.push('context'); return jobs[1].promise;},
    restoreChatImages: () => {started.push('images'); return jobs[2].promise;},
  });
  const recovery = workbench.slice(workbench.indexOf('async function restoreRecovery() {'), workbench.indexOf("\ndocument.addEventListener('input',event=>"));
  vm.runInContext(recovery + ';globalThis.restore=restoreRecovery;', context);
  const running = context.restore();
  assert.deepEqual(started, ['history', 'context', 'images']);
  assert.equal(context.recoveryReady, false);
  jobs[0].resolve(); jobs[1].resolve();
  await new Promise(done => setImmediate(done));
  assert.equal(context.recoveryReady, false);
  jobs[2].resolve();
  await running;
  assert.equal(context.recoveryReady, true);
});

// Dynamic imports may resolve after DOMContentLoaded while images keep readyState interactive.
test('startup readiness cannot miss DOMContentLoaded during dynamic imports', async () => {
  let loaded = () => {};
  const context = vm.createContext({document: {readyState: 'interactive', addEventListener: (_event: string, fn: () => void) => {loaded = fn;}}});
  vm.runInContext(workbench.slice(0, workbench.indexOf('const setupChangesReady')) + ';globalThis.ready=companionScriptsReady;', context);
  loaded();
  assert.equal(await Promise.race([context.ready.then(() => 'ready'), new Promise(resolve => setTimeout(() => resolve('missed'), 100))]), 'ready');
});
