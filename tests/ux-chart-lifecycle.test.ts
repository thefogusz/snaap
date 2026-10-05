import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/studio.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('  async function update('), source.indexOf('  document.addEventListener("setup-rendered", schedule);'));

function fixture() {
  const draft = { exchange: ['Binance'], pairs: ['BTC/USDT'], timeframe: '15m', market: 'Spot' };
  const pending: Array<(value: unknown) => void> = [];
  const rendered: unknown[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const element = { textContent: '', innerHTML: '', value: '', hidden: false, disabled: false, style: { opacity: '' } };
  const context = vm.createContext({
    state: { draft }, workbench: { hidden: false, dataset: { tab: 'split' } },
    studio: { querySelector: () => element, querySelectorAll: () => [element] },
    chartPicker: { ...element }, chartPickerWrap: { ...element }, canvas: { ...element }, status: element,
    chartFrame: null, window: {SnaapStudio: {chartIndicators: () => []}}, hasEntryCondition: () => true,
    conditionFrames: (draft: {timeframe: string}) => [draft.timeframe],
    framePicker: { dataset: {}, innerHTML: '', querySelectorAll: () => [] },
    esc: String, directionLabel: () => 'Spot', stop: () => {},
    api: () => new Promise(resolve => pending.push(resolve)),
    render: (data: unknown) => { rendered.push(data); context.result = data; },
    setTimeout: (callback: () => void) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    key: '', pendingKey: '', generation: 0, chartPair: null, result: null, timer: null,
  });
  vm.runInContext(functions + ';globalThis.updateChart=update;globalThis.scheduleChart=schedule;', context);
  return { context, pending, rendered, timers, flush: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); } };
}

test('chart tab reveal and identical setup renders share an in-flight preview', async () => {
  const f = fixture();
  const first = f.context.updateChart();
  f.context.scheduleChart();
  await f.context.updateChart();
  assert.equal(f.pending.length, 1);
  assert.equal(f.timers.size, 0);
  f.pending[0]({ candles: [1] });
  await first;
  assert.equal(f.rendered.length, 1);
  await f.context.updateChart();
  assert.equal(f.pending.length, 1);
});

test('a draft edit during preview discards stale data and automatically draws the replacement', async () => {
  const f = fixture();
  const first = f.context.updateChart();
  f.context.state.draft.timeframe = '5m';
  f.context.scheduleChart();
  f.flush();
  assert.equal(f.pending.length, 2);
  f.pending[0]({ id: 'stale' });
  await first;
  assert.equal(f.rendered.length, 0);
  f.pending[1]({ id: 'latest' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.rendered, [{ id: 'latest' }]);
  await f.context.updateChart();
  assert.equal(f.pending.length, 2);
});

test('a preview requested while chat is visible starts automatically when split opens', async () => {
  const f = fixture();
  f.context.workbench.dataset.tab = 'chat';
  await f.context.updateChart();
  assert.equal(f.pending.length, 0);
  f.context.workbench.dataset.tab = 'split';
  const next = f.context.updateChart();
  assert.equal(f.pending.length, 1);
  f.pending[0]({ id: 'opened' });
  await next;
  assert.equal(f.rendered.length, 1);
});

test('startup setup events without a draft do not throw or request a preview', async () => {
  const f = fixture();
  f.context.state.draft = null;
  f.context.scheduleChart();
  await f.context.updateChart();
  assert.equal(f.pending.length, 0);
});
