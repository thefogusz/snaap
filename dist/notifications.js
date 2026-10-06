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
    detail: "รับสัญญาณผ่าน Telegram bot",
  },
  LINE: {
    name: "LINE",
    logo: "/assets/brands/line.png",
    icon: "bell",
    detail: "รับสัญญาณผ่าน LINE Official Account",
  },
  DISCORD: {name:"Discord",logo:"/assets/brands/discord.svg",icon:"send",detail:"ส่งสัญญาณเข้าห้อง Discord ที่คุณเลือก"},
  WEBHOOK: {
    name: "Webhook",
    icon: "link",
    detail: "ส่งสัญญาณไปยังระบบของคุณ",
  },
};
const deliveryLabels = {
  SENT: "ส่งแล้ว",
  PENDING: "รอส่ง",
  RETRY: "รอส่งใหม่",
  FAILED: "ส่งไม่สำเร็จ",
  CANCELLED: "ยกเลิก · เซ็ตอัพถูกลบ",
  UNKNOWN: "ยังยืนยันผลไม่ได้",
  QUOTA_OR_RATE_LIMIT: "ถึงขีดจำกัดการส่ง",
  DISCONNECTED: "ช่องทางถูกตัดการเชื่อมต่อ",
};
function notificationTime(value) {
  if (value == null || value === "") return "ยังไม่ได้ตรวจ";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "ยังไม่มีเวลาตรวจ"
    : date.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function limitedActivity(rows, render) {
  return `<div class="overview-list">${rows.map((row, i) => `<div data-overview-item ${i >= 5 ? "hidden" : ""}>${render(row)}</div>`).join("")}${rows.length > 5 ? `<button type="button" class="text-button overview-more" data-overview-more>ดูเพิ่มอีก ${Math.min(5, rows.length - 5)} รายการ (${rows.length - 5} รายการที่เหลือ)</button>` : ""}</div>`;
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
          : overviewTag("ข้อมูลพร้อม", "success", "check");
  return `<article class="overview-market-row ${problem ? "overview-row-attention" : ""}">
    <div class="overview-row-body"><div class="overview-market-header"><div class="overview-row-heading"><span class="overview-row-symbol ${problem ? "overview-symbol-warning" : ""}">${uiIcon(problem ? "alert" : "chart")}</span><h3>${esc(row.pair)}</h3>${overviewTag(row.exchange)}</div><time class="overview-check-time">${uiIcon("clock")}${esc(notificationTime(row.checked_at))}</time></div>
      <p class="overview-setup-name" title="${esc(row.setup_name || "เซตอัป")}">${esc(row.setup_name || "เซตอัป")}</p>
      <div class="overview-row-tags">${status}</div>
      ${problem ? `<p class="overview-action-hint">${esc(summary.detail)}</p>` : ""}
      ${problem && ["QUOTA_BLOCKED", "DIRECTION_REQUIRED"].includes(row.status) ? '<div class="overview-row-footer"><button type="button" class="text-button" data-notification-tab="rules">แก้ไขเซ็ตอัพ' + uiIcon("arrow") + "</button></div>" : ""}
      ${marketInsightDetails(row)}
    </div></article>`;
}
function marketInsightDetails(row) {
  const frames = row.freshness ?? [];
  const progress = row.progress ?? [];
  if (!frames.length && !progress.length) return "";
  return `<details class="overview-market-details"><summary>ดูข้อมูลตลาดและเงื่อนไข ${uiIcon("chevronDown")}</summary>
    ${frames.length ? `<div class="overview-frame-tags" aria-label="ความพร้อมแต่ละกรอบเวลา">${frames.map(frame => overviewTag(`${frame.frame} · ${freshnessLabels[frame.status] ?? frame.status}`, ["CURRENT", "READY"].includes(frame.status) ? "success" : "pending")).join("")}</div>` : ""}
    ${progress.map(item => `<section class="overview-progress-detail"><h4>${overviewTag(item.side, {LONG:"long", SHORT:"short", SPOT:"spot"}[item.side] ?? "neutral")}</h4>${progressUI(item)}${item.explanations?.length ? `<details class="overview-technical"><summary>ดูเงื่อนไข ${item.explanations.length} ข้อ</summary>${explanationsUI(item.explanations)}</details>` : ""}</section>`).join("")}
  </details>`;
}
function deliveryActivity(row) {
  const event = row.event ?? {};
  const kind =
    { ENTRY: "เข้า", EXIT: "ออก", CANCEL: "ยกเลิก", EXPIRED: "หมดเวลารอ" }[
      event.kind
    ] ?? "สัญญาณ";
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
    UNKNOWN: "ตรวจข้อความที่ปลายทางเพื่อยืนยัน",
    FAILED: "ตรวจการเชื่อมต่อของช่องทาง",
    DISCONNECTED: "เชื่อมช่องทางใหม่เพื่อรับสัญญาณถัดไป",
    QUOTA_OR_RATE_LIMIT: "ตรวจโควตาของช่องทาง",
    RETRY: "ระบบจะลองส่งใหม่",
    PENDING: "กำลังรอส่งจากคิว",
  }[row.status];
  return `<article class="overview-delivery-row ${["danger", "warning"].includes(tone) ? "overview-row-attention" : ""}">
    <span class="overview-row-symbol signal-tone-${appearance.tone}">${uiIcon(appearance.icon)}</span>
    <div class="overview-row-body"><div class="overview-row-heading"><h3>${esc(row.pair || "สัญญาณ")}</h3>${overviewTag(row.exchange || "ตลาด")}</div>
      <div class="overview-row-tags">${overviewTag(side, appearance.direction)}${overviewTag(kind)}</div>
      <p class="overview-setup-name">${esc(row.setup_name || "ไม่พบชื่อเซตอัป")}</p>
      <time class="overview-event-time" title="เวลาที่เกิดสัญญาณ">${uiIcon("clock")}${esc(notificationTime(event.time || row.signal_created_at))}</time>
      ${action ? `<p class="overview-action-hint">${esc(action)}</p>` : ""}
      ${row.detail && row.status !== "SENT" ? `<details class="overview-technical"><summary>ข้อมูลสำหรับตรวจสอบ</summary><p>${esc(row.detail)}</p></details>` : ""}
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
      <span class="overview-channel-name"><strong>${esc(group.name)}</strong><small>${esc(info?.name || group.kind || "ช่องทางรับข้อความ")}</small></span>
      <span class="overview-channel-counts">${group.attention ? overviewTag(`ตรวจสอบ ${group.attention}`, "warning", "alert") : ""}${group.pending ? overviewTag(`รอส่ง ${group.pending}`, "pending", "clock") : ""}${overviewTag(`ส่งแล้ว ${group.sent}`, "success", "check")}</span>
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
    ? overviewTag("ต้องตรวจสอบ", "warning", "alert")
    : hasActivity
      ? overviewTag("ปกติ", "success", "check")
      : overviewTag("ยังไม่เริ่ม", "neutral", "clock");
  return `<div class="overview-toolbar">
      <div class="overview-filters" aria-label="กรองรายการในภาพรวม"><button type="button" data-overview-filter="all" aria-pressed="${!onlyAttention}">ทั้งหมด</button><button type="button" data-overview-filter="attention" aria-pressed="${onlyAttention}">${uiIcon("alert")}ต้องตรวจสอบ<span class="overview-filter-count">${problems}</span></button></div>
      <div class="overview-summary" aria-label="สรุปสถานะ">${healthTag}
        <span class="overview-inline-stat" title="ข้อมูลพร้อมจากรายการติดตามทั้งหมด">${uiIcon("chart")}ตลาดพร้อม <strong>${ready}<small> / ${monitor.length}</small></strong></span>
        <span class="overview-inline-stat">${uiIcon("send")}ส่งแล้ว <strong>${sent}<small> / ${deliveries.length}</small></strong></span>
        ${pending ? overviewTag("รอส่ง " + pending, "pending", "clock") : ""}
      </div>
    </div>
    <div class="overview-columns"><section class="overview-panel" aria-label="การติดตามตลาด"><div class="notification-section-heading"><h2>${uiIcon("chart")}การติดตามตลาด</h2><span class="overview-heading-counts">${overviewTag(`${marketRows.length} รายการ`)}${paused && !onlyAttention ? overviewTag(`พัก ${paused}`, "neutral", "pause") : ""}</span></div>
      <div class="overview-surface">${marketRows.length ? limitedActivity(marketRows, marketActivity) : `<div class="overview-empty">${uiIcon(onlyAttention ? "check" : "chart")}<h3>${onlyAttention ? "ไม่มีรายการที่ต้องแก้ไข" : "ยังไม่ได้ติดตามตลาด"}</h3>${onlyAttention ? "" : '<button class="secondary" data-notification-tab="rules">เปิดเซตอัป</button>'}</div>`}</div>
      ${marketRows.length && !onlyAttention ? '<p class="overview-footnote">ข้อมูลพร้อม = ตรวจตลาดได้ · ดูสัญญาณเข้า/ออกในแท็บสัญญาณ</p>' : ""}
    </section><section class="overview-panel" aria-label="การส่งแจ้งเตือน"><div class="notification-section-heading"><h2>${uiIcon("send")}การส่งแจ้งเตือน</h2>${overviewTag(`${channelGroups.length} ช่องทาง`)}</div><p class="overview-history-scope">${deliveries.length === 100 ? "ประวัติส่ง 100 รายการล่าสุด" : `ประวัติส่ง ${deliveries.length} รายการ`}</p>
      ${channelGroups.length ? channelGroups.map(overviewChannel).join("") : `<div class="overview-surface overview-empty">${uiIcon(onlyAttention ? "check" : "send")}<h3>${onlyAttention ? "ไม่มีข้อความที่ต้องตรวจสอบ" : "ยังไม่มีการส่งข้อความ"}</h3><p>${onlyAttention ? "" : "สัญญาณยังดูในเว็บได้เสมอ"}</p></div>`}
      ${problems && channelGroups.length ? '<button class="text-button overview-channel-action" data-notification-tab="channels">จัดการช่องทาง' + uiIcon("arrow") + "</button>" : ""}
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
    ? { state: 'valid', label: 'สัญญาณมีผล' }
    : { state: 'expired', label: 'สัญญาณหมดอายุ' };
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
  const title = 'มีผลถึง ' + new Date(deadline).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' · ตามรอบตรวจของเซ็ตอัพ';
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
function signalCard(row) {
  if (!canDisplaySignal(row)) return '';
  const appearance=signalAppearance(row),directionLabel=signalDirection(row.event,row.setup_market,row.setup_side);
  const expired=row.event.kind==='EXPIRED';
  const label=expired ? `รอเข้า ${directionLabel}` : directionLabel;
  const setupName = row.setup_name?.trim() || 'ไม่พบชื่อเซ็ตอัพ';
  const kindLabel={ENTRY:'สัญญาณเข้า',EXIT:'สัญญาณออก',CANCEL:'ยกเลิก',EXPIRED:'หมดเวลารอ'}[row.event.kind] ?? row.event.kind;
  const meta=expired ? (row.event.evidence?.reason && row.event.evidence.reason!=='หมดเวลารอ' ? row.event.evidence.reason : `เซ็ตอัพ: ${setupName}`) : `เซ็ตอัพ: ${setupName}`;
  const metaTitle=expired ? `${setupName} · ${meta}` : meta;
  const stamp=new Date(row.event.time);
  const formattedTime=stamp.toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  return `<article class="signal-item signal-${appearance.direction}" data-signal-kind="${esc(row.event.kind)}"><span class="signal-symbol signal-tone-${appearance.tone}" aria-hidden="true">${uiIcon(appearance.icon)}</span><div class="signal-details"><div class="signal-heading"><h2>${esc(row.pair)} <span>${esc(row.exchange)}</span></h2><span class="signal-side signal-tone-${appearance.direction}">${esc(label)}</span>${signalValidityTag(row)}</div><p class="signal-meta"><span>${esc(kindLabel)}</span><span class="signal-meta-dot" aria-hidden="true">·</span><span class="signal-setup-name" title="${esc(metaTitle)}">${esc(meta)}</span></p></div><div class="signal-price"><strong>${Number(row.event.referencePrice).toLocaleString('th-TH')}</strong><small>ราคาอ้างอิง</small></div><time datetime="${stamp.toISOString()}" title="${esc(stamp.toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}))}">${esc(formattedTime)}</time>${row.event.recovered?'<small class="signal-recovery">สัญญาณย้อนหลังจากการกู้คืนข้อมูล · ไม่ส่งแจ้งเตือน</small>':''}</article>`;
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
  const promise = loadNotifications(workspace);
  notificationFlight = { workspace, promise };
  try { await promise; } finally { if (notificationFlight?.promise === promise) notificationFlight = null; }
}
async function loadNotifications(workspace) {
  const request = ++notificationRequest;
  const view = $("#view-notifications");
  try {
    const [signals, channels, deliveries, monitor] = await Promise.all([
      api("/signals?view=signals"),
      api("/destinations"),
      api("/deliveries"),
      api("/monitor"),
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
    view.querySelector('.notification-error')?.remove();
    view.insertAdjacentHTML('beforeend', `<div class="notification-error" role="alert"><p>${esc(error.message)}</p><button class="secondary" data-notification-refresh>ลองอีกครั้ง</button></div>`);
  }
}
function paintNotifications() {
  const { signals: allSignals, channels, deliveries, monitor } = notificationData;
  const signals = allSignals.filter(canDisplaySignal);
  const tabs = [
    ["rules", "sliders", "เซ็ตอัพที่ตั้งไว้"],
    ["inbox", "inbox", "สัญญาณ"],
    ["channels", "link", "ช่องทาง"],
    ["activity", "clock", "ภาพรวม"],
  ];
  let content;
  if (notificationSection === "rules") {
    content = '<div id="notification-rules-slot"></div>';
  } else if (notificationSection === "inbox") {
    content = signals.length
      ? `<div class="signal-list">${signals.map(signalCard).join('')}</div>`
      : `<div class="inbox-empty"><span class="inbox-illustration" aria-hidden="true">${uiIcon("inbox")}</span><h2>ยังไม่มีสัญญาณ</h2><p>เมื่อเซ็ตอัพที่เปิดไว้เข้าเงื่อนไข สัญญาณจะปรากฏที่นี่<br>ดูได้เสมอ แม้ยังไม่ได้เชื่อมช่องทางภายนอก</p><a class="secondary with-icon" href="#watch">${uiIcon("sliders")}ดูเซ็ตอัพที่ตั้งไว้</a></div>`;
  } else if (notificationSection === "channels") {
    content = `<div class="notification-section-heading"><h2>เลือกช่องทางรับสัญญาณ</h2></div><div class="channel-options">${Object.entries(
      channelInfo,
    )
      .map(([kind, info]) => {
        const available = channels.available[kind];
        const count=channels.items.filter(x=>x.kind===kind&&x.verified).length;
        return `<article class="channel-option" data-kind="${kind}"><span class="channel-mark ${info.logo ? "channel-brand" : ""}" aria-hidden="true">${info.logo ? `<img src="${info.logo}" alt="" width="32" height="32">` : uiIcon(info.icon)}</span><div class="channel-option-copy"><div class="channel-option-title"><h3>${info.name}</h3><span class="channel-availability" data-ready="${available}">${count?`เชื่อมแล้ว ${count} ช่องทาง`:available?'พร้อมเชื่อมต่อ':'ยังไม่เปิดใช้งาน'}</span></div><p>${info.detail}</p></div>${available ? `<button type="button" class="secondary" data-connect-channel="${kind}">${count ? 'เพิ่ม' : 'เชื่อมต่อ'}</button>` : ''}</article>`;

      })
      .join(
        "",
      )}</div><div id="channel-setup"></div>${channels.items.length ? `<section class="connected-channels"><h2>ช่องทางของคุณ</h2>${channels.items.map((x) => `<div class="connected-channel"><div><strong>${esc(x.name)}</strong><p>${channelInfo[x.kind]?.name ?? esc(x.kind)} · ${x.verified ? "เชื่อมแล้ว" : "รอยืนยันการเชื่อมต่อ"}</p></div><div class="channel-row-actions"><button class="secondary" data-channel-design="${x.id}">ปรับหน้าตา</button>${x.verified?`<button class="secondary" data-channel-test="${x.id}">ส่งทดสอบ</button>`:''}<button class="text-button" data-disconnect="${x.id}">ตัดการเชื่อมต่อ</button></div></div>`).join("")}</section>` : ""}<p class="notification-note">${Object.values(channels.available).some(Boolean) ? "เชื่อมแล้ว เลือกช่องทางในเซ็ตอัพที่ต้องการรับแจ้งเตือน · สัญญาณยังเก็บในเว็บเสมอ" : "ผู้ดูแลยังไม่ได้ตั้งค่าช่องทางภายนอก คุณยังเปิดเซ็ตอัพและรับสัญญาณในเว็บได้"}</p>`;
  } else {
    content = notificationActivity(monitor, deliveries);
  }
  if(notificationSection === "inbox" && notificationData.more) content += '<button class="secondary" data-more-signals>โหลดสัญญาณก่อนหน้า</button>';
  if (notificationSection !== 'rules' && notificationData.loaded === false) content = '<p role="status">กำลังอัปเดตข้อมูลส่วนนี้…</p>';
  if (notificationSection === "channels") content = `<div data-browser-alert-slot>${window.SnaapBrowserAlerts?.settingsMarkup() ?? ''}</div>` + content;
  parkNotificationRules();
  $("#view-notifications").innerHTML =
    `<div class="page-heading notification-heading"><div><h1>การแจ้งเตือน</h1><p>ดูเซ็ตอัพ สัญญาณ และช่องทางแจ้งเตือน</p></div><button class="text-button with-icon" data-notification-refresh>${uiIcon("clock")}รีเฟรช</button></div><nav class="notification-tabs" aria-label="มุมมองการแจ้งเตือน">${tabs.map(([id, icon, label]) => `<button type="button" data-notification-tab="${id}" aria-pressed="${notificationSection === id}">${uiIcon(icon)}<span>${label}</span></button>`).join("")}</nav><div class="notification-content">${content}</div>`;
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
    add.innerHTML = uiIcon("plus") + "เพิ่มเซ็ตอัพ";
    const actions=document.createElement('div');actions.className='notification-setup-actions';
    const importSetup=document.createElement('button');importSetup.type='button';importSetup.className='secondary with-icon';importSetup.dataset.importSetupCode='';importSetup.innerHTML=uiIcon('upload')+'<span>นำเข้าเซ็ตอัพ</span>';
    actions.append(importSetup,add);
    $(".notification-heading [data-notification-refresh]").replaceWith(actions);
  }
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
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
    button.textContent = `ดูเพิ่มอีก ${Math.min(5, left)} รายการ (${left} รายการที่เหลือ)`;
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
