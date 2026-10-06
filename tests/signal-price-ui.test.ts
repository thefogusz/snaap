import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const listeners: Record<string, Function> = {};
let copied = '';
const context = vm.createContext({
  document: { querySelector: () => ({}), addEventListener: (name: string, fn: Function) => { listeners[name] = fn; } },
  window: { addEventListener() {} },
  navigator: { clipboard: { writeText: async (text: string) => { copied = text; } } },
  state: { rules: [] }, signalDirection: () => 'Short', uiIcon: () => '',
  toast() {},
  esc: (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)),
});
vm.runInContext(await readFile(new URL('../dist/notifications.js', import.meta.url), 'utf8'), context);

function card(price: unknown) {
  return context.signalCard({ pair: 'PEPE/USDT', exchange: 'MEXC', setup_side: 'SHORT',
    event: { kind: 'ENTRY', time: 1791304500000, referencePrice: price }, signal_valid_until: 1791304800000 });
}

test('tiny signal prices compress leading zeros and expose the full decimal price', () => {
  for (const [price, compact, full] of [
    [0.00000371, '0.0₅371', '0.00000371'],
    [0.00001234, '0.0₄1234', '0.00001234'],
    [1.23456789e-12, '0.0₁₁123456789', '0.00000000000123456789'],
  ]) {
    const html = card(price);
    assert.ok(html.includes(`>${compact}</strong>`), html);
    assert.ok(html.includes(`data-signal-price-copy="${full}"`));
    assert.ok(html.includes(`title="ราคาเต็ม ${full}`));
  }
});

test('ordinary and zero prices remain readable while missing or invalid prices use a dash', () => {
  for (const [price, label] of [[68420.5, '68,420.5'], [0.00012345, '0.00012345'], [1.23456789, '1.23456789'], [0, '0']])
    assert.ok(card(price).includes(`>${label}</strong>`));
  for (const price of [null, undefined, '', ' ', NaN, Infinity, -1, '<img>']) {
    const html = card(price);
    assert.ok(html.includes('>—</strong>'));
    assert.ok(!html.includes('data-signal-price-copy'));
  }
});

test('clicking a compact price copies its full value', async () => {
  const button = { dataset: { signalPriceCopy: '0.00000371' }, hasAttribute: (name: string) => name === 'data-signal-price-copy' };
  await listeners.click({ target: { closest: () => button } });
  assert.equal(copied, '0.00000371');
});
