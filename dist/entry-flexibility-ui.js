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
        return `${needed}/${total} ข้อ`;
      };
      panel.querySelector("[data-flex-result]").textContent = rule.spec.short
        ? `Long ${count(rule.spec.entry)} · Short ${count(rule.spec.short.entry)}`
        : count(rule.spec.entry);
      panel
        .querySelectorAll("button,input")
        .forEach((control) => (control.disabled = busy));
      toggle.disabled = busy;
    }
    function close() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "ปรับ";
    }
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !busy) {
        close();
        toggle.focus({ preventScroll: true });
      }
    });
    toggle.addEventListener("click", () => {
      if (!panel.hidden) {
        close();
        return;
      }
      if (!canEdit(rule)) return;
      percent = rule.spec.entryMatchPercent ?? 100;
      panel.innerHTML = `<div class="flex-slider-row"><input type="range" min="1" max="100" step="1" value="${percent}" data-flex-percent aria-label="ต้องผ่านเงื่อนไขอย่างน้อย (%)"><output data-flex-value></output></div><div class="flex-actions"><span class="flex-result" data-flex-result aria-live="polite"></span><button type="button" data-flex-cancel>ยกเลิก</button><button type="button" data-flex-save>บันทึก</button></div><p class="flex-error" role="alert" hidden></p><button type="button" data-flex-reload hidden>โหลดค่าล่าสุด</button>`;
      update();
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "ปิด";
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
        close();
        toggle.focus({ preventScroll: true });
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
        [...root.querySelectorAll("[data-flex-rule]")]
          .find(node => node.dataset.flexRule === rule.id)
          ?.querySelector("[data-flex-toggle]").focus({ preventScroll: true });
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
