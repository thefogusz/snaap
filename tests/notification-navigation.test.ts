import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/notifications.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('async function renderNotifications('), source.indexOf('function paintNotifications()'));
function fixture() {
  const pending: {resolve: (value: unknown) => void; reject: (error: Error) => void}[] = [];
  const painted: unknown[] = [], errors: string[] = [];
  const view = {querySelector: () => null, insertAdjacentHTML: (_: string, html: string) => errors.push(html)};
  const state = {workspaceId: 'a', destinations: [{id: 'channel-a'}], destinationAvailability: {TELEGRAM: true}};
  const context = vm.createContext({state, Date, AbortSignal, window: {}, $: () => view, esc: (s: string) => s, canDisplaySignal: () => true,
    api: () => new Promise((resolve, reject) => pending.push({resolve, reject})),
    paintNotifications: () => painted.push(vm.runInContext('notificationData', context)),
  });
  vm.runInContext('let notificationData, notificationWorkspace, notificationFlight; let notificationLoadedAt=0, notificationRequest=0, notificationSection="rules";'+functions+';globalThis.render=renderNotifications;', context);
  return {context, state, painted, errors, pending, render: context.render as (force?: boolean) => Promise<void>};
}
test('setup page paints immediately and coalesces background reads without rebuilding it', async () => {
  const f = fixture();
  const first = f.render(false), second = f.render(false);
  assert.equal(f.painted.length, 1);
  assert.equal(f.pending.length, 4);
  const initial = f.painted[0] as {channels: {items: unknown[]}; loaded: boolean};
  assert.deepEqual(initial.channels.items, f.state.destinations);
  assert.equal(initial.loaded, false);
  f.pending.forEach((p, i) => p.resolve(i === 1 ? {items: [], available: {}} : []));
  await Promise.all([first, second]);
  assert.equal(f.painted.length, 1);
  await f.render(false);
  assert.equal(f.pending.length, 4);
  assert.deepEqual(f.errors, []);
});
test('failed auxiliary reads preserve the setup page and offer retry', async () => {
  const f = fixture();
  const running = f.render(false);
  f.pending[0].reject(Error('signals unavailable'));
  await running;
  assert.equal(f.painted.length, 1);
  assert.match(f.errors[0], /signals unavailable/);
  assert.match(f.errors[0], /data-notification-refresh/);
});
test('workspace change renders new workspace channels before its network reads finish', async () => {
  const f = fixture();
  const first = f.render(false);
  f.state.workspaceId = 'b';
  f.state.destinations = [{id: 'channel-b'}];
  const second = f.render(false);
  assert.equal(f.painted.length, 2);
  assert.equal((f.painted[1] as {channels: {items: {id: string}[]}}).channels.items[0].id, 'channel-b');
  f.pending.forEach((p, i) => p.resolve(i % 4 === 1 ? {items: [], available: {}} : []));
  await Promise.all([first, second]);
  assert.equal(vm.runInContext('notificationWorkspace', f.context), 'b');
});
