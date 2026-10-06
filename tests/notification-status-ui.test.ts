import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/notifications.js', import.meta.url), 'utf8');
const insights = await readFile(new URL('../dist/signal-insights.js', import.meta.url), 'utf8');
const context = vm.createContext({
  Date, document: { querySelector: () => ({}), addEventListener() {} }, window: { addEventListener() {} }, signalDirection: () => 'Long',
  state: { rules: [{ id: 'setup', spec: { name: 'EMA trend' } }] },
  esc: (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)),
  uiIcon: () => '<svg></svg>', channelInfo: {}, deliveryLabels: { SENT: 'ส่งแล้ว', FAILED: 'ส่งไม่สำเร็จ' },
});
vm.runInContext(insights, context);
vm.runInContext(await readFile(new URL('../dist/notification-overview.js', import.meta.url), 'utf8'), context);
vm.runInContext(source, context);

test('monitor cards summarize progress and keep full evidence in closed details', () => {
  const html = context.marketActivity({ rule_id: 'setup', setup_name: 'EMA trend', pair: 'XRP/USDT', exchange: 'MEXC', status: 'CURRENT', checked_at: '2026-10-05T13:45:28Z',
    freshness: [{ frame: '5m', status: 'CURRENT', latestClose: 1791207900000 }],
    progress: [{ side: 'LONG', phase: 'WAITING_ENTRY', explanations: [{ result: 'FALSE', text: 'ผ่าน 4/10 ข้อ' }, { result: 'TRUE', text: 'ราคา > EMA 12' }] }],
  });
  assert.match(html, /EMA trend/);
  assert.match(html, /ผ่าน 4\/10 ข้อ/);
  assert.match(html, /<details class="overview-market-details">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.ok(html.indexOf('ราคา &gt; EMA 12') > html.indexOf('<details'));
  assert.match(html, /5m · ทันล่าสุด/);
});
test('overview separates paused tracking from items that need attention', () => {
  const html = context.notificationActivity([{ status: 'CURRENT' }, { status: 'DELAYED' }, { status: 'PAUSED' }], [{ status: 'SENT' }, { status: 'FAILED' }]);
  assert.match(html, /3 รายการ/);
  assert.match(html, /overview-filter-count">2/);
  assert.match(html, /ส่งแล้ว 1/); assert.match(html, /พัก 1/);
});
test('delivery history removes redundant success copy and preserves escaped failure details', () => {
  const sent = context.deliveryActivity({ name: 'SignalGus', status: 'SENT', detail: 'ผู้ให้บริการรับคำขอแล้ว · ไม่ใช่การยืนยันว่าอ่านแล้ว' });
  assert.doesNotMatch(sent, /อ่านแล้ว|รับคำขอ/);
  assert.match(sent, /ส่งแล้ว/);
  const failed = context.deliveryActivity({ name: '<script>', status: 'FAILED', detail: '<img onerror=x>' });
  assert.match(failed, /&lt;img onerror=x&gt;/);
  assert.doesNotMatch(failed, /<script>|<img/);
});
test('missing monitor details and invalid timestamps still render a usable card', () => {
  const html = context.marketActivity({ pair: 'BTC/USDT', exchange: 'MEXC', status: 'PAUSED', checked_at: null });
  assert.match(html, /พักการติดตาม/);
  assert.match(html, /ยังไม่ได้ตรวจ/);
  assert.doesNotMatch(html, /Invalid Date|<details/);
});
