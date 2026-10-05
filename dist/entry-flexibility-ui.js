import { flexibilityCounts } from "./entry-flexibility.js";
export function flexibilitySummary(spec) {
  return `ต้องผ่านอย่างน้อย ${spec.entryMatchPercent ?? 100}%`;
}
export function mountFlexibility(
  root,
  { rules, api, canEdit, onSaved, onReload },
) {
  root.querySelectorAll("[data-flex-rule]").forEach((host) => {
    const rule = rules.find((row) => row.id === host.dataset.flexRule);
    const toggle = host.querySelector("[data-flex-toggle]"),
      panel = host.querySelector("[data-flex-panel]");
    let percent = rule.spec.entryMatchPercent ?? 100,
      busy = false;
    function update() {
      panel.querySelector("[data-flex-value]").textContent = percent + "%";
      const count = (entry) => {
        const { needed, total } = flexibilityCounts(entry, percent);
        return `${needed} จาก ${total} ข้อ`;
      };
      panel.querySelector("[data-flex-result]").textContent = rule.spec.short
        ? `แจ้งเมื่อ Long ผ่าน ${count(rule.spec.entry)} หรือ Short ผ่าน ${count(rule.spec.short.entry)}`
        : `แจ้งเมื่อผ่านอย่างน้อย ${count(rule.spec.entry)}`;
      panel
        .querySelectorAll("button,input")
        .forEach((control) => (control.disabled = busy));
      toggle.disabled = busy;
    }
    toggle.addEventListener("click", () => {
      if (!panel.hidden) {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        return;
      }
      if (!canEdit(rule)) return;
      percent = rule.spec.entryMatchPercent ?? 100;
      panel.innerHTML = `<label class="flex-percent-label">ต้องผ่านอย่างน้อย <output data-flex-value></output><input type="range" min="1" max="100" step="1" value="${percent}" data-flex-percent aria-label="ต้องผ่านเงื่อนไขอย่างน้อย (%)"><span class="flex-scale"><span>ผ่อนมาก</span><span>ครบทุกข้อ</span></span></label><div class="flex-footer"><p data-flex-result aria-live="polite"></p><div><button type="button" data-flex-cancel>ยกเลิก</button><button type="button" class="primary" data-flex-save>บันทึก</button></div></div><p class="flex-error" role="alert" hidden></p><button type="button" data-flex-reload hidden>โหลดค่าล่าสุด</button>`;
      update();
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
    });
    panel.addEventListener("input", (event) => {
      if (busy || !event.target.hasAttribute("data-flex-percent")) return;
      percent = Number(event.target.value);
      update();
    });
    panel.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button || busy) return;
      if (button.hasAttribute("data-flex-cancel")) {
        panel.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
        return;
      }
      if (button.hasAttribute("data-flex-reload")) {
        await onReload();
        return;
      }
      if (!button.hasAttribute("data-flex-save") || !canEdit(rule)) return;
      busy = true;
      update();
      panel.querySelector(".flex-error").hidden = true;
      try {
        const saved = await api(`/rules/${rule.id}/entry-flexibility`, "PUT", {
          expectedRevision: rule.revision,
          entryMatchPercent: percent,
        });
        await onSaved(saved, rule);
      } catch (error) {
        const box = panel.querySelector(".flex-error");
        box.textContent = error.message;
        box.hidden = false;
        panel.querySelector("[data-flex-reload]").hidden = false;
      } finally {
        busy = false;
        if (host.isConnected) update();
      }
    });
  });
}
