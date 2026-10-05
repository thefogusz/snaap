"use strict";
const freshnessLabels = {
  CURRENT: "ทันล่าสุด",
  DELAYED: "ข้อมูลล่าช้า",
  RECOVERING: "กำลังกู้คืนข้อมูล",
  INSUFFICIENT: "ข้อมูลไม่ครบ",
  READY: "ทันล่าสุด",
  DATA_UNAVAILABLE: "เชื่อมต่อไม่ได้",
};
const insightNumber = (n) =>
  Number(n).toLocaleString("th-TH", { maximumFractionDigits: 6 });
const insightTime = (t) =>
  t ? new Date(t).toLocaleString("th-TH") : "ยังไม่มีแท่งปิด";
function explanationsUI(lines = []) {
  return lines
    .map(
      (e) =>
        `<p class="insight-evidence"><strong>${{ TRUE: "ผ่าน", FALSE: "ยังไม่ผ่าน", UNKNOWN: "ข้อมูลไม่พอ" }[e.result] ?? "รอ"}</strong> · ${esc(e.text)}</p>`,
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
function timeframeUI(rows = []) {
  return rows.length
    ? `<div class="insight-table-wrap"><table class="insight-table"><caption>เงื่อนไขที่กำลังรอ แยกกรอบเวลา</caption><thead><tr><th>กรอบเวลา</th><th>แท่งปิดที่ใช้</th><th>ผลเงื่อนไข</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.frame)}</th><td>${esc(insightTime(r.latestClose))}</td><td>${r.conditions?.length ? explanationsUI(r.conditions) : "ไม่มีเงื่อนไขในขั้นนี้"}</td></tr>`).join("")}</tbody></table></div>`
    : "";
}
function signalOutcomeUI(row) {
  const r = row.risk_snapshot,
    o = row.outcome;
  if (!r && !o) return "";
  const risk = !r
    ? "ไม่ได้เปิดแผน ATR"
    : r.status === "READY"
      ? `ATR ${insightNumber(r.atr)} · SL ${insightNumber(r.stopLoss)} · TP ${insightNumber(r.takeProfit)} · ผลตอบแทนต่อความเสี่ยง ${insightNumber(r.config.rewardRisk)}:1`
      : `แผน ATR: ${esc(r.reason ?? "ข้อมูลไม่พอ")}`;
  return `<details class="signal-outcome"><summary>แผน ATR และผลหลังสัญญาณ${o ? " · " + ({ PENDING: "กำลังติดตาม", COMPLETE: "ครบช่วงแล้ว", INCOMPLETE: "ข้อมูลไม่ครบ" }[o.status] ?? "") : ""}</summary><p>${risk}</p>${r ? `<small>ตรึงที่ราคาอ้างอิง ${insightNumber(r.referencePrice)} · เวอร์ชัน ${Number(row.revision)}</small>` : ""}${o ? `<p>ติดตาม ${o.observedBars}/${o.horizon} แท่ง · ไปตามทิศสูงสุด ${Number(o.favorablePct).toFixed(2)}% · สวนทางสูงสุด ${Number(o.adversePct).toFixed(2)}%</p><p>${o.riskAvailable ? "แตะระดับก่อน: " + ({ NONE: "ยังไม่แตะ", SL: "SL", TP: "TP", AMBIGUOUS: "ไม่ทราบลำดับ — แตะทั้งสองในแท่งเดียว", UNKNOWN: "ไม่ทราบลำดับ — ข้อมูลขาด" }[o.firstTouch] ?? "ไม่ทราบ") : "ไม่มีระดับ SL/TP สำหรับวัดผล"}</p>` : ""}<small>วัดจากแท่งปิดหลังสัญญาณ ไม่ใช่กำไรจากการเทรดจริง</small></details>`;
}
document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-risk-plan]");
  if (!trigger) return;
  const rule = state.rules.find((r) => r.id === trigger.dataset.riskPlan);
  if (!rule) return;
  const workspace = state.workspaceId,
    config = rule.risk_plan ?? {
      enabled: false,
      atrPeriod: 14,
      stopAtr: 1.5,
      rewardRisk: 2,
    };
  const dialog = setupCodeDialog("แผน SL/TP จาก ATR"),
    content = dialog.querySelector(".setup-files-content");
  content.innerHTML = `<form class="risk-plan-form"><p>${esc(rule.spec.name)} · เวอร์ชัน ${rule.revision}</p><label class="risk-enabled"><input name="enabled" type="checkbox" ${config.enabled ? "checked" : ""}>แสดงแผนและวัดผลเมื่อมีสัญญาณเข้า</label><label>ATR ย้อนหลัง (แท่ง)<input name="atrPeriod" type="number" min="2" max="100" step="1" value="${config.atrPeriod}" required></label><label>ระยะ SL (เท่าของ ATR)<input name="stopAtr" type="number" min="0.1" max="20" step="any" value="${config.stopAtr}" required></label><label>เป้ากำไร (เท่าของระยะ SL)<input name="rewardRisk" type="number" min="0.1" max="20" step="any" value="${config.rewardRisk}" required></label><p>ใช้ราคาแท่งปิดตอนเข้า ตรึงระดับไว้ ไม่ส่งคำสั่งซื้อขายหรือแจ้งเตือน SL/TP</p><p>บันทึกเป็นเวอร์ชันใหม่และพักเซตอัป เปิดติดตามอีกครั้งจากหน้าเซตอัป</p><p role="alert" data-risk-error></p><button class="primary" type="submit">บันทึกแผน</button></form>`;
  const form = content.querySelector("form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      if (workspace !== state.workspaceId)
        throw Error("เวิร์กสเปซเปลี่ยนแล้ว กรุณาเปิดแผนใหม่");
      const fields = new FormData(form),
        riskPlan = {
          enabled: fields.has("enabled"),
          atrPeriod: Number(fields.get("atrPeriod")),
          stopAtr: Number(fields.get("stopAtr")),
          rewardRisk: Number(fields.get("rewardRisk")),
        };
      const saved = await api(`/rules/${rule.id}/risk-plan`, "PUT", {
        expectedRevision: rule.revision,
        riskPlan,
      });
      if (workspace !== state.workspaceId) {
        dialog.close();
        return;
      }
      if (state.saved?.id === saved.id) {
        state.saved = saved;
        renderDesigner();
      }
      await refresh();
      dialog.close();
      toast("บันทึกแผนแล้ว · เซตอัปพักอยู่");
    } catch (error) {
      form.querySelector("[data-risk-error]").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  dialog.addEventListener(
    "close",
    () => trigger.isConnected && trigger.focus(),
    { once: true },
  );
});
