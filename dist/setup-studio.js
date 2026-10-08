"use strict";
(async () => {
  const { conditionRows, indicatorUses, indicatorKey, evidenceAtPath } =
    await import("./studio-model.js");
  await indicatorCatalogReady;
  await timeframeToolsReady;
  await assetToolsReady;
  const { basicIndicators, basicByName } = await import('./basic-indicators.js');
  const chartPane = setupPane.querySelector(".setup-studio");
  const sessions = new Map();
  let sessionKey = "",
    view,
    focusPath = null,
    filter = "",
    bar = null,
    selectedOperand = null,
    editorMode = null;
  const header = document.createElement("nav");
  header.className = "studio-workspace-header";
  header.setAttribute("aria-label", (globalThis.SnaapI18n?.text("แสดงแผงเซ็ตอัพ") ?? "แสดงแผงเซ็ตอัพ"));
  header.innerHTML =
    (globalThis.SnaapI18n?.text("<button type=\"button\" data-collapse-agent aria-expanded=\"true\">Agent</button><button type=\"button\" data-collapse-conditions aria-expanded=\"true\">เงื่อนไข</button>") ?? "<button type=\"button\" data-collapse-agent aria-expanded=\"true\">Agent</button><button type=\"button\" data-collapse-conditions aria-expanded=\"true\">เงื่อนไข</button>");
  conversationActions.prepend(header);
  const draftStatus = document.createElement("span");
  draftStatus.className = "studio-draft-status";
  draftStatus.setAttribute("role", "status");
  const tabsBar = document.createElement("nav");
  tabsBar.className = "studio-inspector-tabs";
  tabsBar.setAttribute("aria-label", (globalThis.SnaapI18n?.text("พื้นที่ทำงานเซ็ตอัพ") ?? "พื้นที่ทำงานเซ็ตอัพ"));
  tabsBar.innerHTML = ["agent", "conditions", "evidence", "chart"]
    .map(
      (name, i) =>
        `<button type="button" data-studio-tab="${name}" aria-pressed="${i === 1}">${[(globalThis.SnaapI18n?.text("แชท") ?? "แชท"), (globalThis.SnaapI18n?.text("เซ็ตอัพ") ?? "เซ็ตอัพ"), (globalThis.SnaapI18n?.text("เหตุผล") ?? "เหตุผล"), (globalThis.SnaapI18n?.text("กราฟ") ?? "กราฟ")][i]}</button>`,
    )
    .join("");
  workbench.before(tabsBar);
  const mobileMenu = document.createElement("details");
  mobileMenu.className = "studio-mobile-menu";
  mobileMenu.innerHTML = `${(globalThis.SnaapI18n?.text("<summary aria-label=\"ตัวเลือกพื้นที่ทำงาน\">") ?? "<summary aria-label=\"ตัวเลือกพื้นที่ทำงาน\">")}${uiIcon("more")}${(globalThis.SnaapI18n?.text("</summary><div class=\"studio-mobile-menu-items\"><button type=\"button\" data-studio-tab=\"evidence\">เหตุผลสัญญาณ</button></div>") ?? "</summary><div class=\"studio-mobile-menu-items\"><button type=\"button\" data-studio-tab=\"evidence\">เหตุผลสัญญาณ</button></div>")}`;
  tabsBar.append(mobileMenu);
  const mobileMenuItems = mobileMenu.querySelector("div");
  function placeMobileActions() {
    const mobile = innerWidth < 900 && !workbench.hidden;
    if (conversationPicker.parentElement === (mobile ? mobileMenuItems : conversationActions)) return;
    if (mobile) mobileMenuItems.append(conversationTitle, conversationPicker, newConversationButton);
    else {
      workbenchToolbar.insertBefore(conversationTitle, conversationActions);
      conversationActions.append(conversationPicker, newConversationButton);
      mobileMenu.open = false;
    }
  }
  document.addEventListener("click", event => {
    if (!mobileMenu.contains(event.target) || event.target.closest("button")) mobileMenu.open = false;
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && mobileMenu.open) {
      mobileMenu.open = false;
      mobileMenu.querySelector("summary").focus();
      event.preventDefault();
    }
  });
  workbench.dataset.inspector ??= "conditions";
  // Layout preferences belong to the workspace UI, never to the strategy draft.
  const layoutKey = "snaap-studio-panel-widths-v1";
  let preferredWidths = { agent: 300, conditions: 340 };
  try {
    const saved = JSON.parse(sessionStorage.getItem(layoutKey));
    for (const name of ["agent", "conditions"])
      if (Number.isFinite(saved?.[name]) && saved[name] > 0)
        preferredWidths[name] = saved[name];
  } catch {}
  const desktopLayout = () => matchMedia("(min-width: 1280px)").matches;
  const panelWidths = {};
  const separators = ["agent", "conditions"].map((name) => {
    const handle = document.createElement("div");
    handle.className = "studio-panel-divider";
    handle.dataset.resizePanel = name;
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute("aria-label", name === "agent" ? (globalThis.SnaapI18n?.text("ปรับความกว้างแชท") ?? "ปรับความกว้างแชท") : (globalThis.SnaapI18n?.text("ปรับความกว้างแผงออกแบบเซ็ตอัพ") ?? "ปรับความกว้างแผงออกแบบเซ็ตอัพ"));
    handle.title = (globalThis.SnaapI18n?.text("ลากเพื่อปรับความกว้าง · ลูกศรซ้าย/ขวา · ดับเบิลคลิกคืนขนาดเดิม") ?? "ลากเพื่อปรับความกว้าง · ลูกศรซ้าย/ขวา · ดับเบิลคลิกคืนขนาดเดิม");
    workbench.append(handle);
    return handle;
  });
  function resizePanels(active) {
    const width = workbench.clientWidth;
    if (!width || innerWidth < 900) return;
    const desktop = desktopLayout();
    const agentVisible = desktop && workbench.dataset.agentCollapsed !== "true";
    const conditionsVisible = !desktop || workbench.dataset.conditionsCollapsed !== "true";
    const available = width - (agentVisible ? 12 : 0) - (conditionsVisible ? 12 : 0) - 240;
    let agent = agentVisible ? Math.max(220, preferredWidths.agent) : 0;
    let conditions = conditionsVisible ? Math.max(260, preferredWidths.conditions) : 0;
    // Preserve the opposite panel while dragging; resize the chart in between.
    if (active === "conditions") {
      agent = agentVisible ? Math.min(agent, available - (conditionsVisible ? 260 : 0)) : 0;
      conditions = conditionsVisible ? Math.min(conditions, available - agent) : 0;
    } else {
      conditions = conditionsVisible ? Math.min(conditions, available - (agentVisible ? 220 : 0)) : 0;
      agent = agentVisible ? Math.min(agent, available - conditions) : 0;
    }
    panelWidths.agent = agent;
    panelWidths.conditions = conditions;
    workbench.style.setProperty("--studio-agent-width", agent + "px");
    workbench.style.setProperty("--studio-conditions-width", conditions + "px");
    for (const handle of separators) {
      const name = handle.dataset.resizePanel;
      handle.setAttribute("aria-valuemin", name === "agent" ? "220" : "260");
      handle.setAttribute("aria-valuemax", String(Math.round(available - (name === "agent" ? conditions : agent))));
      handle.setAttribute("aria-valuenow", String(Math.round(panelWidths[name])));
    }
  }
  function savePanelWidths() {
    try { sessionStorage.setItem(layoutKey, JSON.stringify(preferredWidths)); } catch {}
  }
  for (const handle of separators) {
    const name = handle.dataset.resizePanel;
    let drag = null;
    const finish = () => {
      if (!drag) return;
      drag = null;
      delete workbench.dataset.resizing;
      savePanelWidths();
    };
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      handle.focus();
      drag = { x: event.clientX, width: panelWidths[name] };
      handle.setPointerCapture(event.pointerId);
      workbench.dataset.resizing = "true";
    });
    handle.addEventListener("pointermove", (event) => {
      if (!drag) return;
      preferredWidths[name] = drag.width + (event.clientX - drag.x) * (name === "agent" ? 1 : -1);
      resizePanels(name);
      preferredWidths[name] = panelWidths[name];
    });
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    handle.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault();
      preferredWidths[name] = event.key === "Home" ? (name === "agent" ? 300 : 340)
        : panelWidths[name] + (event.key === "ArrowRight" ? 1 : -1) * (name === "agent" ? 1 : -1) * (event.shiftKey ? 40 : 20);
      resizePanels(name);
      preferredWidths[name] = panelWidths[name];
      savePanelWidths();
    });
    handle.addEventListener("dblclick", () => {
      preferredWidths[name] = name === "agent" ? 300 : 340;
      resizePanels(name);
      savePanelWidths();
    });
  }
  new ResizeObserver(() => resizePanels()).observe(workbench);
  new MutationObserver(() => resizePanels()).observe(workbench, { attributes: true, attributeFilter: ["data-agent-collapsed", "data-conditions-collapsed"] });
  const reasonPane = document.createElement("aside");
  reasonPane.className = "studio-reason-pane";
  reasonPane.setAttribute("aria-label", (globalThis.SnaapI18n?.text("เหตุผลสัญญาณ") ?? "เหตุผลสัญญาณ"));
  reasonPane.innerHTML =
    (globalThis.SnaapI18n?.text("<h3>เหตุผลสัญญาณ</h3><p>เลือกแท่งบนกราฟเพื่อดูค่าที่ตรวจ</p>") ?? "<h3>เหตุผลสัญญาณ</h3><p>เลือกแท่งบนกราฟเพื่อดูค่าที่ตรวจ</p>");
  workbench.append(reasonPane);
  const toolbar = document.createElement("div");
  toolbar.className = "studio-chart-toolbar";
  toolbar.innerHTML = `${(globalThis.SnaapI18n?.text("<div class=\"studio-timeframes\" aria-label=\"ไทม์เฟรมกราฟ\">") ?? "<div class=\"studio-timeframes\" aria-label=\"ไทม์เฟรมกราฟ\">")}${tf.map((t) => `<button type="button" data-chart-frame="${t}" aria-pressed="false">${t.toUpperCase()}</button>`).join("")}${(globalThis.SnaapI18n?.text("</div><button type=\"button\" class=\"secondary\" data-add-chart-indicator>＋ อินดิเคเตอร์</button>") ?? "</div><button type=\"button\" class=\"secondary\" data-add-chart-indicator>＋ อินดิเคเตอร์</button>")}`;
  const mobileFrame = document.createElement("select");
  mobileFrame.className = "studio-mobile-frame";
  mobileFrame.setAttribute("data-native", "");
  mobileFrame.setAttribute("aria-label", (globalThis.SnaapI18n?.text("ไทม์เฟรมกราฟ") ?? "ไทม์เฟรมกราฟ"));
  mobileFrame.onchange = () => setView(mobileFrame.value);
  toolbar.prepend(mobileFrame);
  chartPane.querySelector("header").after(toolbar);
  const eventList = document.createElement("div");
  eventList.className = "studio-event-list";
  chartPane.querySelector(".studio-signals-dialog").append(eventList);
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
    if (innerWidth < 900) setWorkbenchTab("split");
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
      .querySelectorAll("[data-studio-tab]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.studioTab === name)),
      );
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }
  function setView(frame, time) {
    if (innerWidth < 900) selectTab("chart");
    session();
    view.frame = frame;
    persist();
    window.SnaapChart.view(frame, null, time);
    paintFrames();
  }
  function paintFrames() {
    const supported = setupTimeframes();
    mobileFrame.innerHTML = supported.map(frame => `<option value="${esc(frame)}">${esc(frame.toUpperCase())}</option>`).join("");
    mobileFrame.value = session().frame;
    toolbar
      .querySelectorAll("[data-chart-frame]")
      .forEach((b) => {
        b.hidden = !supported.includes(b.dataset.chartFrame);
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.chartFrame === session().frame),
        );
      });
  }
  function context() {
    if (!hasEntryCondition()) return;
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
      exchange: assetTools.strategyTargets(state.draft).find(target => target.pair === pair)?.exchange,
      chartTimeframe: view.frame,
      ...(focusPath ? { conditionPath: focusPath } : {}),
      ...(window.SnaapChart.selectedTime != null
        ? { selectedBarTime: window.SnaapChart.selectedTime }
        : {}),
    };
  }
  window.SnaapStudio = {
    reset() {
      const fresh = session();
      fresh.frame = state.draft.timeframe;
      fresh.extras = Object.fromEntries(tf.map(frame => [frame, []]));
      fresh.hidden.clear();
      fresh.reviewOpen = false;
      focusPath = null;filter = "";bar = null;selectedOperand = null;editorMode = null;
      overlayEditor.hidden = true;
      eventList.hidden = true;eventList.replaceChildren();
      reasonPane.innerHTML = (globalThis.SnaapI18n?.text("<h3>เหตุผลสัญญาณ</h3><p>ยังไม่มีเงื่อนไขสำหรับประเมินสัญญาณ</p>") ?? "<h3>เหตุผลสัญญาณ</h3><p>ยังไม่มีเงื่อนไขสำหรับประเมินสัญญาณ</p>");
      persist();
    },
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
      `${(globalThis.SnaapI18n?.text("<h3>เหตุผลสัญญาณ</h3><p role=\"status\">") ?? "<h3>เหตุผลสัญญาณ</h3><p role=\"status\">")}${hasEntryCondition() ? (globalThis.SnaapI18n?.text("กำลังคำนวณร่างล่าสุด…") ?? "กำลังคำนวณร่างล่าสุด…") : (globalThis.SnaapI18n?.text("ยังไม่มีเงื่อนไขสำหรับประเมินสัญญาณ") ?? "ยังไม่มีเงื่อนไขสำหรับประเมินสัญญาณ")}</p>`;
  }
  async function commit(next) {
    const original = JSON.stringify(state.draft),
      conversation = state.conversation;
    const checked = await api("/strategies/validate", "POST", next);
    if (
      original !== JSON.stringify(state.draft) ||
      conversation !== state.conversation
    )
      throw Error((globalThis.SnaapI18n?.text("ร่างเปลี่ยนระหว่างตรวจค่า กรุณาลองอีกครั้ง") ?? "ร่างเปลี่ยนระหว่างตรวจค่า กรุณาลองอีกครั้ง"));
    snapshot();
    state.draft = checked.spec;
    queueDraftSave();
    renderDesigner();
  }
  function valueLabel(e) {
    return !e
      ? (globalThis.SnaapI18n?.text("รอคำนวณ") ?? "รอคำนวณ")
      : ({ TRUE: (globalThis.SnaapI18n?.text("✓ ผ่าน") ?? "✓ ผ่าน"), FALSE: (globalThis.SnaapI18n?.text("× ไม่ผ่าน") ?? "× ไม่ผ่าน"), UNKNOWN: (globalThis.SnaapI18n?.text("? ข้อมูลไม่พอ") ?? "? ข้อมูลไม่พอ") }[
          e.result
        ] ?? (globalThis.SnaapI18n?.text("รอคำนวณ") ?? "รอคำนวณ"));
  }
  function renderOverview() {
    const box = panel.querySelector(".studio-condition-overview");
    if (!box || !state.draft) return;
    if (!hasEntryCondition()) {
      box.innerHTML = `${(globalThis.SnaapI18n?.text("<div class=\"studio-overview-heading\"><h3>เงื่อนไขเซ็ตอัพ</h3><span>0/") ?? "<div class=\"studio-overview-heading\"><h3>เงื่อนไขเซ็ตอัพ</h3><span>0/")}${MAX_SETUP_CONDITIONS}${(globalThis.SnaapI18n?.text("</span></div><p class=\"field-note\">ยังไม่มีเงื่อนไข เริ่มเพิ่มเองหรือให้ Snaap ช่วยออกแบบ</p><button type=\"button\" class=\"secondary\" data-add=\"entry\">เพิ่มเงื่อนไขเข้า</button>") ?? "</span></div><p class=\"field-note\">ยังไม่มีเงื่อนไข เริ่มเพิ่มเองหรือให้ Snaap ช่วยออกแบบ</p><button type=\"button\" class=\"secondary\" data-add=\"entry\">เพิ่มเงื่อนไขเข้า</button>")}`;
      return;
    }
    const rows = conditionRows(state.draft);
    box.innerHTML = `${(globalThis.SnaapI18n?.text("<div class=\"studio-overview-heading\"><h3>เงื่อนไขเซ็ตอัพ</h3><span>") ?? "<div class=\"studio-overview-heading\"><h3>เงื่อนไขเซ็ตอัพ</h3><span>")}${setupConditionCount(state.draft)}/${MAX_SETUP_CONDITIONS}${(globalThis.SnaapI18n?.text("</span></div><label class=\"studio-filter\">ไทม์เฟรมเงื่อนไข<select data-condition-frame><option value=\"\">ทุกไทม์เฟรม</option>") ?? "</span></div><label class=\"studio-filter\">ไทม์เฟรมเงื่อนไข<select data-condition-frame><option value=\"\">ทุกไทม์เฟรม</option>")}${tf.map((t) => `<option value="${t}" ${filter === t ? "selected" : ""}>${t.toUpperCase()}</option>`).join("")}${(globalThis.SnaapI18n?.text("</select></label><p class=\"field-note\">ตรวจสัญญาณเมื่อแท่ง ") ?? "</select></label><p class=\"field-note\">ตรวจสัญญาณเมื่อแท่ง ")}${esc(state.draft.timeframe.toUpperCase())}${(globalThis.SnaapI18n?.text(" ปิด · ใช้แท่งปิดล่าสุดของแต่ละไทม์เฟรม</p>") ?? " ปิด · ใช้แท่งปิดล่าสุดของแต่ละไทม์เฟรม</p>")}${
      rows
        .filter((r) => !filter || r.frames.includes(filter))
        .map((r) => {
          const e = evidenceAtPath(bar, r.path, state.draft),
            depth = (r.path.match(/children|\.condition/g) ?? []).length;
          return `<article class="studio-condition-card ${r.path === focusPath ? "selected" : ""}" style="--condition-depth:${Math.min(depth, 3)}"><div><small>${esc(r.side)} · ${esc(r.section)}${r.condition.kind === "GROUP" ? ` · ${r.condition.op === "AND" ? (globalThis.SnaapI18n?.text("ครบทุกข้อ") ?? "ครบทุกข้อ") : (globalThis.SnaapI18n?.text("อย่างน้อยหนึ่งข้อ") ?? "อย่างน้อยหนึ่งข้อ")}` : r.condition.kind === "HOLD" ? (globalThis.SnaapI18n?.text(" · ต่อเนื่อง") ?? " · ต่อเนื่อง") : ""}</small><span class="studio-truth" data-truth="${e?.result ?? "PENDING"}">${valueLabel(e)}</span></div><p>${esc(r.condition.kind === "GROUP" ? `${r.condition.op === "AND" ? (globalThis.SnaapI18n?.text("ต้องผ่านครบ") ?? "ต้องผ่านครบ") : (globalThis.SnaapI18n?.text("ผ่านอย่างน้อยหนึ่งข้อจาก") ?? "ผ่านอย่างน้อยหนึ่งข้อจาก")} ${r.condition.children.length}${(globalThis.SnaapI18n?.text(" เงื่อนไข / กลุ่มด้านล่าง") ?? " เงื่อนไข / กลุ่มด้านล่าง")}` : conditionText(r.condition))}</p>${e?.left !== undefined ? `${(globalThis.SnaapI18n?.text("<small>ค่าที่ตรวจ ") ?? "<small>ค่าที่ตรวจ ")}${esc(Number(e.left).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"), { maximumFractionDigits: 6 }))}${(globalThis.SnaapI18n?.text(" · เทียบกับ ") ?? " · เทียบกับ ")}${e.right === undefined ? "—" : esc(Number(e.right).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"), { maximumFractionDigits: 6 }))}</small>` : ""}${e?.reason ? `<small>${esc(e.reason)}</small>` : ""}${
            bar?.references
              ? `<div class="studio-reference-times">${r.frames
                  .map((frame) => {
                    const ref = bar.references.find(
                      (x) => x.timeframe === frame,
                    );
                    return `<small>${esc(frame.toUpperCase())}: ${ref?.closedAt ? esc(new Date(ref.closedAt).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"))) : (globalThis.SnaapI18n?.text("ข้อมูลไม่พอ") ?? "ข้อมูลไม่พอ")}${ref?.stale ? (globalThis.SnaapI18n?.text(" · ข้อมูลขาดช่วง") ?? " · ข้อมูลขาดช่วง") : ""}</small>`;
                  })
                  .join("")}</div>`
              : ""
          }<div class="studio-condition-actions"><button type="button" data-studio-edit="${r.path}${(globalThis.SnaapI18n?.text("\">แก้</button><button type=\"button\" data-studio-view=\"") ?? "\">แก้</button><button type=\"button\" data-studio-view=\"")}${r.path}${(globalThis.SnaapI18n?.text("\">ดูกราฟ</button><button type=\"button\" data-studio-ask=\"") ?? "\">ดูกราฟ</button><button type=\"button\" data-studio-ask=\"")}${r.path}${(globalThis.SnaapI18n?.text("\">ถาม Snaap</button></div></article>") ?? "\">ถาม Snaap</button></div></article>")}`;
        })
        .join("") || (globalThis.SnaapI18n?.text("<p>ไม่มีเงื่อนไขในไทม์เฟรมนี้</p>") ?? "<p>ไม่มีเงื่อนไขในไทม์เฟรมนี้</p>")
    }${bar ? `${(globalThis.SnaapI18n?.text("<small>อ้างอิงแท่งตรวจ ") ?? "<small>อ้างอิงแท่งตรวจ ")}${esc(new Date(bar.time).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH")))}</small>` : ""}`;
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
      overlayEditor.innerHTML = `${(globalThis.SnaapI18n?.text("<header><h3>แก้เงื่อนไข · ") ?? "<header><h3>แก้เงื่อนไข · ")}${esc(row.section)}${(globalThis.SnaapI18n?.text("</h3><button type=\"button\" data-close-inspector aria-label=\"ปิดการแก้เงื่อนไข\">×</button></header>") ?? "</h3><button type=\"button\" data-close-inspector aria-label=\"ปิดการแก้เงื่อนไข\">×</button></header>")}${conditionUI(row.condition, row.path)}`;
    } else if (editorMode === "indicator") renderIndicatorEditor();
  }
  function decorate() {
    placeMobileActions();
    if (!state.draft) return;
    session();
    const supported = setupTimeframes();
    if (!supported.includes(view.frame)) {
      view.frame = supported.includes(state.draft.timeframe) ? state.draft.timeframe : supported[0];
      persist();
    }
    header.hidden = workbench.hidden || workbench.dataset.tab === "chat";
    tabsBar.hidden = workbench.hidden || (innerWidth >= 900 && workbench.dataset.tab === "chat");
    tabsBar.querySelectorAll("[data-studio-tab]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.studioTab === workbench.dataset.inspector)));
    draftStatus.hidden = header.hidden;
    panel.querySelector('[data-path="name"]')?.closest("label")?.append(draftStatus);
    draftStatus.textContent = state.saved
      ? (globalThis.SnaapI18n?.text("ร่าง · เวอร์ชัน ") ?? "ร่าง · เวอร์ชัน ") + state.saved.revision
      : (globalThis.SnaapI18n?.text("ร่างใหม่") ?? "ร่างใหม่");
    const savedMatchesDraft = Boolean(state.saved && JSON.stringify(comparableSpec(state.saved.spec)) === JSON.stringify(comparableSpec(state.draft)));
    const currentSetupActive = savedMatchesDraft && state.saved.active;
    const activationDisabled = !savedMatchesDraft || currentSetupActive;
    panel.querySelectorAll('[data-studio-activate]').forEach(button=>{
      button.disabled=activationDisabled;
      button.textContent=currentSetupActive ? (globalThis.SnaapI18n?.text("เปิดใช้งานแล้ว") ?? "เปิดใช้งานแล้ว") : (globalThis.SnaapI18n?.text("เปิดใช้งาน") ?? "เปิดใช้งาน");
      button.title=currentSetupActive ? (globalThis.SnaapI18n?.text("เซ็ตอัพนี้กำลังตรวจสัญญาณ") ?? "เซ็ตอัพนี้กำลังตรวจสัญญาณ") : activationDisabled ? (globalThis.SnaapI18n?.text("บันทึกเซ็ตอัพก่อนเปิดใช้งาน") ?? "บันทึกเซ็ตอัพก่อนเปิดใช้งาน") : (globalThis.SnaapI18n?.text("เปิดตรวจและแจ้งเตือนเซ็ตอัพนี้") ?? "เปิดตรวจและแจ้งเตือนเซ็ตอัพนี้");
    });
    if (!panel.querySelector(".studio-condition-overview")) {
      const body = panel.querySelector(".design-body");
      const settings = document.createElement("section");
      settings.className = "studio-setup-settings";
      settings.setAttribute("aria-label", (globalThis.SnaapI18n?.text("ตลาดและประเภทการเทรด") ?? "ตลาดและประเภทการเทรด"));
      const exchange = body.querySelector(".exchange-fieldset");
      const market = body.querySelector('[data-path="market"]')?.closest("label");
      const pair = body.querySelector(".pair-control");
      const direction = body.querySelector(".setup-direction, .setup-direction-spot");
      const name = body.querySelector('[data-path="name"]')?.closest("label");
      const frameSelect = body.querySelector('[data-path="timeframe"]');
      const evaluation = frameSelect?.closest("label");
      for (const field of [exchange, market, pair, direction])
        if (field) settings.append(field);
      body.querySelector(":scope > .field-grid")?.remove();
      body.prepend(settings);
      if (name) {
        name.classList.add("studio-name-field");
        settings.before(name);
      }
      const feedback = body.querySelector("#editor-feedback");
      if (feedback) body.prepend(feedback);
      const overview = document.createElement("section");
      overview.className = "studio-condition-overview";
      settings.after(overview);
      overview.after(overlayEditor);
      const details = document.createElement("details");
      details.className = "studio-setup-details";
      details.innerHTML = (globalThis.SnaapI18n?.text("<summary>รอบตรวจสัญญาณ</summary>") ?? "<summary>รอบตรวจสัญญาณ</summary>");
      if (evaluation) details.append(evaluation);
      overlayEditor.after(details);
      // The overview already shows the setup; keep the full review available on demand.
      const review = body.querySelector('.rule-review');
      if (review) {
        const currentView = session();
        review.open = Boolean(currentView.reviewOpen);
        review.ontoggle = () => { currentView.reviewOpen = review.open; };
      }
      body.querySelectorAll(":scope > .setup-section").forEach((section) => {
        const details = document.createElement("details");
        details.className = "studio-original-editor";
        details.innerHTML =
          (globalThis.SnaapI18n?.text("<summary>โครงสร้างเงื่อนไขเข้า · เพิ่ม / จัดกลุ่ม</summary>") ?? "<summary>โครงสร้างเงื่อนไขเข้า · เพิ่ม / จัดกลุ่ม</summary>");
        section.before(details);
        details.append(section);
      });
      if (frameSelect?.parentElement.firstChild)
        frameSelect.parentElement.firstChild.textContent =
          (globalThis.SnaapI18n?.text("ตรวจสัญญาณเมื่อแท่ง … ปิด") ?? "ตรวจสัญญาณเมื่อแท่ง … ปิด");
    }
    renderOverview();
    renderInspector();
    paintFrames();
    if (window.SnaapChart.frame !== view.frame)
      window.SnaapChart.view(view.frame);
  }
  function catalogEntries() {
    const essentials = ['STOCH_SMOOTH_K','STOCH_D','STOCH_RSI_K','STOCH_RSI_D','VWAP_SESSION','VWAP_ROLLING','OBV','ADX','DI_PLUS','DI_MINUS','PSAR','SUPERTREND_LINE','ICHIMOKU_TENKAN','ICHIMOKU_KIJUN','ICHIMOKU_SPAN_A','ICHIMOKU_SPAN_B'];
    return [indicatorCatalog.indicatorByName.VOLUME, ...basicIndicators, ...essentials.map(name => indicatorCatalog.indicatorByName[name]), ...indicatorCatalog.extendedIndicators.filter(d => d.name !== 'VOLUME' && !essentials.includes(d.name))];
  }
  function defaultOperand(name) {
    const d = indicatorCatalog.indicatorByName[name];
    const o = {
      kind: "INDICATOR",
      name,
      period:
        d?.params.find((p) => p.key === "period")?.value ??
        basicByName[name]?.period ?? 14,
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
      (globalThis.SnaapI18n?.text("<header><h2>เพิ่มอินดิเคเตอร์</h2><button type=\"button\" data-close-dialog aria-label=\"ปิด\">×</button></header><label>ค้นหาอินดิเคเตอร์<input type=\"search\" autofocus placeholder=\"EMA, RSI, แนวโน้ม…\"></label><p>เพิ่มเพื่อดูบนกราฟก่อน แล้วเลือกใช้สร้างเงื่อนไขได้</p><div class=\"studio-indicator-results\"></div>") ?? "<header><h2>เพิ่มอินดิเคเตอร์</h2><button type=\"button\" data-close-dialog aria-label=\"ปิด\">×</button></header><label>ค้นหาอินดิเคเตอร์<input type=\"search\" autofocus placeholder=\"EMA, RSI, แนวโน้ม…\"></label><p>เพิ่มเพื่อดูบนกราฟก่อน แล้วเลือกใช้สร้างเงื่อนไขได้</p><div class=\"studio-indicator-results\"></div>"),
      opener,
    );
    const paint = () => {
      const q = el.querySelector("input").value.toLowerCase();
      el.querySelector(".studio-indicator-results").innerHTML =
        catalogEntries()
          .filter((d) =>
            `${d.name} ${d.label ?? ""} ${d.description ?? ""}`
              .toLowerCase()
              .includes(q),
          )
          .map(
            (d) =>
              `<button type="button" data-pick-indicator="${d.name}"><strong>${esc(d.label ?? d.name)}</strong><small>${esc(d.description ?? d.unit ?? "")}</small></button>`,
          )
          .join("") || (globalThis.SnaapI18n?.text("<p>ไม่พบอินดิเคเตอร์ที่ระบบรองรับ</p>") ?? "<p>ไม่พบอินดิเคเตอร์ที่ระบบรองรับ</p>");
    };
    el.querySelector("input").oninput = paint;
    paint();
    el.onclick = (e) => {
      const b = e.target.closest("[data-pick-indicator]");
      if (!b) return;
      const v = session(),
        extras = (v.extras[v.frame] ??= []);
      if (extras.length >= 8) {
        toast((globalThis.SnaapI18n?.text("อินดิเคเตอร์สำหรับดูบนกราฟมีได้ 8 ตัวต่อไทม์เฟรม") ?? "อินดิเคเตอร์สำหรับดูบนกราฟมีได้ 8 ตัวต่อไทม์เฟรม"));
        return;
      }
      const o = defaultOperand(b.dataset.pickIndicator);
      v.hidden.delete(indicatorKey(o));
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
    const usesSource = d?.source ?? basicByName[selectedOperand.name]?.source ?? true;
    const params = d?.params ?? [
      { key: "period", label: (globalThis.SnaapI18n?.text("ระยะ (แท่ง)") ?? "ระยะ (แท่ง)"), min: 2, max: 500, integer: true },
      ...(selectedOperand.name.startsWith("MACD")
        ? [
            { key: "slow", label: (globalThis.SnaapI18n?.text("ระยะช้า") ?? "ระยะช้า"), min: 3, max: 500, integer: true },
            {
              key: "signal",
              label: (globalThis.SnaapI18n?.text("ระยะสัญญาณ") ?? "ระยะสัญญาณ"),
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
              label: (globalThis.SnaapI18n?.text("ส่วนเบี่ยงเบน") ?? "ส่วนเบี่ยงเบน"),
              min: 0.1,
              max: 10,
              integer: false,
            },
          ]
        : []),
    ];
    overlayEditor.innerHTML = `<header><h3>${esc(operandText(selectedOperand))}${(globalThis.SnaapI18n?.text("</h3><button type=\"button\" data-close-inspector aria-label=\"ปิดการตั้งค่า\">×</button></header><p class=\"studio-indicator-badge\">") ?? "</h3><button type=\"button\" data-close-inspector aria-label=\"ปิดการตั้งค่า\">×</button></header><p class=\"studio-indicator-badge\">")}${uses ? (globalThis.SnaapI18n?.text("ใช้ในเงื่อนไข ") ?? "ใช้ในเงื่อนไข ") + uses.conditions.length + (globalThis.SnaapI18n?.text(" จุด") ?? " จุด") : (globalThis.SnaapI18n?.text("ใช้ดูบนกราฟ · เก็บใน session") ?? "ใช้ดูบนกราฟ · เก็บใน session")}</p><form data-indicator-form><div class="studio-indicator-fields">${params.map((p) => `<label>${esc(p.label)}<input type="number" name="${p.key}" min="${p.min}" max="${p.max}" step="${p.integer ? "1" : "any"}" value="${selectedOperand[p.key] ?? selectedOperand.params?.[p.key] ?? p.value ?? 14}" required></label>`).join("")}${usesSource ? `${(globalThis.SnaapI18n?.text("<label>แหล่งราคา<select name=\"source\">") ?? "<label>แหล่งราคา<select name=\"source\">")}${options(["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"], selectedOperand.source ?? "close")}</select></label>` : ""}</div><p data-indicator-error role="status"></p><div class="studio-indicator-actions">${params.length || usesSource ? (globalThis.SnaapI18n?.text("<button type=\"submit\" class=\"secondary\">ใช้ค่าที่ปรับ</button>") ?? "<button type=\"submit\" class=\"secondary\">ใช้ค่าที่ปรับ</button>") : ""}<button type="button" data-indicator-visibility>${session().hidden.has(indicatorKey(selectedOperand)) ? (globalThis.SnaapI18n?.text("แสดงบนกราฟ") ?? "แสดงบนกราฟ") : (globalThis.SnaapI18n?.text("ซ่อนจากกราฟ") ?? "ซ่อนจากกราฟ")}${(globalThis.SnaapI18n?.text("</button><button type=\"button\" class=\"primary\" data-indicator-condition>ใช้สร้างเงื่อนไข</button>") ?? "</button><button type=\"button\" class=\"primary\" data-indicator-condition>ใช้สร้างเงื่อนไข</button>")}${!uses ? (globalThis.SnaapI18n?.text("<button type=\"button\" data-delete-chart-indicator>นำออกจากกราฟ</button>") ?? "<button type=\"button\" data-delete-chart-indicator>นำออกจากกราฟ</button>") : ""}</div></form>`;
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
      if (usesSource) next.source = form.elements.source.value;
      try {
        if (uses) {
          if (uses.paths.length > 1) {
            const el = dialog(
              `${(globalThis.SnaapI18n?.text("<header><h2>ปรับอินดิเคเตอร์ที่ใช้ร่วมกัน</h2><button type=\"button\" data-close-dialog aria-label=\"ปิด\">×</button></header><p>การปรับนี้จะเปลี่ยน ") ?? "<header><h2>ปรับอินดิเคเตอร์ที่ใช้ร่วมกัน</h2><button type=\"button\" data-close-dialog aria-label=\"ปิด\">×</button></header><p>การปรับนี้จะเปลี่ยน ")}${uses.conditions.length}${(globalThis.SnaapI18n?.text(" จุด</p><ul>") ?? " จุด</p><ul>")}${uses.conditions.map((path) => `<li>${esc(conditionText(at(path)))}</li>`).join("")}${(globalThis.SnaapI18n?.text("</ul><button type=\"button\" class=\"primary\" data-confirm-shared>ปรับทุกจุดที่ใช้ร่วมกัน</button>") ?? "</ul><button type=\"button\" class=\"primary\" data-confirm-shared>ปรับทุกจุดที่ใช้ร่วมกัน</button>")}`,
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
          if (i < 0) throw Error((globalThis.SnaapI18n?.text("รายการอินดิเคเตอร์เปลี่ยนแล้ว") ?? "รายการอินดิเคเตอร์เปลี่ยนแล้ว"));
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
      throw Error((globalThis.SnaapI18n?.text("ร่างเปลี่ยนแล้ว กรุณาเปิดตั้งค่าอินดิเคเตอร์ใหม่") ?? "ร่างเปลี่ยนแล้ว กรุณาเปิดตั้งค่าอินดิเคเตอร์ใหม่"));
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
      `${(globalThis.SnaapI18n?.text("<header><h2>ใช้สร้างเงื่อนไข</h2><button type=\"button\" data-close-dialog aria-label=\"ปิด\">×</button></header><p>") ?? "<header><h2>ใช้สร้างเงื่อนไข</h2><button type=\"button\" data-close-dialog aria-label=\"ปิด\">×</button></header><p>")}${esc(operandText(operand))}${(globalThis.SnaapI18n?.text("</p><form><label>เพิ่มใน<select name=\"target\">") ?? "</p><form><label>เพิ่มใน<select name=\"target\">")}${targets.map((r) => `<option value="${r.path}">${esc(r.side + " · " + r.section)}</option>`).join("")}${(globalThis.SnaapI18n?.text("</select></label><label>การเปรียบเทียบ<select name=\"op\">") ?? "</select></label><label>การเปรียบเทียบ<select name=\"op\">")}${options([">", ">=", "<", "<=", "CROSS_ABOVE", "CROSS_BELOW"], ">")}${(globalThis.SnaapI18n?.text("</select></label><label>เทียบกับ<select name=\"kind\"><option value=\"CONSTANT\">ตัวเลข</option><option value=\"PRICE\">ราคาปิดในไทม์เฟรมเดียวกัน</option></select></label><label data-threshold>ค่าที่เปรียบเทียบ<input name=\"value\" type=\"number\" step=\"any\" required></label><p class=\"field-note\">เพิ่มแบบครบทุกข้อ (AND) โดยคงกลุ่มและลำดับเดิม</p><p data-create-error role=\"status\"></p><button type=\"submit\" class=\"primary\">เพิ่มเงื่อนไข</button></form>") ?? "</select></label><label>เทียบกับ<select name=\"kind\"><option value=\"CONSTANT\">ตัวเลข</option><option value=\"PRICE\">ราคาปิดในไทม์เฟรมเดียวกัน</option></select></label><label data-threshold>ค่าที่เปรียบเทียบ<input name=\"value\" type=\"number\" step=\"any\" required></label><p class=\"field-note\">เพิ่มแบบครบทุกข้อ (AND) โดยคงกลุ่มและลำดับเดิม</p><p data-create-error role=\"status\"></p><button type=\"submit\" class=\"primary\">เพิ่มเงื่อนไข</button></form>")}`,
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
          throw Error((globalThis.SnaapI18n?.text("ร่างเปลี่ยนแล้ว กรุณาเปิดสร้างเงื่อนไขใหม่") ?? "ร่างเปลี่ยนแล้ว กรุณาเปิดสร้างเงื่อนไขใหม่"));
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
    if (!hasEntryCondition()) return;
    bar = e.detail.bar;
    renderOverview();
    reasonPane.innerHTML = `${(globalThis.SnaapI18n?.text("<h3>เหตุผลสัญญาณ</h3><p>กราฟ ") ?? "<h3>เหตุผลสัญญาณ</h3><p>กราฟ ")}${esc(view.frame.toUpperCase())}${(globalThis.SnaapI18n?.text(" · ตรวจบน ") ?? " · ตรวจบน ")}${esc(state.draft.timeframe.toUpperCase())}</p>${bar ? barEvidence(bar) : (globalThis.SnaapI18n?.text("<p>ข้อมูลไม่พอ · ยังไม่มีแท่งตรวจที่ปิดแล้ว ณ จุดนี้</p>") ?? "<p>ข้อมูลไม่พอ · ยังไม่มีแท่งตรวจที่ปิดแล้ว ณ จุดนี้</p>")}${bar?.branches?.map((b) => (b.cancel ? (globalThis.SnaapI18n?.text("<p>ยกเลิก</p>") ?? "<p>ยกเลิก</p>") + evidenceUI(b.cancel) : "")).join("") ?? ""}${(globalThis.SnaapI18n?.text("<button type=\"button\" data-ask-bar>ถาม Snaap เกี่ยวกับแท่งนี้</button>") ?? "<button type=\"button\" data-ask-bar>ถาม Snaap เกี่ยวกับแท่งนี้</button>")}`;
    const data = window.SnaapChart.data;
    eventList.hidden =
      !data || data.chartTimeframe === data.evaluationTimeframe;
    if (data)
      eventList.innerHTML = `${(globalThis.SnaapI18n?.text("<small>สัญญาณประเมินบน ") ?? "<small>สัญญาณประเมินบน ")}${esc(data.evaluationTimeframe.toUpperCase())}${(globalThis.SnaapI18n?.text(" · เปิดกรอบเวลาตรวจเพื่อดูตำแหน่งจริง</small>") ?? " · เปิดกรอบเวลาตรวจเพื่อดูตำแหน่งจริง</small>")}${data.events
        .slice(-8)
        .reverse()
        .map(
          (ev) =>
            `<button type="button" data-open-event="${ev.time}">${esc({ ENTRY: (globalThis.SnaapI18n?.text("เข้า") ?? "เข้า"), EXIT: (globalThis.SnaapI18n?.text("ออก") ?? "ออก"), CANCEL: (globalThis.SnaapI18n?.text("ยกเลิก") ?? "ยกเลิก"), EXPIRED: (globalThis.SnaapI18n?.text("หมดเวลา") ?? "หมดเวลา") }[ev.kind])} · ${esc(new Date(ev.time).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH")))}</button>`,
        )
        .join("")}`;
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.studioTab) selectTab(b.dataset.studioTab);
    if (b.dataset.chartFrame) setView(b.dataset.chartFrame);
    if (b.hasAttribute("data-add-chart-indicator")) addIndicator(b);
    if (b.dataset.removeChartIndicator !== undefined) {
      const operand = window.SnaapChart.data?.overlays[Number(b.dataset.removeChartIndicator)]?.operand;
      if (operand) {
        const key = indicatorKey(operand);
        view.extras[operand.timeframe] = (view.extras[operand.timeframe] ?? []).filter(o => indicatorKey(o) !== key);
        session().hidden.add(key);
        persist();
        if (selectedOperand && indicatorKey(selectedOperand) === key) {
          selectedOperand = null;
          editorMode = null;
          overlayEditor.hidden = true;
        }
        b.closest('.studio-legend-chip')?.remove();
        window.SnaapChart.visibility();
        window.SnaapChart.refresh();
      }
    }
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
        (globalThis.SnaapI18n?.text("ช่วยอธิบายและตรวจเงื่อนไขนี้: ") ?? "ช่วยอธิบายและตรวจเงื่อนไขนี้: ") + conditionText(at(focusPath));
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
      setRuleActivation(state.saved, b, true).catch(error => toast(error.message));
    }
    if (b.hasAttribute("data-ask-bar")) {
      selectTab("agent");
      $("#followup-input").value =
        (globalThis.SnaapI18n?.text("ช่วยตรวจเหตุผลของสัญญาณ ณ แท่งที่เลือกบนกราฟ") ?? "ช่วยตรวจเหตุผลของสัญญาณ ณ แท่งที่เลือกบนกราฟ");
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
    if (innerWidth < 900 && !workbench.hidden && workbench.dataset.tab === "chat") setWorkbenchTab("chat");
    placeMobileActions();
    if (innerWidth >= 900 && workbench.dataset.inspector === "chart") selectTab("conditions");
    tabsBar.hidden = workbench.hidden || (innerWidth >= 900 && workbench.dataset.tab === "chat");
    document.documentElement.style.setProperty(
      "--studio-viewport-height",
      height + "px",
    );
  };
  window.visualViewport?.addEventListener("resize", viewport);
  window.addEventListener("resize", viewport);
  viewport();
  if (state.draft) decorate();
  else header.hidden = tabsBar.hidden = draftStatus.hidden = true;
})();
