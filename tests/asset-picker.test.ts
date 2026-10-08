import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/asset-picker.js', import.meta.url), 'utf8');
const start = source.indexOf('    function paint() {');
const end = source.indexOf('    async function load(', start);
assert.ok(start >= 0 && end > start);

function emptyState(category: string, market = 'Spot', selectedOnly = false, items: unknown[] = [], term = '') {
  const list = { innerHTML: '' };
  const sandbox = vm.createContext({
    category, market, selectedOnly, catalog: { items, sources: [] },
    selected: new Map(), search: { value: term }, loading: false, limit: 50,
    query: () => ({ setAttribute() {} }), dialog: { querySelectorAll: () => [] },
    status: {}, list, selectionState() {},
  });
  vm.runInContext(source.slice(start, end) + ';paint();', sandbox);
  return list.innerHTML;
}

test('empty Spot Forex and index tabs explain Perpetual and offer an explicit market switch', () => {
  for (const category of ['forex', 'indices']) {
    const html = emptyState(category);
    assert.match(html, /data-market="Perpetual Futures"/);
    assert.match(html, /การเปลี่ยนตลาดจะล้างคู่ที่เลือกไว้/);
  }
});

test('Perpetual, selected-only, other categories and unmatched searches keep the normal empty state', () => {
  for (const html of [
    emptyState('forex', 'Perpetual Futures'),
    emptyState('indices', 'Spot', true),
    emptyState('crypto'),
    emptyState('forex', 'Spot', false, [{ category: 'forex', symbol: 'EUR/USD', name: '' }], 'GBP'),
  ]) {
    assert.doesNotMatch(html, /data-market=/);
    assert.match(html, /ไม่พบสินทรัพย์ในหมวดนี้/);
  }
});
