"use strict";
let notificationSection = "rules";
const notificationRules = document.querySelector("#view-watch");
notificationRules.className = "notification-rules";
function parkNotificationRules() {
  notificationRules.hidden = true;
  document.querySelector("#main").append(notificationRules);
}
let notificationData;
let notificationRequest = 0;
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
  CANCELLED: "ยกเลิก · เซตอัปถูกลบ",
  UNKNOWN: "ยังยืนยันผลไม่ได้",
  QUOTA_OR_RATE_LIMIT: "ถึงขีดจำกัดการส่ง",
  DISCONNECTED: "ตัดการเชื่อมต่อแล้ว",
};
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
  const title = 'มีผลถึง ' + new Date(deadline).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' · ตามรอบตรวจของเซตอัป';
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
  const setupName = row.setup_name?.trim() || 'ไม่พบชื่อเซตอัป';
  const kindLabel={ENTRY:'สัญญาณเข้า',EXIT:'สัญญาณออก',CANCEL:'ยกเลิก',EXPIRED:'หมดเวลารอ'}[row.event.kind] ?? row.event.kind;
  const meta=expired ? (row.event.evidence?.reason && row.event.evidence.reason!=='หมดเวลารอ' ? row.event.evidence.reason : `เซตอัป: ${setupName}`) : `เซตอัป: ${setupName}`;
  const metaTitle=expired ? `${setupName} · ${meta}` : meta;
  const stamp=new Date(row.event.time);
  const formattedTime=stamp.toLocaleString('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  return `<article class="signal-item signal-${appearance.direction}" data-signal-kind="${esc(row.event.kind)}"><span class="signal-symbol signal-tone-${appearance.tone}" aria-hidden="true">${uiIcon(appearance.icon)}</span><div class="signal-details"><div class="signal-heading"><h2>${esc(row.pair)} <span>${esc(row.exchange)}</span></h2><span class="signal-side signal-tone-${appearance.direction}">${esc(label)}</span>${signalValidityTag(row)}</div><p class="signal-meta"><span>${esc(kindLabel)}</span><span class="signal-meta-dot" aria-hidden="true">·</span><span class="signal-setup-name" title="${esc(metaTitle)}">${esc(meta)}</span></p></div><div class="signal-price"><strong>${Number(row.event.referencePrice).toLocaleString('th-TH')}</strong><small>ราคาอ้างอิง</small></div><time datetime="${stamp.toISOString()}" title="${esc(stamp.toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}))}">${esc(formattedTime)}</time></article>`;
}
async function renderNotifications() {
  const request = ++notificationRequest;
  const view = $("#view-notifications");
  if (!notificationData)
    view.innerHTML =
      '<div class="page-heading"><h1>การแจ้งเตือน</h1></div><p class="notification-loading" role="status">กำลังโหลดการแจ้งเตือน…</p>';
  try {
    const [signals, channels, deliveries, monitor] = await Promise.all([
      api("/signals?view=signals"),
      api("/destinations"),
      api("/deliveries"),
      api("/monitor"),
    ]);
    if (request !== notificationRequest) return;
    state.destinations = channels.items;
    notificationData = { signals, channels, deliveries, monitor, more: signals.length === 100 };
    paintNotifications();
  } catch (error) {
    if (request !== notificationRequest) return;
    parkNotificationRules();
    view.innerHTML = `<div class="page-heading"><h1>การแจ้งเตือน</h1></div><div class="notification-error" role="alert"><p>${esc(error.message)}</p><button class="secondary" data-notification-refresh>ลองอีกครั้ง</button></div>`;
  }
}
function paintNotifications() {
  const { signals: allSignals, channels, deliveries, monitor } = notificationData;
  const signals = allSignals.filter(canDisplaySignal);
  const tabs = [
    ["rules", "sliders", "เซตอัพที่ตั้งไว้"],
    ["inbox", "inbox", "สัญญาณ"],
    ["channels", "link", "ช่องทาง"],
    ["activity", "clock", "สถานะ"],
  ];
  let content;
  if (notificationSection === "rules") {
    content = '<div id="notification-rules-slot"></div>';
  } else if (notificationSection === "inbox") {
    content = signals.length
      ? `<div class="signal-list">${signals.map(signalCard).join('')}</div>`
      : `<div class="inbox-empty"><span class="inbox-illustration" aria-hidden="true">${uiIcon("inbox")}</span><h2>ยังไม่มีสัญญาณ</h2><p>เมื่อเซตอัพที่เปิดไว้เข้าเงื่อนไข สัญญาณจะปรากฏที่นี่<br>ดูได้เสมอ แม้ยังไม่ได้เชื่อมช่องทางภายนอก</p><a class="secondary with-icon" href="#watch">${uiIcon("sliders")}ดูเซตอัพที่ตั้งไว้</a></div>`;
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
      )}</div><div id="channel-setup"></div>${channels.items.length ? `<section class="connected-channels"><h2>ช่องทางของคุณ</h2>${channels.items.map((x) => `<div class="connected-channel"><div><strong>${esc(x.name)}</strong><p>${channelInfo[x.kind]?.name ?? esc(x.kind)} · ${x.verified ? "เชื่อมแล้ว" : "รอยืนยันการเชื่อมต่อ"}</p></div><div class="channel-row-actions"><button class="secondary" data-channel-design="${x.id}">ปรับหน้าตา</button>${x.verified?`<button class="secondary" data-channel-test="${x.id}">ส่งทดสอบ</button>`:''}<button class="text-button" data-disconnect="${x.id}">ตัดการเชื่อมต่อ</button></div></div>`).join("")}</section>` : ""}<p class="notification-note">${Object.values(channels.available).some(Boolean) ? "เชื่อมแล้ว เลือกช่องทางในเซตอัปที่ต้องการรับแจ้งเตือน · สัญญาณยังเก็บในเว็บเสมอ" : "ผู้ดูแลยังไม่ได้ตั้งค่าช่องทางภายนอก คุณยังเปิดเซตอัพและรับสัญญาณในเว็บได้"}</p>`;
  } else {
    content = `<section class="activity-section"><div class="notification-section-heading"><h2>${uiIcon("chart")}สถานะข้อมูลตลาด</h2></div>${monitor.length ? monitor.map((x) => `<div class="activity-row"><div><strong>${esc(x.exchange)} · ${esc(x.pair)}</strong><p>${x.status === "PAUSED" ? "พักการติดตาม" : x.status === "QUOTA_BLOCKED" ? "หยุดตรวจ · เลือกเซตอัปให้เหลือภายในสิทธิ์แพ็กเกจ" : x.status === "DIRECTION_REQUIRED" ? "เลือกฝั่ง Long / Short ในเซตอัป" : x.status === "READY" ? "ข้อมูลพร้อม" : "ข้อมูลขาด / เชื่อมต่อไม่ได้"}</p></div><time>${new Date(x.checked_at).toLocaleString("th-TH")}</time></div>`).join("") : '<p class="activity-empty">ยังไม่มีเซตอัพที่เริ่มตรวจ — เปิดเซตอัพจากแท็บเซตอัพที่ตั้งไว้</p>'}</section><section class="activity-section"><div class="notification-section-heading"><h2>${uiIcon("send")}ประวัติการส่งข้อความ</h2></div>${deliveries.length ? deliveries.map((x) => `<div class="activity-row"><div><strong>${esc(x.name)}</strong><p>${deliveryLabels[x.status] ?? esc(x.status)}</p>${x.detail ? `<small>${esc(x.detail)}</small>` : ""}</div></div>`).join("") : '<p class="activity-empty">ยังไม่มีการส่งไปยังช่องทางภายนอก</p>'}</section>`;
  }
  if(notificationSection === "inbox" && notificationData.more) content += '<button class="secondary" data-more-signals>โหลดสัญญาณก่อนหน้า</button>';
  if (notificationSection === "channels") content = `<div data-browser-alert-slot>${window.SnaapBrowserAlerts?.settingsMarkup() ?? ''}</div>` + content;
  parkNotificationRules();
  $("#view-notifications").innerHTML =
    `<div class="page-heading notification-heading"><div><h1>การแจ้งเตือน</h1><p>ดูเซตอัพ สัญญาณ และช่องทางแจ้งเตือน</p></div><button class="text-button with-icon" data-notification-refresh>${uiIcon("clock")}รีเฟรช</button></div><nav class="notification-tabs" aria-label="มุมมองการแจ้งเตือน">${tabs.map(([id, icon, label]) => `<button type="button" data-notification-tab="${id}" aria-pressed="${notificationSection === id}">${uiIcon(icon)}<span>${label}</span>${id === "inbox" && signals.length ? `<span class="notification-count">${signals.length}</span>` : ""}</button>`).join("")}</nav><div class="notification-content">${content}</div>`;
  refreshSignalValidity();
  if (notificationSection === "rules") {
    $("#notification-rules-slot").append(notificationRules);
    notificationRules.hidden = false;
    renderWatch();
    const add = document.createElement("button");
    add.className = "primary with-icon";
    add.dataset.action = "new-rule";
    add.innerHTML = uiIcon("plus") + "เพิ่มเซตอัพ";
    const actions=document.createElement('div');actions.className='notification-setup-actions';
    const importSetup=document.createElement('button');importSetup.type='button';importSetup.className='secondary with-icon';importSetup.dataset.importSetupCode='';importSetup.innerHTML=uiIcon('upload')+'<span>นำเข้าเซตอัป</span>';
    actions.append(importSetup,add);
    $(".notification-heading [data-notification-refresh]").replaceWith(actions);
  }
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
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
