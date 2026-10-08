import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/asset-picker.js', import.meta.url), 'utf8');
const start = source.indexOf('    function paint() {');
const end = source.indexOf('    async function load(', start);
assert.ok(start >= 0 && end > start);

function tabs(category: string, market = 'Spot') {
  const list = { innerHTML: '' };
  const buttons = ['crypto', 'stocks', 'forex', 'metals', 'commodities', 'indices', 'other'].map(category => ({ dataset: { category }, hidden: false, setAttribute() {} }));
  const sandbox = vm.createContext({
    category, market, selectedOnly: false, catalog: { items: [], sources: [] },
    selected: new Map(), search: { value: '' }, loading: false, limit: 50,
    query: () => ({ setAttribute() {} }), dialog: { querySelectorAll: (selector: string) => selector === '[data-category]' ? buttons : [] },
    status: {}, list, selectionState() {},
  });
  vm.runInContext(source.slice(start, end) + ';paint();', sandbox);
  return { buttons, category: sandbox.category, html: list.innerHTML };
}

test('Spot hides Forex and indices while preserving the other category tabs', () => {
  const result = tabs('crypto');
  assert.deepEqual(result.buttons.filter(button => button.hidden).map(button => button.dataset.category), ['forex', 'indices']);
  assert.doesNotMatch(result.html, /data-market=/);
});

test('Perpetual shows all tabs; returning to Spot resets a hidden active category', () => {
  for (const category of ['forex', 'indices']) {
    const result = tabs(category, 'Perpetual Futures');
    assert.equal(result.buttons.some(button => button.hidden), false);
    assert.equal(result.category, category);
    assert.equal(tabs(category).category, 'crypto');
  }
});
