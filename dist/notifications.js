"use strict";
let notificationSection = "rules";
const notificationRules = document.querySelector("#view-watch");
notificationRules.className = "notification-rules";
function parkNotificationRules() {
  notificationRules.hidden = true;
  document.querySelector("#main").append(notificationRules);
}
let notificationData;
let notificationWorkspace;
let notificationLoadedAt = 0;
let notificationFlight;
let notificationRequest = 0;
let notificationOverviewFilter = 'all';
const channelInfo = {
  TELEGRAM: {
    name: "Telegram",
    logo: "/assets/brands/telegram.svg",
    icon: "send",
    detail: (globalThis.SnaapI18n?.text("รับสัญญาณผ่าน Telegram bot") ?? "รับสัญญาณผ่าน Telegram bot"),
  },
  LINE: {
    name: "LINE",
    logo: "/assets/brands/line.png",
    icon: "bell",
    detail: (globalThis.SnaapI18n?.text("รับสัญญาณผ่าน LINE Official Account") ?? "รับสัญญาณผ่าน LINE Official Account"),
  },
  DISCORD: {name:"Discord",logo:"/assets/brands/discord.svg",icon:"send",detail:(globalThis.SnaapI18n?.text("ส่งสัญญาณเข้าห้อง Discord ที่คุณเลือก") ?? "ส่งสัญญาณเข้าห้อง Discord ที่คุณเลือก")},
  WEBHOOK: {
    name: "Webhook",
    icon: "link",
    detail: (globalThis.SnaapI18n?.text("ส่งสัญญาณไปยังระบบของคุณ") ?? "ส่งสัญญาณไปยังระบบของคุณ"),
  },
};
const deliveryLabels = {
  SENT: (globalThis.SnaapI18n?.text("ส่งแล้ว") ?? "ส่งแล้ว"),
  PENDING: (globalThis.SnaapI18n?.text("รอส่ง") ?? "รอส่ง"),
  RETRY: (globalThis.SnaapI18n?.text("รอส่งใหม่") ?? "รอส่งใหม่"),
  FAILED: (globalThis.SnaapI18n?.text("ส่งไม่สำเร็จ") ?? "ส่งไม่สำเร็จ"),
  CANCELLED: (globalThis.SnaapI18n?.text("ยกเลิก · เซ็ตอัพถูกลบ") ?? "ยกเลิก · เซ็ตอัพถูกลบ"),
  UNKNOWN: (globalThis.SnaapI18n?.text("ยังยืนยันผลไม่ได้") ?? "ยังยืนยันผลไม่ได้"),
  QUOTA_OR_RATE_LIMIT: (globalThis.SnaapI18n?.text("ถึงขีดจำกัดการส่ง") ?? "ถึงขีดจำกัดการส่ง"),
  DISCONNECTED: (globalThis.SnaapI18n?.text("ช่องทางถูกตัดการเชื่อมต่อ") ?? "ช่องทางถูกตัดการเชื่อมต่อ"),
};
function notificationTime(value) {
  if (value == null || value === "") return (globalThis.SnaapI18n?.text("ยังไม่ได้ตรวจ") ?? "ยังไม่ได้ตรวจ");
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? (globalThis.SnaapI18n?.text("ยังไม่มีเวลาตรวจ") ?? "ยังไม่มีเวลาตรวจ")
    : date.toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"), {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function limitedActivity(rows, render) {
  return `<div class="overview-list">${rows.map((row, i) => `<div data-overview-item ${i >= 5 ? "hidden" : ""}>${render(row)}</div>`).join("")}${rows.length > 5 ? `${(globalThis.SnaapI18n?.text("<button type=\"button\" class=\"text-button overview-more\" data-overview-more>ดูเพิ่มอีก ") ?? "<button type=\"button\" class=\"text-button overview-more\" data-overview-more>ดูเพิ่มอีก ")}${Math.min(5, rows.length - 5)}${(globalThis.SnaapI18n?.text(" รายการ (") ?? " รายการ (")}${rows.length - 5}${(globalThis.SnaapI18n?.text(" รายการที่เหลือ)</button>") ?? " รายการที่เหลือ)</button>")}` : ""}</div>`;
}
function overviewTag(label, tone = "neutral", icon = "") {
  return `<span class="overview-tag overview-tag-${tone}">${icon ? uiIcon(icon) : ""}<span>${esc(label)}</span></span>`;
}
function overviewLifecycle(state, side = "") {
  const tone = state.active
    ? "success"
    : state.stage >= 0
      ? "pending"
      : "neutral";
  const direction = {
    Long: ["long", "trendUp"],
    Short: ["short", "trendDown"],
    Spot: ["spot", "spotBuy"],
  }[side];
  return `<span class="overview-lifecycle">${direction ? `<span class="overview-direction overview-direction-${direction[0]}">${uiIcon(direction[1])}${esc(side)}</span>` : ""}${overviewTag(notificationOverview.lifecycleLabel(state), tone, state.active ? "check" : "clock")}</span>`;
}
function marketActivity(row) {
  const summary = notificationOverview.marketSummary(row);
  const problem = summary.attention;
  const state = row.state;
  const status = problem
    ? overviewTag(summary.label, "warning", "alert")
    : !["READY", "CURRENT"].includes(row.status)
      ? overviewTag(summary.label, row.status === "PAUSED" ? "neutral" : "pending", row.status === "PAUSED" ? "pause" : "clock")
      : state?.sides
        ? `<div class="overview-branches">${overviewLifecycle(state.sides.long, "Long")}${overviewLifecycle(state.sides.short, "Short")}</div>`
        : state
          ? overviewLifecycle(
              state,
              row.setup_market === "Spot"
                ? "Spot"
                : { LONG: "Long", SHORT: "Short" }[row.setup_side],
            )
          : overviewTag((globalThis.SnaapI18n?.text("ข้อมูลพร้อม") ?? "ข้อมูลพร้อม"), "success", "check");
  return `<article class="overview-market-row ${problem ? "overview-row-attention" : ""}">
    <div class="overview-row-body"><div class="overview-market-header"><div class="overview-row-heading"><span class="overview-row-symbol ${problem ? "overview-symbol-warning" : ""}">${uiIcon(problem ? "alert" : "chart")}</span><h3>${esc(row.pair)}</h3>${overviewTag(row.exchange)}</div><time class="overview-check-time">${uiIcon("clock")}${esc(notificationTime(row.checked_at))}</time></div>
      <p class="overview-setup-name" title="${esc(row.setup_name || (globalThis.SnaapI18n?.text("เซตอัป") ?? "เซตอัป"))}">${esc(row.setup_name || (globalThis.SnaapI18n?.text("เซตอัป") ?? "เซตอัป"))}</p>
      <div class="overview-row-tags">${status}</div>
      ${problem ? `<p class="overview-action-hint">${esc(summary.detail)}</p>` : ""}
      ${problem && ["QUOTA_BLOCKED", "DIRECTION_REQUIRED"].includes(row.status) ? (globalThis.SnaapI18n?.text("<div class=\"overview-row-footer\"><button type=\"button\" class=\"text-button\" data-notification-tab=\"rules\">แก้ไขเซ็ตอัพ") ?? "<div class=\"overview-row-footer\"><button type=\"button\" class=\"text-button\" data-notification-tab=\"rules\">แก้ไขเซ็ตอัพ") + uiIcon("arrow") + "</button></div>" : ""}
      ${marketInsightDetails(row)}
    </div></article>`;
}
function marketInsightDetails(row) {
  const frames = row.freshness ?? [];
  const progress = row.progress ?? [];
  if (!frames.length && !progress.length) return "";
  return `${(globalThis.SnaapI18n?.text("<details class=\"overview-market-details\"><summary>ดูข้อมูลตลาดและเงื่อนไข ") ?? "<details class=\"overview-market-details\"><summary>ดูข้อมูลตลาดและเงื่อนไข ")}${uiIcon("chevronDown")}</summary>
    ${frames.length ? `${(globalThis.SnaapI18n?.text("<div class=\"overview-frame-tags\" aria-label=\"ความพร้อมแต่ละกรอบเวลา\">") ?? "<div class=\"overview-frame-tags\" aria-label=\"ความพร้อมแต่ละกรอบเวลา\">")}${frames.map(frame => overviewTag(`${frame.frame} · ${freshnessLabels[frame.status] ?? frame.status}`, ["CURRENT", "READY"].includes(frame.status) ? "success" : "pending")).join("")}</div>` : ""}
    ${progress.map(item => `<section class="overview-progress-detail"><h4>${overviewTag(item.side, {LONG:"long", SHORT:"short", SPOT:"spot"}[item.side] ?? "neutral")}</h4>${progressUI(item)}${item.explanations?.length ? `${(globalThis.SnaapI18n?.text("<details class=\"overview-technical\"><summary>ดูเงื่อนไข ") ?? "<details class=\"overview-technical\"><summary>ดูเงื่อนไข ")}${item.explanations.length}${(globalThis.SnaapI18n?.text(" ข้อ</summary>") ?? " ข้อ</summary>")}${explanationsUI(item.explanations)}</details>` : ""}</section>`).join("")}
  </details>`;
}
function deliveryActivity(row) {
  const event = row.event ?? {};
  const kind =
    { ENTRY: (globalThis.SnaapI18n?.text("เข้า") ?? "เข้า"), EXIT: (globalThis.SnaapI18n?.text("ออก") ?? "ออก"), CANCEL: (globalThis.SnaapI18n?.text("ยกเลิก") ?? "ยกเลิก"), EXPIRED: (globalThis.SnaapI18n?.text("หมดเวลารอ") ?? "หมดเวลารอ") }[
      event.kind
    ] ?? (globalThis.SnaapI18n?.text("สัญญาณ") ?? "สัญญาณ");
  const appearance = signalAppearance({ ...row, event });
  const side = signalDirection(event, row.setup_market, row.setup_side);
  const tone =
    row.status === "SENT"
      ? "success"
      : ["PENDING", "RETRY"].includes(row.status)
        ? "pending"
        : row.status === "FAILED"
          ? "danger"
          : "warning";
  const action = {
    UNKNOWN: (globalThis.SnaapI18n?.text("ตรวจข้อความที่ปลายทางเพื่อยืนยัน") ?? "ตรวจข้อความที่ปลายทางเพื่อยืนยัน"),
    FAILED: (globalThis.SnaapI18n?.text("ตรวจการเชื่อมต่อของช่องทาง") ?? "ตรวจการเชื่อมต่อของช่องทาง"),
    DISCONNECTED: (globalThis.SnaapI18n?.text("เชื่อมช่องทางใหม่เพื่อรับสัญญาณถัดไป") ?? "เชื่อมช่องทางใหม่เพื่อรับสัญญาณถัดไป"),
    QUOTA_OR_RATE_LIMIT: (globalThis.SnaapI18n?.text("ตรวจโควตาของช่องทาง") ?? "ตรวจโควตาของช่องทาง"),
    RETRY: (globalThis.SnaapI18n?.text("ระบบจะลองส่งใหม่") ?? "ระบบจะลองส่งใหม่"),
    PENDING: (globalThis.SnaapI18n?.text("กำลังรอส่งจากคิว") ?? "กำลังรอส่งจากคิว"),
  }[row.status];
  return `<article class="overview-delivery-row ${["danger", "warning"].includes(tone) ? "overview-row-attention" : ""}">
    <span class="overview-row-symbol signal-tone-${appearance.tone}">${uiIcon(appearance.icon)}</span>
    <div class="overview-row-body"><div class="overview-row-heading"><h3>${esc(row.pair || (globalThis.SnaapI18n?.text("สัญญาณ") ?? "สัญญาณ"))}</h3>${overviewTag(row.exchange || (globalThis.SnaapI18n?.text("ตลาด") ?? "ตลาด"))}</div>
      <div class="overview-row-tags">${overviewTag(side, appearance.direction)}${overviewTag(kind)}</div>
      <p class="overview-setup-name">${esc(row.setup_name || (globalThis.SnaapI18n?.text("ไม่พบชื่อเซตอัป") ?? "ไม่พบชื่อเซตอัป"))}${(globalThis.SnaapI18n?.text("</p>\n      <time class=\"overview-event-time\" title=\"เวลาที่เกิดสัญญาณ\">") ?? "</p>\n      <time class=\"overview-event-time\" title=\"เวลาที่เกิดสัญญาณ\">")}${uiIcon("clock")}${esc(notificationTime(event.time || row.signal_created_at))}</time>
      ${action ? `<p class="overview-action-hint">${esc(action)}</p>` : ""}
      ${row.detail && row.status !== "SENT" ? `${(globalThis.SnaapI18n?.text("<details class=\"overview-technical\"><summary>ข้อมูลสำหรับตรวจสอบ</summary><p>") ?? "<details class=\"overview-technical\"><summary>ข้อมูลสำหรับตรวจสอบ</summary><p>")}${esc(row.detail)}</p></details>` : ""}
    </div><div class="overview-delivery-status">${overviewTag(deliveryLabels[row.status] ?? row.status, tone, tone === "success" ? "check" : tone === "pending" ? "clock" : "alert")}</div></article>`;
}
function overviewChannel(group) {
  const info = channelInfo[group.kind];
  const rows =
    notificationOverviewFilter === "attention"
      ? group.rows.filter(
          (row) => !["SENT", "PENDING", "RETRY"].includes(row.status),
        )
      : group.rows;
  return `<details class="overview-channel" ${group.attention ? "open" : ""}>
    <summary><span class="overview-channel-logo" aria-hidden="true">${info?.logo ? `<img src="${info.logo}" alt="" width="24" height="24">` : uiIcon("send")}</span>
      <span class="overview-channel-name"><strong>${esc(group.name)}</strong><small>${esc(info?.name || group.kind || (globalThis.SnaapI18n?.text("ช่องทางรับข้อความ") ?? "ช่องทางรับข้อความ"))}</small></span>
      <span class="overview-channel-counts">${group.attention ? overviewTag(`${(globalThis.SnaapI18n?.text("ตรวจสอบ ") ?? "ตรวจสอบ ")}${group.attention}`, "warning", "alert") : ""}${group.pending ? overviewTag(`${(globalThis.SnaapI18n?.text("รอส่ง ") ?? "รอส่ง ")}${group.pending}`, "pending", "clock") : ""}${overviewTag(`${(globalThis.SnaapI18n?.text("ส่งแล้ว ") ?? "ส่งแล้ว ")}${group.sent}`, "success", "check")}</span>
      <span class="overview-chevron">${uiIcon("chevronDown")}</span></summary>
    ${limitedActivity(rows, deliveryActivity)}</details>`;
}
function notificationActivity(monitor, deliveries) {
  const attention = monitor.filter(
    (row) => notificationOverview.marketSummary(row).attention,
  );
  const ready = monitor.filter((row) => ["READY", "CURRENT"].includes(row.status)).length;
  const paused = monitor.filter((row) => row.status === "PAUSED").length;
  const groups = notificationOverview.deliveryGroups(deliveries);
  const problems =
    attention.length + groups.reduce((sum, group) => sum + group.attention, 0);
  const sent = groups.reduce((sum, group) => sum + group.sent, 0);
  const pending = groups.reduce((sum, group) => sum + group.pending, 0);
  const onlyAttention = notificationOverviewFilter === "attention";
  const marketRows = onlyAttention
    ? attention
    : [
        ...attention,
        ...monitor.filter(
          (row) => !notificationOverview.marketSummary(row).attention,
        ),
      ];
  const channelGroups = onlyAttention
    ? groups.filter((group) => group.attention)
    : groups;
  const hasActivity = monitor.length || deliveries.length;
  const healthTag = problems
    ? overviewTag((globalThis.SnaapI18n?.text("ต้องตรวจสอบ") ?? "ต้องตรวจสอบ"), "warning", "alert")
    : hasActivity
      ? overviewTag((globalThis.SnaapI18n?.text("ปกติ") ?? "ปกติ"), "success", "check")
      : overviewTag((globalThis.SnaapI18n?.text("ยังไม่เริ่ม") ?? "ยังไม่เริ่ม"), "neutral", "clock");
  return `${(globalThis.SnaapI18n?.text("<div class=\"overview-toolbar\">\n      <div class=\"overview-filters\" aria-label=\"กรองรายการในภาพรวม\"><button type=\"button\" data-overview-filter=\"all\" aria-pressed=\"") ?? "<div class=\"overview-toolbar\">\n      <div class=\"overview-filters\" aria-label=\"กรองรายการในภาพรวม\"><button type=\"button\" data-overview-filter=\"all\" aria-pressed=\"")}${!onlyAttention}${(globalThis.SnaapI18n?.text("\">ทั้งหมด</button><button type=\"button\" data-overview-filter=\"attention\" aria-pressed=\"") ?? "\">ทั้งหมด</button><button type=\"button\" data-overview-filter=\"attention\" aria-pressed=\"")}${onlyAttention}">${uiIcon("alert")}${(globalThis.SnaapI18n?.text("ต้องตรวจสอบ<span class=\"overview-filter-count\">") ?? "ต้องตรวจสอบ<span class=\"overview-filter-count\">")}${problems}${(globalThis.SnaapI18n?.text("</span></button></div>\n      <div class=\"overview-summary\" aria-label=\"สรุปสถานะ\">") ?? "</span></button></div>\n      <div class=\"overview-summary\" aria-label=\"สรุปสถานะ\">")}${healthTag}${(globalThis.SnaapI18n?.text("\n        <span class=\"overview-inline-stat\" title=\"ข้อมูลพร้อมจากรายการติดตามทั้งหมด\">") ?? "\n        <span class=\"overview-inline-stat\" title=\"ข้อมูลพร้อมจากรายการติดตามทั้งหมด\">")}${uiIcon("chart")}${(globalThis.SnaapI18n?.text("ตลาดพร้อม <strong>") ?? "ตลาดพร้อม <strong>")}${ready}<small> / ${monitor.length}</small></strong></span>
        <span class="overview-inline-stat">${uiIcon("send")}${(globalThis.SnaapI18n?.text("ส่งแล้ว <strong>") ?? "ส่งแล้ว <strong>")}${sent}<small> / ${deliveries.length}</small></strong></span>
        ${pending ? overviewTag((globalThis.SnaapI18n?.text("รอส่ง ") ?? "รอส่ง ") + pending, "pending", "clock") : ""}${(globalThis.SnaapI18n?.text("\n      </div>\n    </div>\n    <div class=\"overview-columns\"><section class=\"overview-panel\" aria-label=\"การติดตามตลาด\"><div class=\"notification-section-heading\"><h2>") ?? "\n      </div>\n    </div>\n    <div class=\"overview-columns\"><section class=\"overview-panel\" aria-label=\"การติดตามตลาด\"><div class=\"notification-section-heading\"><h2>")}${uiIcon("chart")}${(globalThis.SnaapI18n?.text("การติดตามตลาด</h2><span class=\"overview-heading-counts\">") ?? "การติดตามตลาด</h2><span class=\"overview-heading-counts\">")}${overviewTag(`${marketRows.length}${(globalThis.SnaapI18n?.text(" รายการ") ?? " รายการ")}`)}${paused && !onlyAttention ? overviewTag(`${(globalThis.SnaapI18n?.text("พัก ") ?? "พัก ")}${paused}`, "neutral", "pause") : ""}</span></div>
      <div class="overview-surface">${marketRows.length ? limitedActivity(marketRows, marketActivity) : `<div class="overview-empty">${uiIcon(onlyAttention ? "check" : "chart")}<h3>${onlyAttention ? (globalThis.SnaapI18n?.text("ไม่มีรายการที่ต้องแก้ไข") ?? "ไม่มีรายการที่ต้องแก้ไข") : (globalThis.SnaapI18n?.text("ยังไม่ได้ติดตามตลาด") ?? "ยังไม่ได้ติดตามตลาด")}</h3>${onlyAttention ? "" : (globalThis.SnaapI18n?.text("<button class=\"secondary\" data-notification-tab=\"rules\">เปิดเซตอัป</button>") ?? "<button class=\"secondary\" data-notification-tab=\"rules\">เปิดเซตอัป</button>")}</div>`}</div>
      ${marketRows.length && !onlyAttention ? (globalThis.SnaapI18n?.text("<p class=\"overview-footnote\">ข้อมูลพร้อม = ตรวจตลาดได้ · ดูสัญญาณเข้า/ออกในแท็บสัญญาณ</p>") ?? "<p class=\"overview-footnote\">ข้อมูลพร้อม = ตรวจตลาดได้ · ดูสัญญาณเข้า/ออกในแท็บสัญญาณ</p>") : ""}${(globalThis.SnaapI18n?.text("\n    </section><section class=\"overview-panel\" aria-label=\"การส่งแจ้งเตือน\"><div class=\"notification-section-heading\"><h2>") ?? "\n    </section><section class=\"overview-panel\" aria-label=\"การส่งแจ้งเตือน\"><div class=\"notification-section-heading\"><h2>")}${uiIcon("send")}${(globalThis.SnaapI18n?.text("การส่งแจ้งเตือน</h2>") ?? "การส่งแจ้งเตือน</h2>")}${overviewTag(`${channelGroups.length}${(globalThis.SnaapI18n?.text(" ช่องทาง") ?? " ช่องทาง")}`)}</div><p class="overview-history-scope">${deliveries.length === 100 ? (globalThis.SnaapI18n?.text("ประวัติส่ง 100 รายการล่าสุด") ?? "ประวัติส่ง 100 รายการล่าสุด") : `${(globalThis.SnaapI18n?.text("ประวัติส่ง ") ?? "ประวัติส่ง ")}${deliveries.length}${(globalThis.SnaapI18n?.text(" รายการ") ?? " รายการ")}`}</p>
      ${channelGroups.length ? channelGroups.map(overviewChannel).join("") : `<div class="overview-surface overview-empty">${uiIcon(onlyAttention ? "check" : "send")}<h3>${onlyAttention ? (globalThis.SnaapI18n?.text("ไม่มีข้อความที่ต้องตรวจสอบ") ?? "ไม่มีข้อความที่ต้องตรวจสอบ") : (globalThis.SnaapI18n?.text("ยังไม่มีการส่งข้อความ") ?? "ยังไม่มีการส่งข้อความ")}</h3><p>${onlyAttention ? "" : (globalThis.SnaapI18n?.text("สัญญาณยังดูในเว็บได้เสมอ") ?? "สัญญาณยังดูในเว็บได้เสมอ")}</p></div>`}
      ${problems && channelGroups.length ? (globalThis.SnaapI18n?.text("<button class=\"text-button overview-channel-action\" data-notification-tab=\"channels\">จัดการช่องทาง") ?? "<button class=\"text-button overview-channel-action\" data-notification-tab=\"channels\">จัดการช่องทาง") + uiIcon("arrow") + "</button>" : ""}
    </section></div>`;
}
function signalAppearance(row) {
  const side=row.event.side ?? ((row.event.market ?? row.setup_market)==='Spot'?'SPOT':row.setup_side);
  const direction={LONG:'long',SHORT:'short',SPOT:'spot'}[side] ?? 'unknown';
  const kind=row.event.kind;
  return {direction, tone:kind==='CANCEL'||kind==='EXPIRED'?'waiting':direction,
    icon:kind==='EXIT'?'exit':kind==='CANCEL'?'close':kind==='EXPIRED'?'clock':{long:'trendUp',short:'trendDown',spot:'spotBuy',unknown:'chart'}[direction]};
}
function signalValidity(deadline, now = Date.now()) {
  if (typeof deadline !== 'number' || !Number.isSafeInteger(deadline) || deadline <= 0)
    return { state: 'unknown', label: '' };
  return now < deadline
    ? { state: 'valid', label: (globalThis.SnaapI18n?.text("สัญญาณมีผล") ?? "สัญญาณมีผล") }
    : { state: 'expired', label: (globalThis.SnaapI18n?.text("สัญญาณหมดอายุ") ?? "สัญญาณหมดอายุ") };
}
function signalDeadline(row) {
  return row.signal_valid_until ?? (row.event.kind === 'ENTRY' ? row.entry_valid_until : null);
}
function canDisplaySignal(row) {
  return !['ENTRY', 'EXIT'].includes(row.event.kind) || signalValidity(signalDeadline(row)).state !== 'unknown';
}
function signalValidityTag(row) {
  if (!['ENTRY', 'EXIT'].includes(row.event.kind)) return '';
  const validUntil = signalDeadline(row);
  const validity = signalValidity(validUntil);
  if (validity.state === 'unknown') return '';
  const deadline = validUntil;
  const title = (globalThis.SnaapI18n?.text("มีผลถึง ") ?? "มีผลถึง ") + new Date(deadline).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"), { timeZone: 'Asia/Bangkok' }) + (globalThis.SnaapI18n?.text(" · ตามรอบตรวจของเซ็ตอัพ") ?? " · ตามรอบตรวจของเซ็ตอัพ");
  return `<span class="signal-validity" data-valid-until="${deadline}" data-state="${validity.state}" title="${esc(title)}"><span class="signal-validity-dot" aria-hidden="true"></span><span class="signal-validity-label">${validity.label}</span></span>`;
}
let signalValidityTimer;
function refreshSignalValidity() {
  clearTimeout(signalValidityTimer);
  if (document.hidden) return;
  const now = Date.now();
  let next = Infinity;
  document.querySelectorAll('#view-notifications [data-valid-until]').forEach(tag => {
    const deadline = tag.dataset.validUntil === '' ? null : Number(tag.dataset.validUntil);
    const validity = signalValidity(deadline, now);
    tag.dataset.state = validity.state;
    tag.querySelector('.signal-validity-label').textContent = validity.label;
    if (validity.state === 'valid') next = Math.min(next, deadline);
  });
  if (next !== Infinity)
    signalValidityTimer = setTimeout(refreshSignalValidity, Math.min(next - now, 2147483647));
}
document.addEventListener('visibilitychange', refreshSignalValidity);
window.addEventListener('pageshow', refreshSignalValidity);
function signalPrice(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '')
    return '<strong>—</strong>';
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return '<strong>—</strong>';
  const full = price.toLocaleString('en-US', { useGrouping: false, maximumSignificantDigits: 21 });
  const match = full.match(/^0\.(0{4,})([1-9]\d*)$/);
  const label = match
    ? '0.0' + String(match[1].length).replace(/\d/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)]) + match[2]
    : price.toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"), { maximumSignificantDigits: 21 });
  return `<button type="button" class="signal-price-copy" data-signal-price-copy="${esc(full)}${(globalThis.SnaapI18n?.text("\" title=\"ราคาเต็ม ") ?? "\" title=\"ราคาเต็ม ")}${esc(full)}${(globalThis.SnaapI18n?.text(" · คลิกเพื่อคัดลอก\" aria-label=\"คัดลอกราคาเต็ม ") ?? " · คลิกเพื่อคัดลอก\" aria-label=\"คัดลอกราคาเต็ม ")}${esc(full)}"><strong>${esc(label)}</strong></button>`;
}
function signalCard(row) {
  if (!canDisplaySignal(row)) return '';
  const appearance=signalAppearance(row),directionLabel=signalDirection(row.event,row.setup_market,row.setup_side);
  const expired=row.event.kind==='EXPIRED';
  const label=expired ? `${(globalThis.SnaapI18n?.text("รอเข้า ") ?? "รอเข้า ")}${directionLabel}` : directionLabel;
  const setupName = row.setup_name?.trim() || (globalThis.SnaapI18n?.text("ไม่พบชื่อเซ็ตอัพ") ?? "ไม่พบชื่อเซ็ตอัพ");
  const kindLabel={ENTRY:(globalThis.SnaapI18n?.text("สัญญาณเข้า") ?? "สัญญาณเข้า"),EXIT:(globalThis.SnaapI18n?.text("สัญญาณออก") ?? "สัญญาณออก"),CANCEL:(globalThis.SnaapI18n?.text("ยกเลิก") ?? "ยกเลิก"),EXPIRED:(globalThis.SnaapI18n?.text("หมดเวลารอ") ?? "หมดเวลารอ")}[row.event.kind] ?? row.event.kind;
  const meta=expired ? (row.event.evidence?.reason && row.event.evidence.reason!=='หมดเวลารอ' ? row.event.evidence.reason : `${(globalThis.SnaapI18n?.text("เซ็ตอัพ: ") ?? "เซ็ตอัพ: ")}${setupName}`) : `${(globalThis.SnaapI18n?.text("เซ็ตอัพ: ") ?? "เซ็ตอัพ: ")}${setupName}`;
  const metaTitle=expired ? `${setupName} · ${meta}` : meta;
  const stamp=new Date(row.event.time);
  const formattedTime=stamp.toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"),{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  return `<article class="signal-item signal-${appearance.direction}" data-signal-kind="${esc(row.event.kind)}"><span class="signal-symbol signal-tone-${appearance.tone}" aria-hidden="true">${uiIcon(appearance.icon)}</span><div class="signal-details"><div class="signal-heading"><h2>${esc(row.pair)} <span>${esc(row.exchange)}</span></h2><span class="signal-side signal-tone-${appearance.direction}">${esc(label)}</span>${signalValidityTag(row)}</div><p class="signal-meta"><span>${esc(kindLabel)}</span><span class="signal-meta-dot" aria-hidden="true">·</span><span class="signal-setup-name" title="${esc(metaTitle)}">${esc(meta)}</span></p></div><div class="signal-price">${signalPrice(row.event.referencePrice)}${(globalThis.SnaapI18n?.text("<small>ราคาอ้างอิง</small></div><time datetime=\"") ?? "<small>ราคาอ้างอิง</small></div><time datetime=\"")}${stamp.toISOString()}" title="${esc(stamp.toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"),{timeZone:'Asia/Bangkok'}))}">${esc(formattedTime)}</time>${row.event.recovered?(globalThis.SnaapI18n?.text("<small class=\"signal-recovery\">สัญญาณย้อนหลังจากการกู้คืนข้อมูล · ไม่ส่งแจ้งเตือน</small>") ?? "<small class=\"signal-recovery\">สัญญาณย้อนหลังจากการกู้คืนข้อมูล · ไม่ส่งแจ้งเตือน</small>"):''}</article>`;
}
async function renderNotifications(force = true) {
  const workspace = state.workspaceId;
  if (!notificationData || notificationWorkspace !== workspace) {
    notificationData = { signals: [], channels: { items: state.destinations, available: state.destinationAvailability ?? {} }, deliveries: [], monitor: [], loaded: false };
    notificationWorkspace = workspace;
    notificationLoadedAt = 0;
    paintNotifications();
  }
  if (notificationFlight?.workspace === workspace) return notificationFlight.promise;
  if (!force && notificationData.loaded && Date.now() - notificationLoadedAt < 30000) return;
  if (notificationData.failed) { notificationData.failed = false; paintNotifications(); }
  const promise = loadNotifications(workspace);
  notificationFlight = { workspace, promise };
  try { await promise; } finally { if (notificationFlight?.promise === promise) notificationFlight = null; }
}
async function loadNotifications(workspace) {
  const request = ++notificationRequest;
  const view = $("#view-notifications");
  const signal = AbortSignal.timeout(12000);
  try {
    const [signals, channels, deliveries, monitor] = await Promise.all([
      api("/signals?view=signals", 'GET', undefined, {signal}),
      api("/destinations", 'GET', undefined, {signal}),
      api("/deliveries", 'GET', undefined, {signal}),
      api("/monitor", 'GET', undefined, {signal}),
    ]);
    if (request !== notificationRequest || workspace !== state.workspaceId) return;
    state.destinations = channels.items;
    notificationData = { signals, channels, deliveries, monitor, more: signals.length === 100, loaded: true };
    notificationWorkspace = workspace;
    notificationLoadedAt = Date.now();
    view.querySelector('.notification-error')?.remove();
    if (notificationSection !== 'rules') paintNotifications();
    else {
      const tab = view.querySelector('[data-notification-tab="inbox"]');
      tab?.querySelector('.notification-count')?.remove();
      window.SnaapSignalUnread?.paint();
    }
    window.SnaapSignalUnread?.markVisible();
  } catch (error) {
    if (request !== notificationRequest || workspace !== state.workspaceId) return;
    notificationData.failed = true;
    view.querySelector('.skeleton')?.remove();
    view.querySelector('.notification-error')?.remove();
    const message = error.name === 'TimeoutError' ? (globalThis.SnaapI18n?.text("โหลดข้อมูลนานกว่าปกติ · ลองอีกครั้งได้") ?? "โหลดข้อมูลนานกว่าปกติ · ลองอีกครั้งได้") : error.message;
    view.insertAdjacentHTML('beforeend', `<div class="notification-error" role="alert"><p>${esc(message)}${(globalThis.SnaapI18n?.text("</p><button class=\"secondary\" data-notification-refresh>ลองอีกครั้ง</button></div>") ?? "</p><button class=\"secondary\" data-notification-refresh>ลองอีกครั้ง</button></div>")}`);
  }
}
function paintNotifications() {
  const { signals: allSignals, channels, deliveries, monitor } = notificationData;
  const signals = allSignals.filter(canDisplaySignal);
  const tabs = [
    ["rules", "sliders", (globalThis.SnaapI18n?.text("เซ็ตอัพที่ตั้งไว้") ?? "เซ็ตอัพที่ตั้งไว้")],
    ["inbox", "inbox", (globalThis.SnaapI18n?.text("สัญญาณ") ?? "สัญญาณ")],
    ["channels", "link", (globalThis.SnaapI18n?.text("ช่องทาง") ?? "ช่องทาง")],
    ["activity", "clock", (globalThis.SnaapI18n?.text("ภาพรวม") ?? "ภาพรวม")],
  ];
  let content;
  if (notificationSection === "rules") {
    content = '<div id="notification-rules-slot"></div>';
  } else if (notificationSection === "inbox") {
    content = signals.length
      ? `<div class="signal-list">${signals.map(signalCard).join('')}</div>`
      : `<div class="inbox-empty"><span class="inbox-illustration" aria-hidden="true">${uiIcon("inbox")}${(globalThis.SnaapI18n?.text("</span><h2>ยังไม่มีสัญญาณ</h2><p>เมื่อเซ็ตอัพที่เปิดไว้เข้าเงื่อนไข สัญญาณจะปรากฏที่นี่<br>ดูได้เสมอ แม้ยังไม่ได้เชื่อมช่องทางภายนอก</p><a class=\"secondary with-icon\" href=\"/watch\">") ?? "</span><h2>ยังไม่มีสัญญาณ</h2><p>เมื่อเซ็ตอัพที่เปิดไว้เข้าเงื่อนไข สัญญาณจะปรากฏที่นี่<br>ดูได้เสมอ แม้ยังไม่ได้เชื่อมช่องทางภายนอก</p><a class=\"secondary with-icon\" href=\"/watch\">")}${uiIcon("sliders")}${(globalThis.SnaapI18n?.text("ดูเซ็ตอัพที่ตั้งไว้</a></div>") ?? "ดูเซ็ตอัพที่ตั้งไว้</a></div>")}`;
  } else if (notificationSection === "channels") {
    content = `${(globalThis.SnaapI18n?.text("<div class=\"notification-section-heading\"><h2>เลือกช่องทางรับสัญญาณ</h2></div><div class=\"channel-options\">") ?? "<div class=\"notification-section-heading\"><h2>เลือกช่องทางรับสัญญาณ</h2></div><div class=\"channel-options\">")}${Object.entries(
      channelInfo,
    )
      .map(([kind, info]) => {
        const available = channels.available[kind];
        const count=channels.items.filter(x=>x.kind===kind&&x.verified).length;
        return `<article class="channel-option" data-kind="${kind}"><span class="channel-mark ${info.logo ? "channel-brand" : ""}" aria-hidden="true">${info.logo ? `<img src="${info.logo}" alt="" width="32" height="32">` : uiIcon(info.icon)}</span><div class="channel-option-copy"><div class="channel-option-title"><h3>${info.name}</h3><span class="channel-availability" data-ready="${available}">${count?`${(globalThis.SnaapI18n?.text("เชื่อมแล้ว ") ?? "เชื่อมแล้ว ")}${count}${(globalThis.SnaapI18n?.text(" ช่องทาง") ?? " ช่องทาง")}`:available?(globalThis.SnaapI18n?.text("พร้อมเชื่อมต่อ") ?? "พร้อมเชื่อมต่อ"):(globalThis.SnaapI18n?.text("ยังไม่เปิดใช้งาน") ?? "ยังไม่เปิดใช้งาน")}</span></div><p>${info.detail}</p></div>${available ? `<button type="button" class="secondary" data-connect-channel="${kind}">${count ? (globalThis.SnaapI18n?.text("เพิ่ม") ?? "เพิ่ม") : (globalThis.SnaapI18n?.text("เชื่อมต่อ") ?? "เชื่อมต่อ")}</button>` : ''}</article>`;

      })
      .join(
        "",
      )}</div><div id="channel-setup"></div>${channels.items.length ? `${(globalThis.SnaapI18n?.text("<section class=\"connected-channels\"><h2>ช่องทางของคุณ</h2>") ?? "<section class=\"connected-channels\"><h2>ช่องทางของคุณ</h2>")}${channels.items.map((x) => `<div class="connected-channel"><div><strong>${esc(x.name)}</strong><p>${channelInfo[x.kind]?.name ?? esc(x.kind)} · ${x.verified ? (globalThis.SnaapI18n?.text("เชื่อมแล้ว") ?? "เชื่อมแล้ว") : (globalThis.SnaapI18n?.text("รอยืนยันการเชื่อมต่อ") ?? "รอยืนยันการเชื่อมต่อ")}</p></div><div class="channel-row-actions"><button class="secondary" data-channel-design="${x.id}${(globalThis.SnaapI18n?.text("\">ปรับหน้าตา</button>") ?? "\">ปรับหน้าตา</button>")}${x.verified?`<button class="secondary" data-channel-test="${x.id}${(globalThis.SnaapI18n?.text("\">ส่งทดสอบ</button>") ?? "\">ส่งทดสอบ</button>")}`:''}<button class="text-button" data-disconnect="${x.id}${(globalThis.SnaapI18n?.text("\">ตัดการเชื่อมต่อ</button></div></div>") ?? "\">ตัดการเชื่อมต่อ</button></div></div>")}`).join("")}</section>` : ""}<p class="notification-note">${Object.values(channels.available).some(Boolean) ? (globalThis.SnaapI18n?.text("เชื่อมแล้ว เลือกช่องทางในเซ็ตอัพที่ต้องการรับแจ้งเตือน · สัญญาณยังเก็บในเว็บเสมอ") ?? "เชื่อมแล้ว เลือกช่องทางในเซ็ตอัพที่ต้องการรับแจ้งเตือน · สัญญาณยังเก็บในเว็บเสมอ") : (globalThis.SnaapI18n?.text("ผู้ดูแลยังไม่ได้ตั้งค่าช่องทางภายนอก คุณยังเปิดเซ็ตอัพและรับสัญญาณในเว็บได้") ?? "ผู้ดูแลยังไม่ได้ตั้งค่าช่องทางภายนอก คุณยังเปิดเซ็ตอัพและรับสัญญาณในเว็บได้")}</p>`;
  } else {
    content = notificationActivity(monitor, deliveries);
  }
  if(notificationSection === "inbox" && notificationData.more) content += (globalThis.SnaapI18n?.text("<button class=\"secondary\" data-more-signals>โหลดสัญญาณก่อนหน้า</button>") ?? "<button class=\"secondary\" data-more-signals>โหลดสัญญาณก่อนหน้า</button>");
  if (notificationSection !== 'rules' && notificationData.loaded === false) content = notificationData.failed
    ? (globalThis.SnaapI18n?.text("<p class=\"field-note\">ยังโหลดข้อมูลไม่ได้ · กดรีเฟรชเพื่อลองอีกครั้ง</p>") ?? "<p class=\"field-note\">ยังโหลดข้อมูลไม่ได้ · กดรีเฟรชเพื่อลองอีกครั้ง</p>")
    : skeletonUI(notificationSection === 'activity' ? 'cards' : 'rows', (globalThis.SnaapI18n?.text("กำลังโหลดข้อมูลส่วนนี้…") ?? "กำลังโหลดข้อมูลส่วนนี้…"));
  if (notificationSection === "channels") content = `<div data-browser-alert-slot>${window.SnaapBrowserAlerts?.settingsMarkup() ?? ''}</div>` + content;
  parkNotificationRules();
  $("#view-notifications").innerHTML =
    `${(globalThis.SnaapI18n?.text("<div class=\"page-heading notification-heading\"><div><h1>การแจ้งเตือน</h1><p>ดูเซ็ตอัพ สัญญาณ และช่องทางแจ้งเตือน</p></div><button class=\"text-button with-icon\" data-notification-refresh>") ?? "<div class=\"page-heading notification-heading\"><div><h1>การแจ้งเตือน</h1><p>ดูเซ็ตอัพ สัญญาณ และช่องทางแจ้งเตือน</p></div><button class=\"text-button with-icon\" data-notification-refresh>")}${uiIcon("clock")}${(globalThis.SnaapI18n?.text("รีเฟรช</button></div><nav class=\"notification-tabs\" aria-label=\"มุมมองการแจ้งเตือน\">") ?? "รีเฟรช</button></div><nav class=\"notification-tabs\" aria-label=\"มุมมองการแจ้งเตือน\">")}${tabs.map(([id, icon, label]) => `<button type="button" data-notification-tab="${id}" aria-pressed="${notificationSection === id}">${uiIcon(icon)}<span>${label}</span></button>`).join("")}</nav><div class="notification-content">${content}</div>`;
  refreshSignalValidity();
  window.SnaapSignalUnread?.paint();
  window.SnaapSignalUnread?.markVisible();
  if (notificationSection === "rules") {
    $("#notification-rules-slot").append(notificationRules);
    notificationRules.hidden = false;
    renderWatch();
    const add = document.createElement("button");
    add.className = "primary with-icon";
    add.dataset.action = "new-rule";
    add.innerHTML = uiIcon("plus") + (globalThis.SnaapI18n?.text("เพิ่มเซ็ตอัพ") ?? "เพิ่มเซ็ตอัพ");
    const actions=document.createElement('div');actions.className='notification-setup-actions';
    const importSetup=document.createElement('button');importSetup.type='button';importSetup.className='secondary with-icon';importSetup.dataset.importSetupCode='';importSetup.innerHTML=uiIcon('upload')+(globalThis.SnaapI18n?.text("<span>นำเข้าเซ็ตอัพ</span>") ?? "<span>นำเข้าเซ็ตอัพ</span>");
    actions.append(importSetup,add);
    $(".notification-heading [data-notification-refresh]").replaceWith(actions);
  }
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute('data-signal-price-copy')) {
    try {
      await navigator.clipboard.writeText(button.dataset.signalPriceCopy);
      toast((globalThis.SnaapI18n?.text("คัดลอกราคาเต็มแล้ว") ?? "คัดลอกราคาเต็มแล้ว"));
    } catch {
      toast((globalThis.SnaapI18n?.text("คัดลอกไม่สำเร็จ · ราคาเต็ม ") ?? "คัดลอกไม่สำเร็จ · ราคาเต็ม ") + button.dataset.signalPriceCopy);
    }
    return;
  }
  if (button.dataset.overviewFilter) {
    notificationOverviewFilter = button.dataset.overviewFilter;
    paintNotifications();
    document.querySelector('.overview-filters [data-overview-filter="' + notificationOverviewFilter + '"]').focus({preventScroll: true});
    return;
  }
  if (button.hasAttribute('data-overview-more')) {
    const remaining = [...button.parentElement.querySelectorAll('[data-overview-item][hidden]')];
    remaining.slice(0, 5).forEach(row => { row.hidden = false; });
    const left = Math.max(0, remaining.length - 5);
    button.hidden = !left;
    button.textContent = `${(globalThis.SnaapI18n?.text("ดูเพิ่มอีก ") ?? "ดูเพิ่มอีก ")}${Math.min(5, left)}${(globalThis.SnaapI18n?.text(" รายการ (") ?? " รายการ (")}${left}${(globalThis.SnaapI18n?.text(" รายการที่เหลือ)") ?? " รายการที่เหลือ)")}`;
    return;
  }
  if(button.hasAttribute("data-more-signals")){
    button.disabled=true;
    try{const page=await api("/signals?view=signals&before="+notificationData.signals.at(-1).id);notificationData.signals.push(...page);notificationData.more=page.length===100;paintNotifications();}
    catch(error){toast(error.message);button.disabled=false;}
    return;
  }
  if (button.dataset.notificationTab) {
    notificationSection = button.dataset.notificationTab;
    paintNotifications();
    $("[data-notification-tab=" + notificationSection + "]").focus({
      preventScroll: true,
    });
  }
  if (button.hasAttribute("data-notification-refresh")) {
    button.disabled = true;
    await renderNotifications();
  }
  if (button.dataset.connectChannel) window.SnaapChannels.open(button.dataset.connectChannel);
});
