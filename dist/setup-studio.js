"use strict";
(async () => {
  const { conditionRows, indicatorUses, indicatorKey, evidenceAtPath } =
    await import("./studio-model.js");
  await indicatorCatalogReady;
  const chartPane = setupPane.querySelector(".setup-studio");
  const sessions = new Map();
  let sessionKey = "",
    view,
    focusPath = null,
    filter = "",
    bar = null,
    selectedOperand = null,
    editorMode = null;
  const header = document.createElement("header");
  header.className = "studio-workspace-header";
  header.innerHTML =
    '<div><strong data-studio-name>เซตอัป</strong><span data-studio-draft>ร่าง</span></div><div><button type="button" data-collapse-agent aria-expanded="true">Agent</button><button type="button" data-collapse-conditions aria-expanded="true">เงื่อนไข</button><button type="button" data-studio-undo>ย้อนกลับ</button><button type="button" class="secondary" data-studio-save>บันทึก</button><button type="button" class="primary" data-studio-activate>เปิดใช้งาน</button></div>';
  workbench.before(header);
  const tabsBar = document.createElement("nav");
  tabsBar.className = "studio-inspector-tabs";
  tabsBar.setAttribute("aria-label", "พื้นที่ทำงานเซตอัป");
  tabsBar.innerHTML = ["agent", "conditions", "evidence"]
    .map(
      (name, i) =>
        `<button type="button" data-studio-tab="${name}" aria-pressed="${i === 1}">${["Agent", "เงื่อนไข", "เหตุผล"][i]}</button>`,
    )
    .join("");
  workbench.before(tabsBar);
  workbench.dataset.inspector = "conditions";
  const reasonPane = document.createElement("aside");
  reasonPane.className = "studio-reason-pane";
  reasonPane.setAttribute("aria-label", "เหตุผลสัญญาณ");
  reasonPane.innerHTML =
    "<h3>เหตุผลสัญญาณ</h3><p>เลือกแท่งบนกราฟเพื่อดูค่าที่ตรวจ</p>";
  workbench.append(reasonPane);
  const toolbar = document.createElement("div");
  toolbar.className = "studio-chart-toolbar";
  toolbar.innerHTML = `<div class="studio-timeframes" aria-label="ไทม์เฟรมกราฟ">${tf.map((t) => `<button type="button" data-chart-frame="${t}" aria-pressed="false">${t.toUpperCase()}</button>`).join("")}</div><button type="button" class="secondary" data-add-chart-indicator>＋ อินดิเคเตอร์</button>`;
  chartPane.querySelector("header").after(toolbar);
  const eventList = document.createElement("div");
  eventList.className = "studio-event-list";
  chartPane.querySelector(".replay-controls").after(eventList);
  const overlayEditor = document.createElement("section");
  overlayEditor.className = "studio-operand-inspector";
  overlayEditor.hidden = true;

  function session() {
    const key = [
      state.me?.id,
      state.workspaceId,
      state.conversation ?? state.saved?.id ?? "new",
    ].join(":");
    if (key !== sessionKey) {
      sessionKey = key;
      focusPath = null;
      bar = null;
      selectedOperand = null;
      editorMode = null;
    }
    if (!sessions.has(key)) {
      let stored;
      try {
        stored = JSON.parse(sessionStorage.getItem("snaap-studio:" + key));
      } catch {}
      const extras = Object.fromEntries(
        tf.map((frame) => [
          frame,
          Array.isArray(stored?.extras?.[frame])
            ? stored.extras[frame]
                .filter(
                  (o) =>
                    o?.kind === "INDICATOR" &&
                    o.timeframe === frame &&
                    catalogEntries().some((d) => d.name === o.name),
                )
                .slice(0, 8)
            : [],
        ]),
      );
      sessions.set(key, {
        frame: tf.includes(stored?.frame)
          ? stored.frame
          : (state.draft?.timeframe ?? "15m"),
        extras,
        hidden: new Set(Array.isArray(stored?.hidden) ? stored.hidden : []),
      });
    }
    view = sessions.get(key);
    return view;
  }
  function persist() {
    try {
      sessionStorage.setItem(
        "snaap-studio:" + sessionKey,
        JSON.stringify({ ...view, hidden: [...view.hidden] }),
      );
    } catch {}
  }
  function selectTab(name) {
    workbench.dataset.inspector = name;
    if (name === "agent") {
      workbench.dataset.agentCollapsed = "false";
      header
        .querySelector("[data-collapse-agent]")
        .setAttribute("aria-expanded", "true");
    }
    if (name === "conditions") {
      workbench.dataset.conditionsCollapsed = "false";
      header
        .querySelector("[data-collapse-conditions]")
        .setAttribute("aria-expanded", "true");
    }
    tabsBar
      .querySelectorAll("button")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.studioTab === name)),
      );
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }
  function setView(frame, time) {
    session();
    view.frame = frame;
    persist();
    window.SnaapChart.view(frame, null, time);
    paintFrames();
  }
  function paintFrames() {
    toolbar
      .querySelectorAll("[data-chart-frame]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.chartFrame === session().frame),
        ),
      );
  }
  function context() {
    if (!state.draft) return;
    session();
    const pair = state.draft.pairs.includes(window.SnaapChart.pair)
      ? window.SnaapChart.pair
      : state.draft.pairs[0];
    if (!pair) return;
    if (
      focusPath &&
      !conditionRows(state.draft).some((r) => r.path === focusPath)
    )
      focusPath = null;
    return {
      pair,
      chartTimeframe: view.frame,
      ...(focusPath ? { conditionPath: focusPath } : {}),
      ...(window.SnaapChart.selectedTime != null
        ? { selectedBarTime: window.SnaapChart.selectedTime }
        : {}),
    };
  }
  window.SnaapStudio = {
    adoptConversation(id) {
      const old = session();
      const key = [state.me?.id, state.workspaceId, id].join(":");
      sessions.delete(sessionKey);
      try {
        sessionStorage.removeItem("snaap-studio:" + sessionKey);
      } catch {}
      sessionKey = key;
      sessions.set(key, old);
      view = old;
      persist();
    },
    context,
    chartIndicators: (frame) => (session().extras[frame] ?? []).slice(0, 8),
    isHidden: (operand) => session().hidden.has(indicatorKey(operand)),
    focus: openCondition,
  };
  function invalidate() {
    bar = null;
    eventList.hidden = true;
    renderOverview();
    reasonPane.innerHTML =
      '<h3>เหตุผลสัญญาณ</h3><p role="status">กำลังคำนวณร่างล่าสุด…</p>';
  }
  async function commit(next) {
    const original = JSON.stringify(state.draft),
      conversation = state.conversation;
    const checked = await api("/strategies/validate", "POST", next);
    if (
      original !== JSON.stringify(state.draft) ||
      conversation !== state.conversation
    )
      throw Error("ร่างเปลี่ยนระหว่างตรวจค่า กรุณาลองอีกครั้ง");
    snapshot();
    state.draft = checked.spec;
    queueDraftSave();
    renderDesigner();
  }
  function valueLabel(e) {
    return !e
      ? "รอคำนวณ"
      : ({ TRUE: "✓ ผ่าน", FALSE: "× ไม่ผ่าน", UNKNOWN: "? ข้อมูลไม่พอ" }[
          e.result
        ] ?? "รอคำนวณ");
  }
  function renderOverview() {
    const box = panel.querySelector(".studio-condition-overview");
    if (!box || !state.draft) return;
    const rows = conditionRows(state.draft);
    box.innerHTML = `<div class="studio-overview-heading"><h3>เงื่อนไขเซตอัป</h3><span>${setupConditionCount(state.draft)}/${MAX_SETUP_CONDITIONS}</span></div><label class="studio-filter">ไทม์เฟรมเงื่อนไข<select data-condition-frame><option value="">ทุกไทม์เฟรม</option>${tf.map((t) => `<option value="${t}" ${filter === t ? "selected" : ""}>${t.toUpperCase()}</option>`).join("")}</select></label><p class="field-note">ตรวจสัญญาณเมื่อแท่ง ${esc(state.draft.timeframe.toUpperCase())} ปิด · ใช้แท่งปิดล่าสุดของแต่ละไทม์เฟรม</p>${
      rows
        .filter((r) => !filter || r.frames.includes(filter))
        .map((r) => {
          const e = evidenceAtPath(bar, r.path, state.draft),
            depth = (r.path.match(/children|\.condition/g) ?? []).length;
          return `<article class="studio-condition-card ${r.path === focusPath ? "selected" : ""}" style="--condition-depth:${Math.min(depth, 3)}"><div><small>${esc(r.side)} · ${esc(r.section)}${r.condition.kind === "GROUP" ? ` · ${r.condition.op === "AND" ? "ครบทุกข้อ" : "อย่างน้อยหนึ่งข้อ"}` : r.condition.kind === "HOLD" ? " · ต่อเนื่อง" : ""}</small><span class="studio-truth" data-truth="${e?.result ?? "PENDING"}">${valueLabel(e)}</span></div><p>${esc(r.condition.kind === "GROUP" ? `${r.condition.op === "AND" ? "ต้องผ่านครบ" : "ผ่านอย่างน้อยหนึ่งข้อจาก"} ${r.condition.children.length} เงื่อนไข / กลุ่มด้านล่าง` : conditionText(r.condition))}</p>${e?.left !== undefined ? `<small>ค่าที่ตรวจ ${esc(Number(e.left).toLocaleString("th-TH", { maximumFractionDigits: 6 }))} · เทียบกับ ${e.right === undefined ? "—" : esc(Number(e.right).toLocaleString("th-TH", { maximumFractionDigits: 6 }))}</small>` : ""}${e?.reason ? `<small>${esc(e.reason)}</small>` : ""}${
            bar?.references
              ? `<div class="studio-reference-times">${r.frames
                  .map((frame) => {
                    const ref = bar.references.find(
                      (x) => x.timeframe === frame,
                    );
                    return `<small>${esc(frame.toUpperCase())}: ${ref?.closedAt ? esc(new Date(ref.closedAt).toLocaleString("th-TH")) : "ข้อมูลไม่พอ"}${ref?.stale ? " · ข้อมูลขาดช่วง" : ""}</small>`;
                  })
                  .join("")}</div>`
              : ""
          }<div class="studio-condition-actions"><button type="button" data-studio-edit="${r.path}">แก้</button><button type="button" data-studio-view="${r.path}">ดูกราฟ</button><button type="button" data-studio-ask="${r.path}">ถาม Agent</button></div></article>`;
        })
        .join("") || "<p>ไม่มีเงื่อนไขในไทม์เฟรมนี้</p>"
    }${bar ? `<small>อ้างอิงแท่งตรวจ ${esc(new Date(bar.time).toLocaleString("th-TH"))}</small>` : ""}`;
  }
  function openCondition(path) {
    if (!state.draft) return;
    const rows = conditionRows(state.draft);
    let row = rows.find((r) => r.path === path);
    while (!row && path.includes(".")) {
      path = path.slice(0, path.lastIndexOf("."));
      row = rows.find((r) => r.path === path);
    }
    if (!row) return;
    focusPath = row.path;
    editorMode = "condition";
    selectedOperand = null;
    selectTab("conditions");
    renderInspector();
    renderOverview();
    overlayEditor.scrollIntoView({ block: "nearest" });
    overlayEditor
      .querySelector("select,input,button")
      ?.focus({ preventScroll: true });
  }
  function renderInspector() {
    overlayEditor.hidden = !editorMode;
    if (editorMode === "condition") {
      const row = conditionRows(state.draft).find((r) => r.path === focusPath);
      if (!row) {
        overlayEditor.hidden = true;
        editorMode = null;
        return;
      }
      overlayEditor.innerHTML = `<header><h3>แก้เงื่อนไข · ${esc(row.section)}</h3><button type="button" data-close-inspector aria-label="ปิดการแก้เงื่อนไข">×</button></header>${conditionUI(row.condition, row.path)}`;
    } else if (editorMode === "indicator") renderIndicatorEditor();
  }
  function decorate() {
    if (!state.draft) return;
    session();
    header.hidden = workbench.hidden || workbench.dataset.tab === "chat";
    tabsBar.hidden = header.hidden;
    header.querySelector("[data-studio-name]").textContent = state.draft.name;
    header.querySelector("[data-studio-draft]").textContent = state.saved
      ? "ร่าง · เวอร์ชัน " + state.saved.revision
      : "ร่างใหม่";
    header.querySelector("[data-studio-undo]").disabled = !state.undo.length;
    header.querySelector("[data-studio-activate]").disabled =
      !state.saved ||
      JSON.stringify(comparableSpec(state.saved.spec)) !==
        JSON.stringify(comparableSpec(state.draft));
    if (!panel.querySelector(".studio-condition-overview")) {
      const body = panel.querySelector(".design-body");
      const settings = document.createElement("details");
      settings.className = "studio-setup-settings";
      settings.innerHTML = "<summary>ตลาด คู่เทรด และรอบตรวจสัญญาณ</summary>";
      for (const child of [...body.children]) {
        if (child.classList.contains("setup-section")) break;
        if (child.id !== "editor-feedback") settings.append(child);
      }
      body.prepend(settings);
      const feedback = body.querySelector("#editor-feedback");
      if (feedback) body.prepend(feedback);
      const overview = document.createElement("section");
      overview.className = "studio-condition-overview";
      settings.before(overview);
      overview.after(overlayEditor);
      body.querySelectorAll(":scope > .setup-section").forEach((section) => {
        const details = document.createElement("details");
        details.className = "studio-original-editor";
        details.innerHTML =
          "<summary>โครงสร้างเงื่อนไขเข้า · เพิ่ม / จัดกลุ่ม</summary>";
        section.before(details);
        details.append(section);
      });
      const frameSelect = body.querySelector('[data-path="timeframe"]');
      if (frameSelect?.parentElement.firstChild)
        frameSelect.parentElement.firstChild.textContent =
          "ตรวจสัญญาณเมื่อแท่ง … ปิด";
    }
    renderOverview();
    renderInspector();
    paintFrames();
    if (window.SnaapChart.frame !== view.frame)
      window.SnaapChart.view(view.frame);
  }
  function catalogEntries() {
    const legacy = [
      "EMA",
      "SMA",
      "RSI",
      "MACD",
      "MACD_SIGNAL",
      "MACD_HIST",
      "BB_UPPER",
      "BB_LOWER",
      "ATR",
      "VOLUME_RATIO",
      "WMA",
      "RMA",
      "VWMA",
      "ROC",
      "MOM",
      "STDDEV",
      "VARIANCE",
      "HIGHEST",
      "LOWEST",
      "DONCHIAN_UPPER",
      "DONCHIAN_LOWER",
      "DONCHIAN_MID",
      "STOCH_K",
      "WILLIAMS_R",
      "CCI",
      "MFI",
      "CMF",
      "BB_MIDDLE",
      "BB_WIDTH",
      "BB_PERCENT",
      "TR",
    ];
    return [...new Set([...legacy, ...indicatorCatalog.extendedNames])].map(
      (name) => ({ name, ...indicatorCatalog.indicatorByName[name] }),
    );
  }
  function defaultOperand(name) {
    const d = indicatorCatalog.indicatorByName[name];
    const o = {
      kind: "INDICATOR",
      name,
      period:
        d?.params.find((p) => p.key === "period")?.value ??
        (name === "EMA" || name === "SMA" ? 20 : 14),
      timeframe: session().frame,
      source: "close",
    };
    if (d) {
      const params = Object.fromEntries(
        d.params.filter((p) => p.key !== "period").map((p) => [p.key, p.value]),
      );
      if (Object.keys(params).length) o.params = params;
    } else if (name.startsWith("MACD"))
      Object.assign(o, { period: 12, slow: 26, signal: 9 });
    else if (name.startsWith("BB_"))
      Object.assign(o, { period: 20, deviation: 2 });
    return o;
  }
  function dialog(markup, opener) {
    const el = document.createElement("dialog");
    el.className = "studio-dialog";
    el.innerHTML = markup;
    document.body.append(el);
    el.addEventListener("close", () => {
      el.remove();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
    el.querySelector("[data-close-dialog]")?.addEventListener("click", () =>
      el.close(),
    );
    el.showModal();
    return el;
  }
  function addIndicator(opener) {
    const el = dialog(
      '<header><h2>เพิ่มอินดิเคเตอร์</h2><button type="button" data-close-dialog aria-label="ปิด">×</button></header><label>ค้นหาอินดิเคเตอร์<input type="search" autofocus placeholder="EMA, RSI, แนวโน้ม…"></label><p>เพิ่มเพื่อดูบนกราฟก่อน แล้วเลือกใช้สร้างเงื่อนไขได้</p><div class="studio-indicator-results"></div>',
      opener,
    );
    const paint = () => {
      const q = el.querySelector("input").value.toLowerCase();
      el.querySelector(".studio-indicator-results").innerHTML =
        catalogEntries()
          .filter((d) =>
            `${d.name} ${d.label ?? ""} ${d.overlay ? "แนวโน้ม" : "โมเมนตัม"}`
              .toLowerCase()
              .includes(q),
          )
          .map(
            (d) =>
              `<button type="button" data-pick-indicator="${d.name}"><strong>${esc(d.label ?? d.name)}</strong><small>${esc(d.name)} · ${esc(d.unit ?? "ค่าจากราคาและวอลุ่ม")}</small></button>`,
          )
          .join("") || "<p>ไม่พบอินดิเคเตอร์ที่ระบบรองรับ</p>";
    };
    el.querySelector("input").oninput = paint;
    paint();
    el.onclick = (e) => {
      const b = e.target.closest("[data-pick-indicator]");
      if (!b) return;
      const v = session(),
        extras = (v.extras[v.frame] ??= []);
      if (extras.length >= 8) {
        toast("อินดิเคเตอร์สำหรับดูบนกราฟมีได้ 8 ตัวต่อไทม์เฟรม");
        return;
      }
      const o = defaultOperand(b.dataset.pickIndicator);
      if (!extras.some((x) => indicatorKey(x) === indicatorKey(o)))
        extras.push(o);
      persist();
      el.close();
      editIndicator(o);
      window.SnaapChart.refresh();
    };
  }
  function editIndicator(o) {
    selectedOperand = structuredClone(o);
    editorMode = "indicator";
    selectTab("conditions");
    renderInspector();
    overlayEditor.scrollIntoView({ block: "nearest" });
  }
  function renderIndicatorEditor() {
    if (!selectedOperand) return;
    const uses = indicatorUses(state.draft).find(
      (u) => indicatorKey(u.operand) === indicatorKey(selectedOperand),
    );
    const d = indicatorCatalog.indicatorByName[selectedOperand.name];
    const params = d?.params ?? [
      { key: "period", label: "ระยะ (แท่ง)", min: 2, max: 500, integer: true },
      ...(selectedOperand.name.startsWith("MACD")
        ? [
            { key: "slow", label: "ระยะช้า", min: 3, max: 500, integer: true },
            {
              key: "signal",
              label: "ระยะสัญญาณ",
              min: 2,
              max: 100,
              integer: true,
            },
          ]
        : []),
      ...(selectedOperand.name.startsWith("BB_")
        ? [
            {
              key: "deviation",
              label: "ส่วนเบี่ยงเบน",
              min: 0.1,
              max: 10,
              integer: false,
            },
          ]
        : []),
    ];
    overlayEditor.innerHTML = `<header><h3>${esc(operandText(selectedOperand))}</h3><button type="button" data-close-inspector aria-label="ปิดการตั้งค่า">×</button></header><p class="studio-indicator-badge">${uses ? "ใช้ในเงื่อนไข " + uses.conditions.length + " จุด" : "ใช้ดูบนกราฟ · เก็บใน session"}</p><form data-indicator-form>${params.map((p) => `<label>${esc(p.label)}<input type="number" name="${p.key}" min="${p.min}" max="${p.max}" step="${p.integer ? "1" : "any"}" value="${selectedOperand[p.key] ?? selectedOperand.params?.[p.key] ?? p.value ?? 14}" required></label>`).join("")}<label>แหล่งราคา<select name="source">${options(["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"], selectedOperand.source ?? "close")}</select></label><p data-indicator-error role="status"></p><button type="submit" class="secondary">ใช้ค่าที่ปรับ</button></form><div class="studio-indicator-actions"><button type="button" data-indicator-visibility>${session().hidden.has(indicatorKey(selectedOperand)) ? "แสดงเส้น" : "ซ่อนเส้น"}</button><button type="button" class="primary" data-indicator-condition>ใช้สร้างเงื่อนไข</button>${!uses ? '<button type="button" data-delete-chart-indicator>นำออกจากกราฟ</button>' : ""}</div>`;
    overlayEditor.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      if (!form.reportValidity()) return;
      const original = JSON.stringify(state.draft),
        conversation = state.conversation;
      const next = structuredClone(selectedOperand);
      for (const p of params) {
        const val = Number(form.elements[p.key].value);
        if (d && p.key !== "period") {
          next.params ??= {};
          next.params[p.key] = val;
        } else next[p.key] = val;
      }
      next.source = form.elements.source.value;
      try {
        if (uses) {
          if (uses.paths.length > 1) {
            const el = dialog(
              `<header><h2>ปรับอินดิเคเตอร์ที่ใช้ร่วมกัน</h2><button type="button" data-close-dialog aria-label="ปิด">×</button></header><p>การปรับนี้จะเปลี่ยน ${uses.conditions.length} จุด</p><ul>${uses.conditions.map((path) => `<li>${esc(conditionText(at(path)))}</li>`).join("")}</ul><button type="button" class="primary" data-confirm-shared>ปรับทุกจุดที่ใช้ร่วมกัน</button>`,
              form.querySelector("button"),
            );
            el.querySelector("[data-confirm-shared]").onclick = async () => {
              try {
                await replaceIndicator(next, uses, original, conversation);
                el.close();
              } catch (error) {
                toast(error.message);
              }
            };
          } else await replaceIndicator(next, uses, original, conversation);
        } else {
          // Validate operand semantics using the same strategy validator, without making it a saved condition.
          const check = structuredClone(state.draft);
          check.entry = {
            kind: "COMPARE",
            op: ">",
            left: next,
            right: { kind: "CONSTANT", value: 0 },
          };
          check.stages = [];
          delete check.exit;
          delete check.cancel;
          delete check.short;
          check.side = "SPOT";
          check.market = "Spot";
          delete check.mirrorShort;
          await api("/strategies/validate", "POST", check);
          const extras = session().extras[selectedOperand.timeframe] ?? [];
          const i = extras.findIndex(
            (o) => indicatorKey(o) === indicatorKey(selectedOperand),
          );
          if (i < 0) throw Error("รายการอินดิเคเตอร์เปลี่ยนแล้ว");
          extras[i] = next;
          selectedOperand = next;
          persist();
          renderIndicatorEditor();
          window.SnaapChart.refresh();
        }
      } catch (error) {
        form.querySelector("[data-indicator-error]").textContent =
          error.message;
      }
    };
  }
  async function replaceIndicator(next, uses, original, conversation) {
    if (
      original !== JSON.stringify(state.draft) ||
      conversation !== state.conversation
    )
      throw Error("ร่างเปลี่ยนแล้ว กรุณาเปิดตั้งค่าอินดิเคเตอร์ใหม่");
    const candidate = structuredClone(state.draft);
    for (const path of uses.paths) {
      const keys = path.split("."),
        last = keys.pop();
      keys.reduce((o, k) => o[k], candidate)[last] = structuredClone(next);
    }
    await commit(candidate);
    selectedOperand = next;
    editorMode = "indicator";
    renderInspector();
  }
  function createCondition(opener) {
    if (!canAddSetupCondition()) return;
    const operand = structuredClone(selectedOperand),
      original = JSON.stringify(state.draft),
      conversation = state.conversation;
    const targets = conditionRows(state.draft).filter(
      (r) =>
        r.path === "entry" ||
        r.path === "short.entry" ||
        (r.path.startsWith("stages.") && !r.path.includes("children")) ||
        r.path === "exit" ||
        r.path === "cancel" ||
        r.path === "short.exit" ||
        r.path === "short.cancel",
    );
    const el = dialog(
      `<header><h2>ใช้สร้างเงื่อนไข</h2><button type="button" data-close-dialog aria-label="ปิด">×</button></header><p>${esc(operandText(operand))}</p><form><label>เพิ่มใน<select name="target">${targets.map((r) => `<option value="${r.path}">${esc(r.side + " · " + r.section)}</option>`).join("")}</select></label><label>การเปรียบเทียบ<select name="op">${options([">", ">=", "<", "<=", "CROSS_ABOVE", "CROSS_BELOW"], ">")}</select></label><label>เทียบกับ<select name="kind"><option value="CONSTANT">ตัวเลข</option><option value="PRICE">ราคาปิดในไทม์เฟรมเดียวกัน</option></select></label><label data-threshold>ค่าที่เปรียบเทียบ<input name="value" type="number" step="any" required></label><p class="field-note">เพิ่มแบบครบทุกข้อ (AND) โดยคงกลุ่มและลำดับเดิม</p><p data-create-error role="status"></p><button type="submit" class="primary">เพิ่มเงื่อนไข</button></form>`,
      opener,
    );
    const form = el.querySelector("form");
    form.elements.kind.onchange = () => {
      const constant = form.elements.kind.value === "CONSTANT";
      form.querySelector("[data-threshold]").hidden = !constant;
      form.elements.value.required = constant;
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        if (
          original !== JSON.stringify(state.draft) ||
          conversation !== state.conversation
        )
          throw Error("ร่างเปลี่ยนแล้ว กรุณาเปิดสร้างเงื่อนไขใหม่");
        if (!canAddSetupCondition()) return;
        const c = {
          kind: "COMPARE",
          op: form.elements.op.value,
          left: operand,
          right:
            form.elements.kind.value === "CONSTANT"
              ? { kind: "CONSTANT", value: Number(form.elements.value.value) }
              : { kind: "PRICE", field: "close", timeframe: operand.timeframe },
        };
        const next = structuredClone(state.draft),
          path = form.elements.target.value,
          keys = path.split("."),
          last = keys.pop(),
          parent = keys.reduce((o, k) => o[k], next),
          old = parent[last];
        parent[last] =
          old.kind === "GROUP" && old.op === "AND" && old.children.length < 12
            ? { ...old, children: [...old.children, c] }
            : { kind: "GROUP", op: "AND", children: [old, c] };
        await commit(next);
        view.extras[operand.timeframe] = (
          view.extras[operand.timeframe] ?? []
        ).filter((o) => indicatorKey(o) !== indicatorKey(operand));
        persist();
        el.close();
        openCondition(path);
        window.SnaapChart.refresh();
      } catch (error) {
        form.querySelector("[data-create-error]").textContent = error.message;
      }
    };
  }
  document.addEventListener("setup-rendered", decorate);
  document.addEventListener("setup-changed", invalidate);
  document.addEventListener("workbench-mode-changed", decorate);
  document.addEventListener("studio-evidence", (e) => {
    bar = e.detail.bar;
    renderOverview();
    reasonPane.innerHTML = `<h3>เหตุผลสัญญาณ</h3><p>กราฟ ${esc(view.frame.toUpperCase())} · ตรวจบน ${esc(state.draft.timeframe.toUpperCase())}</p>${bar ? barEvidence(bar) : "<p>ข้อมูลไม่พอ · ยังไม่มีแท่งตรวจที่ปิดแล้ว ณ จุดนี้</p>"}${bar?.branches?.map((b) => (b.cancel ? "<p>ยกเลิก</p>" + evidenceUI(b.cancel) : "")).join("") ?? ""}<button type="button" data-ask-bar>ถาม Agent เกี่ยวกับแท่งนี้</button>`;
    const data = window.SnaapChart.data;
    eventList.hidden =
      !data || data.chartTimeframe === data.evaluationTimeframe;
    if (data)
      eventList.innerHTML = `<small>สัญญาณประเมินบน ${esc(data.evaluationTimeframe.toUpperCase())} · เปิดกรอบเวลาตรวจเพื่อดูตำแหน่งจริง</small>${data.events
        .slice(-8)
        .reverse()
        .map(
          (ev) =>
            `<button type="button" data-open-event="${ev.time}">${esc({ ENTRY: "เข้า", EXIT: "ออก", CANCEL: "ยกเลิก", EXPIRED: "หมดเวลา" }[ev.kind])} · ${esc(new Date(ev.time).toLocaleString("th-TH"))}</button>`,
        )
        .join("")}`;
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.studioTab) selectTab(b.dataset.studioTab);
    if (b.dataset.chartFrame) setView(b.dataset.chartFrame);
    if (b.hasAttribute("data-add-chart-indicator")) addIndicator(b);
    if (b.dataset.chartIndicator !== undefined) {
      const o =
        window.SnaapChart.data?.overlays[Number(b.dataset.chartIndicator)]
          ?.operand;
      if (o) editIndicator(o);
    }
    if (b.dataset.studioEdit) openCondition(b.dataset.studioEdit);
    if (b.dataset.studioView) {
      const row = conditionRows(state.draft).find(
        (r) => r.path === b.dataset.studioView,
      );
      if (row) {
        focusPath = row.path;
        setView(row.frames[0] ?? state.draft.timeframe);
        renderOverview();
      }
    }
    if (b.dataset.studioAsk) {
      focusPath = b.dataset.studioAsk;
      selectTab("agent");
      $("#followup-input").value =
        "ช่วยอธิบายและตรวจเงื่อนไขนี้: " + conditionText(at(focusPath));
      resizeChatInputs();
      $("#followup-input").focus();
    }
    if (b.hasAttribute("data-close-inspector")) {
      editorMode = null;
      selectedOperand = null;
      overlayEditor.hidden = true;
    }
    if (b.hasAttribute("data-indicator-visibility")) {
      const v = session(),
        key = indicatorKey(selectedOperand);
      v.hidden.has(key) ? v.hidden.delete(key) : v.hidden.add(key);
      persist();
      window.SnaapChart.visibility();
      renderIndicatorEditor();
    }
    if (b.hasAttribute("data-delete-chart-indicator")) {
      view.extras[selectedOperand.timeframe] = (
        view.extras[selectedOperand.timeframe] ?? []
      ).filter((o) => indicatorKey(o) !== indicatorKey(selectedOperand));
      persist();
      editorMode = null;
      overlayEditor.hidden = true;
      window.SnaapChart.refresh();
    }
    if (b.hasAttribute("data-indicator-condition")) createCondition(b);
    if (b.dataset.openEvent)
      setView(state.draft.timeframe, Number(b.dataset.openEvent));
    if (b.hasAttribute("data-studio-activate") && state.saved) {
      showActivation(state.saved);
    }
    if (b.hasAttribute("data-ask-bar")) {
      selectTab("agent");
      $("#followup-input").value =
        "ช่วยตรวจเหตุผลของสัญญาณ ณ แท่งที่เลือกบนกราฟ";
      resizeChatInputs();
      $("#followup-input").focus();
    }
    if (
      b.hasAttribute("data-collapse-agent") ||
      b.hasAttribute("data-collapse-conditions")
    ) {
      const key = b.hasAttribute("data-collapse-agent")
        ? "agentCollapsed"
        : "conditionsCollapsed";
      workbench.dataset[key] =
        workbench.dataset[key] === "true" ? "false" : "true";
      b.setAttribute(
        "aria-expanded",
        String(workbench.dataset[key] !== "true"),
      );
    }
    for (const [attr, target] of [
      ["data-studio-undo", "[data-undo]"],
      ["data-studio-save", "[data-save]"],
    ])
      if (b.hasAttribute(attr)) panel.querySelector(target)?.click();
  });
  panel.addEventListener("change", (e) => {
    if (e.target.hasAttribute("data-condition-frame")) {
      filter = e.target.value;
      renderOverview();
    }
  });
  const viewport = () => {
    const height = window.visualViewport?.height ?? innerHeight;
    workbench.dataset.keyboardOpen = String(innerHeight - height > 140);
    document.documentElement.style.setProperty(
      "--studio-viewport-height",
      height + "px",
    );
  };
  window.visualViewport?.addEventListener("resize", viewport);
  viewport();
  if (state.draft) decorate();
  else header.hidden = tabsBar.hidden = true;
})();
