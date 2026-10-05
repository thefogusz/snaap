"use strict";
const freshnessLabels = {
  CURRENT: "ทันล่าสุด",
  DELAYED: "ข้อมูลล่าช้า",
  RECOVERING: "กำลังกู้คืนข้อมูล",
  INSUFFICIENT: "ข้อมูลไม่ครบ",
  READY: "ทันล่าสุด",
  DATA_UNAVAILABLE: "เชื่อมต่อไม่ได้",
};
const insightTime = (t) =>
  t ? new Date(t).toLocaleString("th-TH") : "ยังไม่มีแท่งปิด";
function explanationsUI(lines = []) {
  return lines
    .map(
      (e) =>
        `<p class="insight-evidence"><strong>${{ TRUE: "ผ่าน", FALSE: "ยังไม่ผ่าน", UNKNOWN: "ข้อมูลไม่พอ" }[e.result] ?? "รอ"}</strong> · ${esc(e.text.replace(/ · (?:ยังไม่ผ่าน|ข้อมูลไม่พอ)(?= \(|$)/, ""))}</p>`,
    )
    .join("");
}
function progressUI(p) {
  if (!p) return "";
  const phase =
    {
      ACTIVE: "เกิดสัญญาณเข้าแล้ว · รอเงื่อนไขออก",
      WAITING_ENTRY: p.label ?? "รอเงื่อนไขเริ่มต้น",
      WAITING_RESET: "รอเงื่อนไขเริ่มต้นไม่ผ่านก่อนเริ่มรอบใหม่",
      COOLDOWN: "อยู่ในช่วงพักสัญญาณ",
      WAITING_STAGE: `${p.label ?? "รอยืนยัน"} · ขั้น ${p.stage + 1}/${p.totalStages} · เหลือ ${p.remainingBars} แท่ง · ตรวจอีกครั้งเมื่อแท่งใหม่ปิด`,
    }[p.phase] ?? "รอข้อมูล";
  return `<p class="insight-progress">${esc(phase)}${p.deadline ? ` · หมดเขต ${esc(insightTime(p.deadline))}` : ""}</p>`;
}
function freshnessUI(items = []) {
  return items.length
    ? `<div class="insight-freshness" role="status">${items.map((f) => `<p><strong>${esc(f.frame)} · ${esc(freshnessLabels[f.status] ?? f.status)}</strong><br><small>แท่งล่าสุด ${esc(insightTime(f.latestClose))} · ควรมีถึง ${esc(insightTime(f.expectedClose))} · ตรวจ ${esc(insightTime(f.checkedAt))}</small></p>`).join("")}</div>`
    : "";
}
function timeframeUI(rows = [], { showConditions = true } = {}) {
  return rows.length
    ? `<div class="insight-table-wrap"><table class="insight-table"><caption>${showConditions ? "เงื่อนไขที่กำลังรอ แยกกรอบเวลา" : "แท่งปิดที่ใช้ประเมิน"}</caption><thead><tr><th>กรอบเวลา</th><th>แท่งปิดที่ใช้</th>${showConditions ? "<th>ผลเงื่อนไข</th>" : ""}</tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.frame)}</th><td>${esc(insightTime(r.latestClose))}</td>${showConditions ? `<td>${r.conditions?.length ? explanationsUI(r.conditions) : "ไม่มีเงื่อนไขในขั้นนี้"}</td>` : ""}</tr>`).join("")}</tbody></table></div>`
    : "";
}
