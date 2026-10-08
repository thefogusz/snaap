"use strict";
const freshnessLabels = {
  CURRENT: (globalThis.SnaapI18n?.text("ทันล่าสุด") ?? "ทันล่าสุด"),
  DELAYED: (globalThis.SnaapI18n?.text("ข้อมูลล่าช้า") ?? "ข้อมูลล่าช้า"),
  RECOVERING: (globalThis.SnaapI18n?.text("กำลังกู้คืนข้อมูล") ?? "กำลังกู้คืนข้อมูล"),
  INSUFFICIENT: (globalThis.SnaapI18n?.text("ข้อมูลไม่ครบ") ?? "ข้อมูลไม่ครบ"),
  READY: (globalThis.SnaapI18n?.text("ทันล่าสุด") ?? "ทันล่าสุด"),
  DATA_UNAVAILABLE: (globalThis.SnaapI18n?.text("เชื่อมต่อไม่ได้") ?? "เชื่อมต่อไม่ได้"),
};
const insightTime = (t) =>
  t ? new Date(t).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH")) : (globalThis.SnaapI18n?.text("ยังไม่มีแท่งปิด") ?? "ยังไม่มีแท่งปิด");
function explanationsUI(lines = []) {
  return lines
    .map(
      (e) =>
        `<p class="insight-evidence"><strong>${{ TRUE: (globalThis.SnaapI18n?.text("ผ่าน") ?? "ผ่าน"), FALSE: (globalThis.SnaapI18n?.text("ยังไม่ผ่าน") ?? "ยังไม่ผ่าน"), UNKNOWN: (globalThis.SnaapI18n?.text("ข้อมูลไม่พอ") ?? "ข้อมูลไม่พอ") }[e.result] ?? (globalThis.SnaapI18n?.text("รอ") ?? "รอ")}</strong> · ${esc(e.text.replace(/ · (?:ยังไม่ผ่าน|ข้อมูลไม่พอ)(?= \(|$)/, ""))}</p>`,
    )
    .join("");
}
function progressUI(p) {
  if (!p) return "";
  const phase =
    {
      ACTIVE: (globalThis.SnaapI18n?.text("เกิดสัญญาณเข้าแล้ว · รอเงื่อนไขออก") ?? "เกิดสัญญาณเข้าแล้ว · รอเงื่อนไขออก"),
      WAITING_ENTRY: p.label ?? (globalThis.SnaapI18n?.text("รอเงื่อนไขเริ่มต้น") ?? "รอเงื่อนไขเริ่มต้น"),
      WAITING_RESET: (globalThis.SnaapI18n?.text("รอเงื่อนไขเริ่มต้นไม่ผ่านก่อนเริ่มรอบใหม่") ?? "รอเงื่อนไขเริ่มต้นไม่ผ่านก่อนเริ่มรอบใหม่"),
      COOLDOWN: (globalThis.SnaapI18n?.text("อยู่ในช่วงพักสัญญาณ") ?? "อยู่ในช่วงพักสัญญาณ"),
      WAITING_STAGE: `${p.label ?? (globalThis.SnaapI18n?.text("รอยืนยัน") ?? "รอยืนยัน")}${(globalThis.SnaapI18n?.text(" · ขั้น ") ?? " · ขั้น ")}${p.stage + 1}/${p.totalStages}${(globalThis.SnaapI18n?.text(" · เหลือ ") ?? " · เหลือ ")}${p.remainingBars}${(globalThis.SnaapI18n?.text(" แท่ง · ตรวจอีกครั้งเมื่อแท่งใหม่ปิด") ?? " แท่ง · ตรวจอีกครั้งเมื่อแท่งใหม่ปิด")}`,
    }[p.phase] ?? (globalThis.SnaapI18n?.text("รอข้อมูล") ?? "รอข้อมูล");
  return `<p class="insight-progress">${esc(phase)}${p.deadline ? `${(globalThis.SnaapI18n?.text(" · หมดเขต ") ?? " · หมดเขต ")}${esc(insightTime(p.deadline))}` : ""}</p>`;
}
function freshnessUI(items = []) {
  return items.length
    ? `<div class="insight-freshness" role="status">${items.map((f) => `<p><strong>${esc(f.frame)} · ${esc(freshnessLabels[f.status] ?? f.status)}${(globalThis.SnaapI18n?.text("</strong><br><small>แท่งล่าสุด ") ?? "</strong><br><small>แท่งล่าสุด ")}${esc(insightTime(f.latestClose))}${(globalThis.SnaapI18n?.text(" · ควรมีถึง ") ?? " · ควรมีถึง ")}${esc(insightTime(f.expectedClose))}${(globalThis.SnaapI18n?.text(" · ตรวจ ") ?? " · ตรวจ ")}${esc(insightTime(f.checkedAt))}</small></p>`).join("")}</div>`
    : "";
}
function timeframeUI(rows = [], { showConditions = true } = {}) {
  return rows.length
    ? `<div class="insight-table-wrap"><table class="insight-table"><caption>${showConditions ? (globalThis.SnaapI18n?.text("เงื่อนไขที่กำลังรอ แยกกรอบเวลา") ?? "เงื่อนไขที่กำลังรอ แยกกรอบเวลา") : (globalThis.SnaapI18n?.text("แท่งปิดที่ใช้ประเมิน") ?? "แท่งปิดที่ใช้ประเมิน")}${(globalThis.SnaapI18n?.text("</caption><thead><tr><th>กรอบเวลา</th><th>แท่งปิดที่ใช้</th>") ?? "</caption><thead><tr><th>กรอบเวลา</th><th>แท่งปิดที่ใช้</th>")}${showConditions ? (globalThis.SnaapI18n?.text("<th>ผลเงื่อนไข</th>") ?? "<th>ผลเงื่อนไข</th>") : ""}</tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.frame)}</th><td>${esc(insightTime(r.latestClose))}</td>${showConditions ? `<td>${r.conditions?.length ? explanationsUI(r.conditions) : (globalThis.SnaapI18n?.text("ไม่มีเงื่อนไขในขั้นนี้") ?? "ไม่มีเงื่อนไขในขั้นนี้")}</td>` : ""}</tr>`).join("")}</tbody></table></div>`
    : "";
}
