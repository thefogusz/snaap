import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = await readFile(new URL('../dist/signal-unread.js', import.meta.url), 'utf8');
function fixture() {
  const badge: any = {textContent: '', hidden: true, setAttribute() {}};
  const view = {hidden: true};
  const document: any = {hidden: false, focused: true, hasFocus() {return this.focused;},
    querySelector(selector: string) {return selector === '#nav-count' ? badge : selector === '#view-notifications' ? view : null;},
    addEventListener() {}};
  let summary = {count: 3, latestId: 'signal-3'}, failRead = false;
  const calls: any[] = [];
  const window: any = {addEventListener() {}};
  const context: any = {window, document, state: {me: {id: 'owner'}, workspaceId: 'workspace'},
    notificationSection: 'rules', notificationWorkspace: 'workspace',
    notificationData: {loaded: true, signals: [{id: 'signal-3'}]}, canDisplaySignal: () => true,
    renderNotifications() {},
    async api(path: string, method: string, payload: any) {
      calls.push({path, method, payload});
      if (method === 'POST') {
        if (failRead) throw Error('offline');
        summary = {count: 0, latestId: null as any};
        return {ok: true};
      }
      return {...summary};
    }};
  runInNewContext(source, context);
  return {context, badge, view, document, calls, controller: window.SnaapSignalUnread,
    setSummary(value: typeof summary) {summary = value;}, failRead(value: boolean) {failRead = value;}};
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('badge uses unread signals, hides at zero and caps display without losing exact count', async () => {
  const f = fixture();
  await f.controller.refresh();
  assert.equal(f.badge.textContent, '3');
  assert.equal(f.badge.hidden, false);
  f.setSummary({count: 105, latestId: 'signal-105'});
  await f.controller.refresh();
  assert.equal(f.badge.textContent, '99+');
  assert.ok(f.badge.title.includes('105'));
  f.view.hidden = false;
  await f.controller.enter();
  assert.equal(f.badge.hidden, true);
  assert.equal(f.calls.find(c => c.method === 'POST').payload.through, 'signal-105');
});

test('only a loaded inbox in the foreground acknowledges new arrivals', async () => {
  const f = fixture();
  f.view.hidden = false;
  await f.controller.refresh();
  f.controller.markVisible();
  assert.equal(f.calls.some(c => c.method === 'POST'), false, 'Setups tab is not the inbox');
  f.context.notificationSection = 'inbox';
  f.document.hidden = true;
  f.controller.markVisible();
  f.document.hidden = false;
  f.document.focused = false;
  f.controller.markVisible();
  assert.equal(f.calls.some(c => c.method === 'POST'), false, 'Background tabs/windows keep unread');
  f.document.focused = true;
  f.context.notificationData.loaded = false;
  f.controller.markVisible();
  assert.equal(f.calls.some(c => c.method === 'POST'), false, 'Loading is not reading');
  f.context.notificationData.loaded = true;
  f.controller.markVisible();
  f.controller.markVisible();
  await settle();
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1, 'Deduplicate overlapping renders');
  assert.equal(f.badge.hidden, true);
});

test('read failures retain unread and can be retried', async () => {
  const f = fixture();
  f.view.hidden = false;
  f.failRead(true);
  await f.controller.enter();
  assert.equal(f.badge.textContent, '3');
  assert.equal(f.badge.hidden, false);
  f.failRead(false);
  await f.controller.enter();
  assert.equal(f.badge.hidden, true);
});

test('late summary responses cannot leak counts into another workspace', async () => {
  const f = fixture();
  let resolveOld: (value: any) => void = () => {};
  f.context.api = () => new Promise(resolve => {resolveOld = resolve;});
  const oldRequest = f.controller.refresh();
  f.context.state.workspaceId = 'other-workspace';
  f.context.api = async () => ({count: 7, latestId: 'other-signal'});
  await f.controller.refresh();
  resolveOld({count: 99, latestId: 'old-signal'});
  await oldRequest;
  assert.equal(f.badge.textContent, '7');
});

test('a simultaneous poll cannot cancel clearing on entry', async () => {
  const f = fixture();
  f.view.hidden = false;
  let resolveEntry: (value: any) => void = () => {};
  const normalApi = f.context.api;
  f.context.api = () => new Promise(resolve => {resolveEntry = resolve;});
  const entry = f.controller.enter();
  f.context.api = normalApi;
  await f.controller.refresh();
  resolveEntry({count: 3, latestId: 'signal-3'});
  await entry;
  assert.equal(f.badge.hidden, true);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});
