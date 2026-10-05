import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const insights = await readFile(new URL('../dist/signal-insights.js', import.meta.url), 'utf8');
const workbench = await readFile(new URL('../dist/workbench.js', import.meta.url), 'utf8');
const context = vm.createContext({
  esc: (value: string) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
  directionLabel: (side: string) => side,
});
vm.runInContext(insights + workbench.slice(workbench.indexOf('function evidenceUI('), workbench.indexOf('panel.addEventListener("input",', workbench.indexOf('function evidenceUI('))), context);
const condition = { result: 'FALSE', text: 'ราคาปิด (15m) = 85,617.4 · ต้องมากกว่า CHANDELIER_SHORT 22 (15m) = 85,633.5 · ยังไม่ผ่าน' };
const branch = {
  side: 'SPOT', time: 1791225900000, progress: { phase: 'WAITING_ENTRY' },
  explanations: { entry: [condition], stages: [[{ result: 'UNKNOWN', text: 'RSI (1h) · ข้อมูลไม่พอ (warmup)' }]], exit: [], cancel: [{ result: 'FALSE', text: 'เงื่อนไขยกเลิกตัวอย่าง · ยังไม่ผ่าน' }] },
  timeframes: [{ frame: '15m', latestClose: 1791225900000, conditions: [condition] }, { frame: '1h', latestClose: 1791223200000, conditions: [condition] }],
};

test('chart details show each condition once and retain closed candles for every timeframe', () => {
  const html = context.barEvidence({ time: branch.time, branches: [branch] }, { showProgress: false });
  assert.equal(html.match(/CHANDELIER_SHORT/g)?.length, 1);
  assert.doesNotMatch(html, /รอเงื่อนไขเริ่มต้น|ผลเงื่อนไข/);
  assert.match(html, /แท่งปิดที่ใช้ประเมิน/);
  assert.match(html, /15m/);
  assert.match(html, /1h/);
  assert.match(html, /RSI/);
  assert.match(html, /warmup/);
  assert.match(html, /เงื่อนไขยกเลิกตัวอย่าง/);
});

test('selected candle and replay details retain their own progress', () => {
  assert.match(context.barEvidence(branch), /รอเงื่อนไขเริ่มต้น/);
});

test('condition status is displayed once, while reasons and escaped text survive', () => {
  const html = context.explanationsUI([condition, { result: 'UNKNOWN', text: '<RSI> · ข้อมูลไม่พอ (warmup)' }]);
  assert.equal(html.match(/ยังไม่ผ่าน/g)?.length, 1);
  assert.equal(html.match(/ข้อมูลไม่พอ/g)?.length, 1);
  assert.match(html, /&lt;RSI>/);
  assert.match(html, /warmup/);
});
