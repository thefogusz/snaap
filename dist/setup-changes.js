// Shared by the harness and the UI. Changes come from values, never model prose.
export function diffSetup(before, after) {
  const changes = [];
  const labels = { name: 'ชื่อเซตอัป', exchange: 'กระดาน', market: 'ตลาด', side:'ฝั่ง', mirrorShort:'สลับเงื่อนไข Short', short:'เงื่อนไข Short', pairs: 'คู่เทรด', timeframe: 'กรอบเวลา', entry: 'เงื่อนไขเข้า', exit: 'เงื่อนไขออก', cancel: 'เงื่อนไขยกเลิก', stages: 'ขั้นตอนรอยืนยัน', cooldownBars: 'พักสัญญาณ (แท่ง)', destinations: 'ช่องทางแจ้งเตือน', condition: 'เงื่อนไข', withinBars: 'เวลารอ (แท่ง)', left: 'ค่าที่ตรวจ', right: 'ค่าที่เปรียบเทียบ', op: 'ตัวเปรียบเทียบ', children: 'เงื่อนไขย่อย', bars: 'ต่อเนื่อง (แท่ง)', source: 'แหล่งราคา', field: 'ค่าราคา', period: 'ระยะ', slow: 'ระยะช้า', signal: 'ระยะสัญญาณ', deviation: 'ส่วนเบี่ยงเบน', value: 'ค่า', formula: 'สูตร', kind: 'ชนิดค่า' };
  const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
  };
  function walk(a, b, path, label) {
    if (same(a, b)) return;
    const atomic = ['exchange', 'pairs', 'destinations', 'formula'].includes(path.split('.').at(-1));
    if (!atomic && a != null && b != null && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && a.kind === b.kind) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const part = /^\d+$/.test(k) ? `ข้อ ${Number(k) + 1}` : (k === 'name' && (a.kind === 'INDICATOR' || b.kind === 'INDICATOR') ? 'อินดิเคเตอร์' : (labels[k] ?? k));
        walk(a[k], b[k], `${path}.${k}`, `${label} · ${part}`);
      }
      return;
    }
    changes.push({ path, label, action: a === undefined ? 'add' : b === undefined ? 'remove' : 'change', ...(a === undefined ? {} : { before: a }), ...(b === undefined ? {} : { after: b }) });
  }
  for (const key of ['name','exchange','market','side','mirrorShort','short','pairs','timeframe','entry','exit','cancel','stages','cooldownBars','destinations']) {
    walk(before?.[key], after?.[key], key, labels[key]);
  }
  return changes;
}

export function describeSetupValue(value) {
  if (value === undefined) return 'ไม่มี';
  if (Array.isArray(value)) return value.length ? value.map(describeSetupValue).join(', ') : 'ไม่มี';
  if (value && typeof value === 'object') {
    if (value.kind === 'CONSTANT') return String(value.value);
    if (value.kind === 'PRICE') return `${{open:'ราคาเปิด',high:'ราคาสูงสุด',low:'ราคาต่ำสุด',close:'ราคาปิด',volume:'วอลุ่ม'}[value.field] ?? value.field} (${value.timeframe})`;
    if (value.kind === 'INDICATOR') return `${value.name} ${value.period} (${value.timeframe}${value.source ? ', ' + value.source : ''})${value.formula ? ' · ' + JSON.stringify(value.formula) : ''}`;
    if (value.kind === 'ENTRY_RETURN') return 'ระยะจากราคาสัญญาณเข้า';
    if (value.kind === 'COMPARE') return `${describeSetupValue(value.left)} ${{CROSS_ABOVE:'ตัดขึ้นเหนือ',CROSS_BELOW:'ตัดลงใต้'}[value.op] ?? value.op} ${describeSetupValue(value.right)}`;
    if (value.kind === 'GROUP') return value.children.map(describeSetupValue).join(value.op === 'AND' ? ' และ ' : ' หรือ ');
    if (value.kind === 'HOLD') return `${describeSetupValue(value.condition)} ต่อเนื่อง ${value.bars} แท่ง`;
    if (value.condition) return `${describeSetupValue(value.condition)} ภายใน ${value.withinBars} แท่ง`;
    return JSON.stringify(value);
  }
  if(typeof value==='boolean')return value?'เปิด':'ปิด';
  return {LONG:'Long (ซื้อ)',SHORT:'Short (ขาย)',BOTH:'Long + Short',SPOT:'Spot (ซื้อ)'}[value] ?? String(value);
}
