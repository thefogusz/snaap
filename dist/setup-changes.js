// Shared by the harness and the UI. Changes come from values, never model prose.
export function diffSetup(before, after) {
  const changes = [];
  const labels = { name: (globalThis.SnaapI18n?.text("ชื่อเซ็ตอัพ") ?? "ชื่อเซ็ตอัพ"), exchange: (globalThis.SnaapI18n?.text("กระดาน") ?? "กระดาน"), market: (globalThis.SnaapI18n?.text("ตลาด") ?? "ตลาด"), side:(globalThis.SnaapI18n?.text("ฝั่ง") ?? "ฝั่ง"), mirrorShort:(globalThis.SnaapI18n?.text("สลับเงื่อนไข Short") ?? "สลับเงื่อนไข Short"), short:(globalThis.SnaapI18n?.text("เงื่อนไข Short") ?? "เงื่อนไข Short"), pairs: (globalThis.SnaapI18n?.text("คู่เทรด") ?? "คู่เทรด"), timeframe: (globalThis.SnaapI18n?.text("กรอบเวลา") ?? "กรอบเวลา"), entry: (globalThis.SnaapI18n?.text("เงื่อนไขเข้า") ?? "เงื่อนไขเข้า"), exit: (globalThis.SnaapI18n?.text("เงื่อนไขออก") ?? "เงื่อนไขออก"), cancel: (globalThis.SnaapI18n?.text("เงื่อนไขยกเลิก") ?? "เงื่อนไขยกเลิก"), stages: (globalThis.SnaapI18n?.text("ขั้นตอนรอยืนยัน") ?? "ขั้นตอนรอยืนยัน"), cooldownBars: (globalThis.SnaapI18n?.text("พักสัญญาณ (แท่ง)") ?? "พักสัญญาณ (แท่ง)"), destinations: (globalThis.SnaapI18n?.text("ช่องทางแจ้งเตือน") ?? "ช่องทางแจ้งเตือน"), condition: (globalThis.SnaapI18n?.text("เงื่อนไข") ?? "เงื่อนไข"), withinBars: (globalThis.SnaapI18n?.text("เวลารอ (แท่ง)") ?? "เวลารอ (แท่ง)"), left: (globalThis.SnaapI18n?.text("ค่าที่ตรวจ") ?? "ค่าที่ตรวจ"), right: (globalThis.SnaapI18n?.text("ค่าที่เปรียบเทียบ") ?? "ค่าที่เปรียบเทียบ"), op: (globalThis.SnaapI18n?.text("ตัวเปรียบเทียบ") ?? "ตัวเปรียบเทียบ"), children: (globalThis.SnaapI18n?.text("เงื่อนไขย่อย") ?? "เงื่อนไขย่อย"), bars: (globalThis.SnaapI18n?.text("ต่อเนื่อง (แท่ง)") ?? "ต่อเนื่อง (แท่ง)"), source: (globalThis.SnaapI18n?.text("แหล่งราคา") ?? "แหล่งราคา"), field: (globalThis.SnaapI18n?.text("ค่าราคา") ?? "ค่าราคา"), period: (globalThis.SnaapI18n?.text("ระยะ") ?? "ระยะ"), slow: (globalThis.SnaapI18n?.text("ระยะช้า") ?? "ระยะช้า"), signal: (globalThis.SnaapI18n?.text("ระยะสัญญาณ") ?? "ระยะสัญญาณ"), deviation: (globalThis.SnaapI18n?.text("ส่วนเบี่ยงเบน") ?? "ส่วนเบี่ยงเบน"), value: (globalThis.SnaapI18n?.text("ค่า") ?? "ค่า"), formula: (globalThis.SnaapI18n?.text("สูตร") ?? "สูตร"), kind: (globalThis.SnaapI18n?.text("ชนิดค่า") ?? "ชนิดค่า") };
  const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
  };
  function walk(a, b, path, label) {
    if (same(a, b)) return;
    const atomic = ['exchange', 'pairs', 'targets', 'destinations', 'formula'].includes(path.split('.').at(-1));
    if (!atomic && a != null && b != null && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && a.kind === b.kind) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const part = /^\d+$/.test(k) ? `${(globalThis.SnaapI18n?.text("ข้อ ") ?? "ข้อ ")}${Number(k) + 1}` : (k === 'name' && (a.kind === 'INDICATOR' || b.kind === 'INDICATOR') ? (globalThis.SnaapI18n?.text("อินดิเคเตอร์") ?? "อินดิเคเตอร์") : (labels[k] ?? k));
        walk(a[k], b[k], `${path}.${k}`, `${label} · ${part}`);
      }
      return;
    }
    changes.push({ path, label, action: a === undefined ? 'add' : b === undefined ? 'remove' : 'change', ...(a === undefined ? {} : { before: a }), ...(b === undefined ? {} : { after: b }) });
  }
  labels.entryMatchPercent = (globalThis.SnaapI18n?.text("ต้องผ่านเงื่อนไขอย่างน้อย (%)") ?? "ต้องผ่านเงื่อนไขอย่างน้อย (%)");
  labels.targets = (globalThis.SnaapI18n?.text("แหล่งข้อมูลแต่ละคู่") ?? "แหล่งข้อมูลแต่ละคู่");
  for (const key of ['name','exchange','market','side','mirrorShort','short','pairs','targets','timeframe','entry','entryMatchPercent','exit','cancel','stages','cooldownBars','destinations']) {
    walk(before?.[key], after?.[key], key, labels[key]);
  }
  return changes;
}

export function describeSetupValue(value) {
  if (value === undefined) return (globalThis.SnaapI18n?.text("ไม่มี") ?? "ไม่มี");
  if (Array.isArray(value)) return value.length ? value.map(describeSetupValue).join(', ') : (globalThis.SnaapI18n?.text("ไม่มี") ?? "ไม่มี");
  if (value && typeof value === 'object') {
    if (value.kind === 'CONSTANT') return String(value.value);
    if (value.kind === 'PRICE') return `${{open:(globalThis.SnaapI18n?.text("ราคาเปิด") ?? "ราคาเปิด"),high:(globalThis.SnaapI18n?.text("ราคาสูงสุด") ?? "ราคาสูงสุด"),low:(globalThis.SnaapI18n?.text("ราคาต่ำสุด") ?? "ราคาต่ำสุด"),close:(globalThis.SnaapI18n?.text("ราคาปิด") ?? "ราคาปิด"),volume:(globalThis.SnaapI18n?.text("วอลุ่ม") ?? "วอลุ่ม")}[value.field] ?? value.field} (${value.timeframe})`;
    if (value.kind === 'INDICATOR') return `${value.name} ${value.period} (${value.timeframe}${value.source ? ', ' + value.source : ''})${value.formula ? ' · ' + JSON.stringify(value.formula) : ''}`;
    if (value.kind === 'ENTRY_RETURN') return (globalThis.SnaapI18n?.text("ระยะจากราคาสัญญาณเข้า") ?? "ระยะจากราคาสัญญาณเข้า");
    if (value.kind === 'COMPARE') return `${describeSetupValue(value.left)} ${{CROSS_ABOVE:(globalThis.SnaapI18n?.text("ตัดขึ้นเหนือ") ?? "ตัดขึ้นเหนือ"),CROSS_BELOW:(globalThis.SnaapI18n?.text("ตัดลงใต้") ?? "ตัดลงใต้")}[value.op] ?? value.op} ${describeSetupValue(value.right)}`;
    if (value.kind === 'GROUP') return value.children.map(describeSetupValue).join(value.op === 'AND' ? (globalThis.SnaapI18n?.text(" และ ") ?? " และ ") : (globalThis.SnaapI18n?.text(" หรือ ") ?? " หรือ "));
    if (value.kind === 'HOLD') return `${describeSetupValue(value.condition)}${(globalThis.SnaapI18n?.text(" ต่อเนื่อง ") ?? " ต่อเนื่อง ")}${value.bars}${(globalThis.SnaapI18n?.text(" แท่ง") ?? " แท่ง")}`;
    if (value.condition) return `${describeSetupValue(value.condition)}${(globalThis.SnaapI18n?.text(" ภายใน ") ?? " ภายใน ")}${value.withinBars}${(globalThis.SnaapI18n?.text(" แท่ง") ?? " แท่ง")}`;
    return JSON.stringify(value);
  }
  if(typeof value==='boolean')return value?(globalThis.SnaapI18n?.text("เปิด") ?? "เปิด"):(globalThis.SnaapI18n?.text("ปิด") ?? "ปิด");
  return {LONG:(globalThis.SnaapI18n?.text("Long (ซื้อ)") ?? "Long (ซื้อ)"),SHORT:(globalThis.SnaapI18n?.text("Short (ขาย)") ?? "Short (ขาย)"),BOTH:'Long + Short',SPOT:(globalThis.SnaapI18n?.text("Spot (ซื้อ)") ?? "Spot (ซื้อ)")}[value] ?? String(value);
}
