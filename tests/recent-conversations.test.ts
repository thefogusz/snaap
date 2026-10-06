import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
const {createConversationCache} = await import(new URL('../dist/conversation-cache.js', import.meta.url).href);

async function pickerFixture(initial: any[] = [{id: 'chat', title: 'Recent', created_at: '2026-01-01'}], cold = false) {
  const dialogs: any[] = [];
  const list = {innerHTML: '', onclick: null, setAttribute() {}, querySelectorAll: () => []};
  const input = {value: '', focus() {}, oninput: null};
  const status = {textContent: '', hidden: true};
  const button = {onclick: null, hidden: true};
  const close = {onclick: null};
  const picker: any = {focus() {}, setAttribute() {}};
  const requests: Array<{resolve: (rows: any[]) => void, reject: (error: Error) => void}> = [];
  const state = {me: {id: 'owner'}, workspaceId: 'one', conversationRows: initial, workspaces: []};
  let time = 100000;
  const cache = createConversationCache({scope: () => ({owner: state.me.id, workspace: state.workspaceId}), now: () => time,
    load: () => new Promise((resolve, reject) => requests.push({resolve, reject}))});
  if (!cold) {const loaded = cache.list(); requests.shift()!.resolve(initial); await loaded; time += 31000;}
  const context = vm.createContext({
    conversationPicker: picker,
    state, conversationCache: cache, performance, recordConversationTiming() {},
    requestAnimationFrame: (callback: () => void) => callback(), window: {addEventListener() {}},
    api: () => new Promise(() => {}), renderConversationTitle() {}, uiIcon: () => '', esc: String,
    conversations: {}, toast() {}, matchMedia: () => ({matches: true}),
    document: {body: {append() {}}, createElement() {
      const dialog: any = {open: false, isConnected: true, setAttribute() {}, querySelector(s: string) {
        return s === 'input' ? input : s === '.conversation-results' ? list : s.includes('status') ? status : s === 'header button' ? close : button;
      }, showModal() {this.open = true;}, close() {this.open = false; this.onclose?.();}, remove() {this.isConnected = false;}};
      dialogs.push(dialog); return dialog;
    }},
  });
  const start = source.indexOf('function conversationScope()');
  const end = source.indexOf('\nconst chatComposer', start);
  vm.runInContext(source.slice(start, end), context);
  return {picker, dialogs, list, status, input, button, state, requests, cache};
}
test('recent conversations opens from existing data before a slow API responds', async () => {
  const {picker, dialogs, list} = await pickerFixture();
  picker.onclick();
  assert.equal(dialogs.filter(d => d.open).length, 1, 'menu must open without waiting for network');
  assert.match(list.innerHTML, /Recent/);
});

test('rapid repeat clicks open one menu and share a single list request', async () => {
  const f = await pickerFixture();
  for (let i = 0; i < 5; i++) f.picker.onclick();
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.requests.length, 1);
  f.dialogs[0].close();
  f.picker.onclick();
  assert.equal(f.requests.length, 1, 'reopening during fetch reuses its promise');
});

test('background refresh preserves search and a failed refresh keeps cached rows usable', async () => {
  const f = await pickerFixture();
  f.picker.onclick(); f.input.value = 'Recent';
  f.requests.shift()!.resolve([{id: 'chat', title: 'Recent updated'}, {id: 'other', title: 'Hidden'}]);
  await new Promise(done => setImmediate(done));
  assert.equal(f.input.value, 'Recent');
  assert.match(f.list.innerHTML, /Recent updated/);
  assert.doesNotMatch(f.list.innerHTML, /Hidden/);
  const failed = await pickerFixture();
  failed.picker.onclick(); failed.requests.shift()!.reject(Error('offline'));
  await new Promise(done => setImmediate(done));
  assert.match(failed.list.innerHTML, /Recent/);
  assert.match(failed.status.textContent, /ยังใช้รายการเดิมได้/);
});

test('cold menu distinguishes loading, error, and an empty successful result', async () => {
  const f = await pickerFixture([], true);
  f.picker.onclick();
  assert.equal(f.dialogs[0].open, true);
  assert.match(f.status.textContent, /กำลังโหลด/);
  assert.doesNotMatch(f.list.innerHTML, /ไม่พบ/);
  f.requests.shift()!.resolve([]);
  await new Promise(done => setImmediate(done));
  assert.match(f.list.innerHTML, /ไม่พบบทสนทนา/);
});

test('cold error offers retry and then displays successfully loaded rows', async () => {
  const f = await pickerFixture([], true); f.picker.onclick();
  f.requests.shift()!.reject(Error('offline'));
  await new Promise(done => setImmediate(done));
  assert.match(f.status.textContent, /ไม่สำเร็จ/); assert.equal(f.button.hidden, false);
  (f.button.onclick as unknown as () => void)();
  f.requests.shift()!.resolve([{id: 'retry', title: 'Retry result'}]);
  await new Promise(done => setImmediate(done));
  assert.match(f.list.innerHTML, /Retry result/);
  assert.equal(f.status.hidden, true); assert.equal(f.button.hidden, true);
});

test('closing the menu before a response does not repaint the removed dialog', async () => {
  const f = await pickerFixture(); f.picker.onclick(); f.dialogs[0].close();
  f.requests.shift()!.resolve([{id: 'later', title: 'Later'}]);
  await new Promise(done => setImmediate(done));
  assert.doesNotMatch(f.list.innerHTML, /Later/);
  assert.equal(f.cache.read().rows[0].title, 'Later', 'the successful response remains reusable on next open');
});

test('a delayed menu response cannot replace another workspace list', async () => {
  const f = await pickerFixture(); f.picker.onclick();
  f.state.workspaceId = 'two'; f.state.conversationRows = [{id: 'new', title: 'New workspace'}];
  f.requests.shift()!.resolve([{id: 'old', title: 'Wrong workspace'}]);
  await new Promise(done => setImmediate(done));
  assert.equal(f.state.conversationRows[0].id, 'new');
  assert.equal(f.dialogs[0].open, false);
  assert.equal(f.cache.read().rows.length, 0);
});

test('list cache respects freshness, scopes and retries after a failure', async () => {
  let time = 100000, calls = 0;
  const scope = {owner: 'one', workspace: 'a'};
  let fail = false;
  const cache = createConversationCache({scope: () => scope, now: () => time, load: async () => {
    calls++; if (fail) throw Error('offline'); return [{id: scope.owner + scope.workspace}];
  }});
  await cache.list(); await cache.list(); assert.equal(calls, 1);
  time += 31000; fail = true; await assert.rejects(cache.list());
  assert.equal(cache.read().rows[0].id, 'onea');
  fail = false; await cache.list(); assert.equal(calls, 3);
  scope.workspace = 'b'; assert.equal(cache.read().ready, false); await cache.list();
  scope.workspace = 'a'; assert.equal(cache.read().rows[0].id, 'onea');
  scope.owner = 'two'; assert.equal(cache.read().ready, false);
  scope.owner = 'one'; assert.equal(cache.read().ready, false, 'switching accounts clears the previous account cache');
});

test('local rename/create wins over a list response started before the mutation', async () => {
  const f = await pickerFixture(); const pending = f.cache.list();
  f.cache.upsert({id: 'chat', title: 'Renamed'});
  f.cache.upsert({id: 'new', title: 'Created'});
  f.requests.shift()!.resolve([{id: 'chat', title: 'Old title'}]); await pending;
  assert.equal(f.cache.read().rows[0].title, 'Created');
  assert.equal(f.cache.read().rows[1].title, 'Renamed');
  assert.equal(f.cache.read().fresh, false);
});

function selectionFixture() {
  const state: any = {workspaceId: 'one', conversation: 'previous', conversationRows: [], rules: []};
  const requests: Array<{path: string, signal: AbortSignal, resolve: (row: any) => void}> = [];
  const rows: any[] = [], started: string[] = [], jobs: Array<() => void> = [];
  let change!: () => Promise<void>;
  const conversations = {value: 'first', addEventListener(_event: string, callback: typeof change) {change = callback;}};
  const messages = {prepend() {}, replaceChildren() {}};
  const context = vm.createContext({
    state, conversations, performance, AbortController, leaveDraft: async () => true,
    api: (path: string, _method: string, _body: unknown, options: any) => new Promise(resolve => requests.push({path, signal: options.signal, resolve})),
    conversationCache: {upsert: (row: any) => rows.push(row), read: () => ({rows})}, applyConversationRows: (value: any[]) => {state.conversationRows = value;},
    initial: () => ({}), showDraftStatus() {}, renderImages() {}, setWorkbenchTab() {}, showDesigner() {}, recordConversationTiming() {}, toast() {},
    $: () => messages, document: {createElement: () => ({setAttribute() {}, remove() {}})},
    loadChatHistory: () => {started.push('messages'); return new Promise<void>(resolve => jobs.push(resolve));},
    restoreChatImages: () => {started.push('images'); return new Promise<void>(resolve => jobs.push(resolve));},
  });
  const start = source.indexOf('let conversationSelection=0;');
  const end = source.indexOf('\ndocument.addEventListener("keydown"', start);
  vm.runInContext(source.slice(start, end), context);
  return {state, conversations, requests, rows, started, jobs, change: () => change()};
}

test('selection fetches only the chosen detail and starts history and images together', async () => {
  const f = selectionFixture(); const pending = f.change();
  await new Promise(done => setImmediate(done));
  assert.equal(f.requests[0].path, '/conversations/first');
  f.requests[0].resolve({id: 'first', draft: {name: 'Fresh'}, draft_revision: 4});
  await new Promise(done => setImmediate(done));
  assert.deepEqual(f.started, ['messages', 'images']);
  assert.equal(f.state.draft.name, 'Fresh'); assert.equal(f.state.draftRevision, 4);
  f.jobs.forEach(resolve => resolve()); await pending;
  assert.equal(f.requests.length, 1);
});

test('a superseded selection aborts detail and cannot overwrite the newer conversation', async () => {
  const f = selectionFixture(); const first = f.change();
  await new Promise(done => setImmediate(done));
  f.conversations.value = 'second'; const second = f.change();
  await new Promise(done => setImmediate(done));
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[1].resolve({id: 'second', draft: {name: 'Second'}, draft_revision: 2});
  await new Promise(done => setImmediate(done)); f.jobs.forEach(resolve => resolve()); await second;
  f.requests[0].resolve({id: 'first', draft: {name: 'Wrong'}, draft_revision: 1}); await first;
  assert.equal(f.state.conversation, 'second'); assert.equal(f.state.draft.name, 'Second');
  assert.equal(f.rows.length, 1);
});

test('a selection response from the previous workspace cannot set its draft in the new workspace', async () => {
  const f = selectionFixture(); const pending = f.change();
  await new Promise(done => setImmediate(done)); f.state.workspaceId = 'two';
  f.requests[0].resolve({id: 'first', draft: {name: 'Wrong'}, draft_revision: 1}); await pending;
  assert.equal(f.state.conversation, 'previous'); assert.equal(f.rows.length, 0);
  assert.equal(f.started.length, 0);
});
