"use strict";
let thinkingLogoId = 0;
function thinkingLogo() {
  const id = `thinking-logo-${++thinkingLogoId}`;
  const upper = 'M120.2 24.1C125.9 21.3 129 24.7 124.9 29.1L83.1 74.7C79.4 78.7 77.8 81.8 81.3 85.9L105.9 112.4C109 115.8 106.3 118.7 102.1 116.8L47.7 92.2C36.7 87.2 34.9 82.2 41.6 74.8C53.5 61.8 89.2 39.5 120.2 24.1Z';
  const lower = 'M101.6 80.2C97.6 78.3 95.9 80.6 98.7 83.9L119.4 109.2C122.8 113.5 122.3 117.6 117.9 121.7L71.7 164.7C67.3 168.9 70.2 173.3 76.2 170.6C105 157.8 138.8 140.2 151.6 128C161.3 118.8 160.6 111.2 149.5 104.6C139.1 98.5 118.1 87.6 101.6 80.2Z';
  return `<svg class="thinking-logo" viewBox="34 20 128 155" aria-hidden="true" focusable="false">
    <defs>
      <mask id="${id}-lower" maskUnits="userSpaceOnUse" x="34" y="20" width="128" height="155"><path class="thinking-logo-trace thinking-logo-trace-lower" d="M72 169 L136 127 Q162 113 137 104 L99 81" pathLength="100"/></mask>
      <mask id="${id}-upper" maskUnits="userSpaceOnUse" x="34" y="20" width="128" height="155"><path class="thinking-logo-trace thinking-logo-trace-upper" d="M106 116 L57 93 Q26 83 60 61 L125 24" pathLength="100"/></mask>
    </defs>
    <path class="thinking-logo-base" d="${upper} ${lower}"/>
    <path class="thinking-logo-color thinking-logo-color-lower" d="${lower}" mask="url(#${id}-lower)"/>
    <path class="thinking-logo-color" d="${upper}" mask="url(#${id}-upper)"/>
  </svg>`;
}

// Register before dynamic imports can resume after DOMContentLoaded has fired.
const companionScriptsReady = document.readyState === "complete" ? Promise.resolve() :
  new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, {once:true}));
const setupChangesReady = import('./setup-changes.js');
let assetTools;
const assetToolsReady = import('./asset-catalog.js').then(module => assetTools = module);
let entryFlexUI;
const entryFlexReady = import('./entry-flexibility-ui.js').then(module => entryFlexUI = module);
const assistantTextReady = import('./assistant-text.js');
const chatArtifactsReady = import('./chat-artifacts.js');
let healthReady = Promise.resolve();
let indicatorCatalog;
const indicatorCatalogReady=import('./indicator-catalog.js').then(m=>indicatorCatalog=m);
let timeframeTools;
const timeframeToolsReady = import('./timeframes.js').then(m => { timeframeTools = m; tf = m.TIMEFRAMES; });
function setupTimeframes(d = state.draft) { return timeframeTools ? timeframeTools.availableTimeframes(d?.exchange, d?.market) : tf; }
let directionTools;
const directionToolsReady=import('./trade-direction.js').then(m=>directionTools=m);
function directionLabel(side,market){return directionTools.directionLabel(side,market);}
function signalDirection(event,market,side){return directionTools.signalDirection(event,market,side);}
function directionChoices(d){
 if(d.market==='Spot')return (globalThis.SnaapI18n?.text("<p class=\"setup-direction-spot\">Spot (ซื้อ)</p>") ?? "<p class=\"setup-direction-spot\">Spot (ซื้อ)</p>");
 return `${(globalThis.SnaapI18n?.text("<fieldset class=\"setup-direction\"><legend>เลือกฝั่งเทรด</legend><div class=\"direction-options\"><label><input type=\"checkbox\" data-direction=\"LONG\" ") ?? "<fieldset class=\"setup-direction\"><legend>เลือกฝั่งเทรด</legend><div class=\"direction-options\"><label><input type=\"checkbox\" data-direction=\"LONG\" ")}${['LONG','BOTH'].includes(d.side)?'checked':''}${(globalThis.SnaapI18n?.text("><span>Long <small>(ซื้อ)</small></span></label><label><input type=\"checkbox\" data-direction=\"SHORT\" ") ?? "><span>Long <small>(ซื้อ)</small></span></label><label><input type=\"checkbox\" data-direction=\"SHORT\" ")}${['SHORT','BOTH'].includes(d.side)?'checked':''}${(globalThis.SnaapI18n?.text("><span>Short <small>(ขาย)</small></span></label></div>") ?? "><span>Short <small>(ขาย)</small></span></label></div>")}${d.side==='BOTH'?`<div class="direction-mirror-row"><label class="direction-mirror"><input type="checkbox" data-mirror-short ${d.mirrorShort?'checked':''}${(globalThis.SnaapI18n?.text("><span>สลับเงื่อนไข Long ให้ Short อัตโนมัติ</span></label></div><p class=\"field-note\">") ?? "><span>สลับเงื่อนไข Long ให้ Short อัตโนมัติ</span></label></div><p class=\"field-note\">")}${d.mirrorShort?(globalThis.SnaapI18n?.text("กลับเหนือ/ใต้และตัดขึ้น/ลง · คงค่าตัวเลขเดิม") ?? "กลับเหนือ/ใต้และตัดขึ้น/ลง · คงค่าตัวเลขเดิม"):(globalThis.SnaapI18n?.text("ตั้งเงื่อนไข Long และ Short แยกกัน") ?? "ตั้งเงื่อนไข Long และ Short แยกกัน")}</p>`:''}</fieldset>`;
}

const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const state = {
  me: null,
  workspaceId: null,
  workspaces: [],
  health: null,
  rules: [],
  conversation: null,
  images: [],
  useMyData: false,
  libraryImages: [],
  draft: null,
  saved: null,
  undo: [],
  sources: [],
  selection: {},
  replay: null,
  busy: false,
  saving: false,
  filter: "all",
  destinations: [],
  conversationRows: [],
  draftRevision: 0,
  persistedDraft: null,
  crop: null,
  editorNotice: null,
};
let conversationCache, recordConversationTiming;
const conversationCacheReady = import('./conversation-cache.js').then(module => {
  recordConversationTiming = module.recordConversationTiming;
  conversationCache = module.createConversationCache({
    load: () => api('/conversations?view=summary'),
    scope: () => ({owner: state.me?.id, workspace: state.workspaceId}),
  });
});
let tf = ["5m", "15m", "1h", "4h", "1d"];
const names = ["Binance", "Bybit", "OKX", "Bitget", "MEXC"];
const constant = (value) => ({ kind: "CONSTANT", value });
const price = () => ({ kind: "PRICE", field: "close", timeframe: "15m" });
const cmp = () => ({
  kind: "COMPARE",
  op: ">",
  left: price(),
  right: { kind: "INDICATOR", name: "EMA", period: 200, timeframe: "15m" },
});
const initial = () => ({
  schemaVersion: 2,
  name: (globalThis.SnaapI18n?.text("เซ็ตอัพใหม่") ?? "เซ็ตอัพใหม่"),
  exchange: ["Binance"],
  market: "Spot",
  side: "SPOT",
  pairs: ["BTC/USDT"],
  timeframe: "15m",
  entry: cmp(),
  stages: [],
  cooldownBars: 0,
  destinations: [],
});
// An unfinished editor draft must never be evaluated as a sample strategy.
const blankSetup = () => ({ ...initial(), entry: { kind: "GROUP", op: "AND", children: [] } });
function hasEntryCondition(d = state.draft) {
  return Boolean(d?.entry && !(d.entry.kind === "GROUP" && !d.entry.children.length));
}
// The page content supplies its heading; keep the header utilities in place.
$("#page-name").classList.add("sr-only");
const workbench = document.createElement("div");
workbench.className = "workbench";
workbench.hidden = true;
workbench.dataset.tab = "chat";
$("#view-home").append(workbench);
workbench.append($("#conversation"));
const panel = document.createElement("aside");
panel.className = "design-panel";
panel.setAttribute("aria-label", (globalThis.SnaapI18n?.text("ออกแบบเซ็ตอัพ") ?? "ออกแบบเซ็ตอัพ"));
const setupPane = document.createElement("div");
setupPane.className = "setup-pane";
setupPane.setAttribute("aria-label", (globalThis.SnaapI18n?.text("กราฟและเซ็ตอัพ") ?? "กราฟและเซ็ตอัพ"));
setupPane.tabIndex = 0;
workbench.append(setupPane);
setupPane.append(panel);
const setupPaneNav=document.createElement('nav');
setupPaneNav.className='setup-pane-nav';
setupPaneNav.setAttribute('aria-label',(globalThis.SnaapI18n?.text("มุมมองกราฟและเซ็ตอัพ") ?? "มุมมองกราฟและเซ็ตอัพ"));
setupPaneNav.innerHTML=(globalThis.SnaapI18n?.text("<button type=\"button\" data-pane-view=\"chart\">ไปที่กราฟ</button><button type=\"button\" data-pane-view=\"setup\">ไปที่เซ็ตอัพ</button>") ?? "<button type=\"button\" data-pane-view=\"chart\">ไปที่กราฟ</button><button type=\"button\" data-pane-view=\"setup\">ไปที่เซ็ตอัพ</button>");
setupPaneNav.hidden=true;
setupPaneNav.addEventListener('click',event=>{
  const button=event.target.closest('[data-pane-view]');if(!button)return;
  const target=button.dataset.paneView==='setup'?panel:setupPane.querySelector('.setup-studio');
  if(!target)return;
  if(matchMedia('(min-width:1100px)').matches){
    setupPane.scrollTo({top:target.getBoundingClientRect().top-setupPane.getBoundingClientRect().top+setupPane.scrollTop,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }else target.scrollIntoView({block:'start',behavior:'instant'});
});
const tabs = document.createElement("div");
tabs.className = "mobile-design-tabs";
tabs.innerHTML =
  (globalThis.SnaapI18n?.text("<button class=\"secondary\" data-tab=\"chat\">แชท</button><button class=\"secondary split-view-button\" data-tab=\"split\">แชท + เซ็ตอัพ</button>") ?? "<button class=\"secondary\" data-tab=\"chat\">แชท</button><button class=\"secondary split-view-button\" data-tab=\"split\">แชท + เซ็ตอัพ</button>");
workbench.before(tabs);
tabs.hidden = true;
const chatTools = document.createElement("div");
chatTools.className = "chat-tools";
chatTools.innerHTML =
  (globalThis.SnaapI18n?.text("<button class=\"secondary\" data-attach-image>แนบภาพ</button><input id=\"image-upload\" type=\"file\" accept=\"image/png,image/jpeg,image/webp\" multiple hidden><select id=\"ai-mode\" aria-label=\"โหมด AI\"><option value=\"standard\">ปกติ</option><option value=\"deep\">วิเคราะห์ละเอียด · Pro</option></select><button type=\"button\" class=\"text-button my-data-toggle\" data-context role=\"switch\" aria-checked=\"false\" aria-label=\"ใช้ข้อมูลของฉัน\"><span>ใช้ข้อมูลของฉัน</span><span class=\"switch-track\" aria-hidden=\"true\"></span></button>") ?? "<button class=\"secondary\" data-attach-image>แนบภาพ</button><input id=\"image-upload\" type=\"file\" accept=\"image/png,image/jpeg,image/webp\" multiple hidden><select id=\"ai-mode\" aria-label=\"โหมด AI\"><option value=\"standard\">ปกติ</option><option value=\"deep\">วิเคราะห์ละเอียด · Pro</option></select><button type=\"button\" class=\"text-button my-data-toggle\" data-context role=\"switch\" aria-checked=\"false\" aria-label=\"ใช้ข้อมูลของฉัน\"><span>ใช้ข้อมูลของฉัน</span><span class=\"switch-track\" aria-hidden=\"true\"></span></button>");
$("#followup-form").before(chatTools);
chatTools.querySelector('option[value="deep"]').disabled = true;
chatTools.querySelector('option[value="deep"]').textContent = (globalThis.SnaapI18n?.text("วิเคราะห์ละเอียด · Pro · เร็ว ๆ นี้") ?? "วิเคราะห์ละเอียด · Pro · เร็ว ๆ นี้");
const previews = document.createElement("div");
previews.className = "attachment-preview";
chatTools.after(previews);
const sources = document.createElement("details");
sources.innerHTML =
  (globalThis.SnaapI18n?.text("<summary>ดูข้อมูลที่ใช้</summary><p class=\"field-note\">เลือกภาพจากข้อมูลของฉันได้สูงสุด 5 ภาพ หรือพิมพ์ @ชื่อภาพ ในแชท · ภาพที่แนบในแชทเป็นภาพชั่วคราวและลบหลังบันทึกเซ็ตอัพ</p><label>ตั้งแต่ <input type=\"date\" id=\"context-from\"></label><label>ถึง <input type=\"date\" id=\"context-to\"></label><div class=\"source-list\"></div><div data-saved-images></div>") ?? "<summary>ดูข้อมูลที่ใช้</summary><p class=\"field-note\">เลือกภาพจากข้อมูลของฉันได้สูงสุด 5 ภาพ หรือพิมพ์ @ชื่อภาพ ในแชท · ภาพที่แนบในแชทเป็นภาพชั่วคราวและลบหลังบันทึกเซ็ตอัพ</p><label>ตั้งแต่ <input type=\"date\" id=\"context-from\"></label><label>ถึง <input type=\"date\" id=\"context-to\"></label><div class=\"source-list\"></div><div data-saved-images></div>");
sources.hidden = true;
previews.after(sources);
async function setMyData(enabled) {
  if (state.busy) return;
  const button=chatTools.querySelector('[data-context]');
  button.disabled=true;
  const label=button.querySelector('span'), previousLabel=label?.textContent;
  if(label)label.textContent=enabled?(globalThis.SnaapI18n?.text("กำลังเตรียมข้อมูล…") ?? "กำลังเตรียมข้อมูล…"):(globalThis.SnaapI18n?.text("ใช้ข้อมูลของฉัน") ?? "ใช้ข้อมูลของฉัน");
  try {
    if(enabled)await Promise.all([refreshContext(), renderLabImageChoices(true)]);
    state.useMyData=enabled;
    button.setAttribute('aria-checked',String(enabled));
    sources.hidden=!enabled;
    if(!enabled)sources.open=false;
    persistRecovery();
  }finally{button.disabled=false;if(label)label.textContent=previousLabel;}
}
const conversations = document.createElement("select");
conversations.className = "conversation-select";
conversations.setAttribute("aria-label", (globalThis.SnaapI18n?.text("บทสนทนาที่บันทึก") ?? "บทสนทนาที่บันทึก"));
conversations.hidden = true;
$("#welcome").before(conversations);
const conversationPicker = document.createElement("button");
conversationPicker.className = "conversation-picker";
conversationPicker.type = "button";
conversationPicker.innerHTML = uiIcon("clock") + (globalThis.SnaapI18n?.text("<span>บทสนทนาล่าสุด</span>") ?? "<span>บทสนทนาล่าสุด</span>");
conversationPicker.setAttribute("aria-haspopup", "dialog");
const workbenchToolbar = document.createElement("div");
workbenchToolbar.className = "workbench-toolbar";
conversations.after(workbenchToolbar);
const conversationActions=document.createElement('div');
conversationActions.className='conversation-actions';
const conversationTitle = document.createElement('div');
conversationTitle.className = 'conversation-title';
const conversationTitleButton = document.createElement('button');
conversationTitleButton.type = 'button';
conversationTitleButton.className = 'conversation-title-button';
conversationTitleButton.setAttribute('aria-label', (globalThis.SnaapI18n?.text("เปลี่ยนชื่อแชท") ?? "เปลี่ยนชื่อแชท"));
conversationTitleButton.setAttribute('aria-haspopup', 'dialog');
conversationTitleButton.innerHTML = '<span role="status" aria-live="polite" aria-atomic="true"></span>' + uiIcon('pencil');
conversationTitle.append(conversationTitleButton);
function renderConversationTitle() {
  const row = state.conversationRows.find(row => row.id === state.conversation);
  const title = row?.title?.trim() || '';
  conversationTitle.hidden = !title || !(row.has_messages || $('#messages .message'));
  const label = conversationTitleButton.querySelector('span');
  if (label.textContent !== title) label.textContent = title;
  conversationTitleButton.title = title;
}
conversationTitleButton.onclick = () => {
  const id = state.conversation, workspace = state.workspaceId;
  const row = state.conversationRows.find(row => row.id === id);
  if (!row) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'workspace-dialog rename-chat-dialog';
  dialog.setAttribute('aria-labelledby', 'rename-chat-heading');
  dialog.innerHTML = (globalThis.SnaapI18n?.text("<form><h2 id=\"rename-chat-heading\">เปลี่ยนชื่อแชท</h2><label>ชื่อแชท<input name=\"title\" maxlength=\"100\" required></label><p class=\"field-note\" data-rename-error role=\"alert\" hidden></p><div class=\"row-actions\"><button type=\"button\" class=\"secondary\" data-cancel>ยกเลิก</button><button type=\"submit\" class=\"primary\">บันทึก</button></div></form>") ?? "<form><h2 id=\"rename-chat-heading\">เปลี่ยนชื่อแชท</h2><label>ชื่อแชท<input name=\"title\" maxlength=\"100\" required></label><p class=\"field-note\" data-rename-error role=\"alert\" hidden></p><div class=\"row-actions\"><button type=\"button\" class=\"secondary\" data-cancel>ยกเลิก</button><button type=\"submit\" class=\"primary\">บันทึก</button></div></form>");
  const input = dialog.querySelector('input');
  input.value = row.title;
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.onclose = () => { dialog.remove(); if (!conversationTitle.hidden) conversationTitleButton.focus(); };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    const title = input.value.trim();
    input.setCustomValidity(title ? '' : (globalThis.SnaapI18n?.text("กรุณาใส่ชื่อแชท") ?? "กรุณาใส่ชื่อแชท"));
    if (!input.reportValidity()) return;
    const button = dialog.querySelector('[type="submit"]');
    if (button.disabled) return;
    const errorNote = dialog.querySelector('[data-rename-error]');
    button.disabled = true; errorNote.hidden = true;
    try {
      if (state.conversation !== id || state.workspaceId !== workspace) { dialog.close(); return; }
      const saved = await api(`/conversations/${id}/title`, 'PUT', {title});
      if (state.workspaceId === workspace) {
        const current = state.conversationRows.find(row => row.id === id);
        if (current) { current.title = saved.title; conversationCache.upsert(current); }
        const option = [...conversations.options].find(option => option.value === id);
        if (option) option.textContent = saved.title;
        renderConversationTitle();
      }
      dialog.close();
    } catch (error) { errorNote.textContent = error.message; errorNote.hidden = false; }
    finally { button.disabled = false; }
  };
  input.oninput = () => input.setCustomValidity('');
  document.body.append(dialog); dialog.showModal(); input.focus(); input.select();
};
renderConversationTitle();
workbenchToolbar.append(tabs,conversationTitle,conversationActions);
conversationActions.append(setupPaneNav,conversationPicker);
const newConversationButton=document.createElement('button');
newConversationButton.type='button';
newConversationButton.className='icon-button';
newConversationButton.dataset.action='new';
newConversationButton.setAttribute('aria-label',(globalThis.SnaapI18n?.text("เริ่มบทสนทนาใหม่") ?? "เริ่มบทสนทนาใหม่"));
newConversationButton.title=(globalThis.SnaapI18n?.text("เริ่มบทสนทนาใหม่") ?? "เริ่มบทสนทนาใหม่");
newConversationButton.innerHTML=uiIcon('plus');
newConversationButton.hidden=true;
conversationActions.append(newConversationButton);
conversationPicker.setAttribute("aria-label", (globalThis.SnaapI18n?.text("บทสนทนาล่าสุด") ?? "บทสนทนาล่าสุด"));
conversationPicker.title = (globalThis.SnaapI18n?.text("บทสนทนาล่าสุด") ?? "บทสนทนาล่าสุด");
function conversationScope() {
  return `${state.me?.id ?? ''}:${state.workspaceId ?? ''}`;
}
function applyConversationRows(rows) {
  state.conversationRows = rows;
  renderConversationTitle();
  conversationPicker.hidden = false;
  conversations.innerHTML = (globalThis.SnaapI18n?.text("<option value=\"\">บทสนทนาที่บันทึก</option>") ?? "<option value=\"\">บทสนทนาที่บันทึก</option>") + rows.map(row =>
    `<option value="${row.id}">${esc(row.title)}</option>`).join('');
  conversations.value = state.conversation ?? '';
}
let conversationDialog = null;
let conversationDialogScope = null;
function confirmConversationDeletion(row, onDeleted) {
  if (state.busy || state.saving || state.uploading) { toast((globalThis.SnaapI18n?.text("รอรายการปัจจุบันเสร็จก่อนลบ") ?? "รอรายการปัจจุบันเสร็จก่อนลบ")); return; }
  const scope = conversationScope();
  const trigger = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'conversation-delete-dialog';
  dialog.setAttribute('aria-labelledby', 'delete-conversation-heading');
  dialog.setAttribute('aria-describedby', 'delete-conversation-note');
  dialog.innerHTML = (globalThis.SnaapI18n?.text("<form><h2 id=\"delete-conversation-heading\">ลบบทสนทนานี้?</h2><p class=\"conversation-delete-title\"></p><p id=\"delete-conversation-note\">เมื่อลบบทสนทนานี้ เทรดเซ็ตอัพที่เชื่อมโยงจะถูกลบและหยุดแจ้งเตือนด้วย การลบนี้ไม่สามารถกู้คืนได้</p><p class=\"field-note\" data-delete-error role=\"alert\" hidden></p><div class=\"row-actions\"><button type=\"button\" class=\"secondary\" data-cancel autofocus>ยกเลิก</button><button type=\"submit\" class=\"conversation-delete-confirm\">ลบบทสนทนา</button></div></form>") ?? "<form><h2 id=\"delete-conversation-heading\">ลบบทสนทนานี้?</h2><p class=\"conversation-delete-title\"></p><p id=\"delete-conversation-note\">เมื่อลบบทสนทนานี้ เทรดเซ็ตอัพที่เชื่อมโยงจะถูกลบและหยุดแจ้งเตือนด้วย การลบนี้ไม่สามารถกู้คืนได้</p><p class=\"field-note\" data-delete-error role=\"alert\" hidden></p><div class=\"row-actions\"><button type=\"button\" class=\"secondary\" data-cancel autofocus>ยกเลิก</button><button type=\"submit\" class=\"conversation-delete-confirm\">ลบบทสนทนา</button></div></form>");
  dialog.querySelector('.conversation-delete-title').textContent = row.title;
  const submit = dialog.querySelector('[type="submit"]');
  const cancel = dialog.querySelector('[data-cancel]');
  cancel.onclick = () => dialog.close();
  dialog.onclick = event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  };
  const scopeChanged = () => { if (scope !== conversationScope()) dialog.close(); };
  window.addEventListener('snaap-account-ready', scopeChanged);
  dialog.onclose = () => {
    window.removeEventListener('snaap-account-ready', scopeChanged); dialog.remove();
    if (trigger?.isConnected) trigger.focus();
    else if (conversationDialog?.open) conversationDialog.querySelector('input').focus();
  };
  dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    if (scope !== conversationScope()) { dialog.close(); return; }
    if (state.busy || state.saving || state.uploading) { toast((globalThis.SnaapI18n?.text("รอรายการปัจจุบันเสร็จก่อนลบ") ?? "รอรายการปัจจุบันเสร็จก่อนลบ")); return; }
    const errorNote = dialog.querySelector('[data-delete-error]');
    submit.disabled = true; errorNote.hidden = true;
    let locked = false;
    try {
      // Finish an in-flight draft write before deleting its conversation.
      if (state.conversation === row.id) { clearTimeout(draftTimer); if (draftFlight) await draftFlight; }
      if (scope !== conversationScope()) { dialog.close(); return; }
      state.busy = true; locked = true;
      const result = await api(`/conversations/${row.id}`, 'DELETE');
      if (scope !== conversationScope()) { dialog.close(); return; }
      conversationCache.remove(row.id);
      for (const related of conversationCache.read().rows) {
        if (result.ruleIds.includes(related.saved_rule_id))
          conversationCache.upsert({...related, saved_rule_id: null, setup_saved_at: null, setup_status_known: true});
      }
      conversationSelection++;
      conversationDetailController?.abort();
      state.rules = state.rules.filter(rule => !result.ruleIds.includes(rule.id));
      if (state.saved && result.ruleIds.includes(state.saved.id)) state.saved = null;
      if (state.conversation === row.id) {
        state.conversation = null; conversations.value = '';
        state.draftRevision = 0; state.persistedDraft = null; state.saved = null;
        state.draft = blankSetup(); state.images = []; state.crop = null;
        state.replay = null; state.undo = []; state.editorNotice = null;
        $('#chat-input').value = ''; $('#followup-input').value = '';
        $('#messages').replaceChildren(); showDraftStatus(''); renderImages();
        window.SnaapStudio?.reset(); window.SnaapChart?.reset();
        setWorkbenchTab('chat'); renderDesigner(); requestAnimationFrame(resizeChatInputs);
      }
      applyConversationRows(conversationCache.read().rows);
      renderWatch(); persistRecovery(); onDeleted(); dialog.close();
      toast((globalThis.SnaapI18n?.text("ลบบทสนทนาและเทรดเซ็ตอัพที่เชื่อมโยงแล้ว") ?? "ลบบทสนทนาและเทรดเซ็ตอัพที่เชื่อมโยงแล้ว"));
    } catch (error) { errorNote.textContent = error.message; errorNote.hidden = false; }
    finally {
      if (locked) state.busy = false;
      submit.disabled = false;
      if (scope === conversationScope()) { renderDesigner(); if (state.draft && draftDirty()) queueDraftSave(); }
    }
  };
  document.body.append(dialog); dialog.showModal();
}
conversationPicker.onclick = () => {
  if (conversationDialog?.open) { conversationDialog.querySelector('input').focus(); return; }
  const started = performance.now(), scope = conversationScope();
  const cached = conversationCache.read();
  applyConversationRows(cached.rows);
  const dialog = document.createElement("dialog");
  conversationDialog = dialog;
  conversationDialogScope = scope;
  dialog.className = "conversation-dialog";
  dialog.setAttribute("aria-labelledby", "conversation-dialog-title");
  dialog.innerHTML =
    (globalThis.SnaapI18n?.text("<header><h2 id=\"conversation-dialog-title\">บทสนทนาล่าสุด</h2><button type=\"button\" aria-label=\"ปิด\">") ?? "<header><h2 id=\"conversation-dialog-title\">บทสนทนาล่าสุด</h2><button type=\"button\" aria-label=\"ปิด\">") +
    uiIcon("close") +
    (globalThis.SnaapI18n?.text("</button></header><input type=\"search\" autofocus aria-label=\"ค้นหาบทสนทนา\" placeholder=\"ค้นหาบทสนทนา\"><p class=\"field-note\" data-conversation-status role=\"status\" aria-live=\"polite\" hidden></p><button type=\"button\" class=\"text-button\" data-conversation-retry hidden>ลองใหม่</button><div class=\"conversation-results\"></div>") ?? "</button></header><input type=\"search\" autofocus aria-label=\"ค้นหาบทสนทนา\" placeholder=\"ค้นหาบทสนทนา\"><p class=\"field-note\" data-conversation-status role=\"status\" aria-live=\"polite\" hidden></p><button type=\"button\" class=\"text-button\" data-conversation-retry hidden>ลองใหม่</button><div class=\"conversation-results\"></div>");
  const list = dialog.querySelector(".conversation-results");
  const status = dialog.querySelector('[data-conversation-status]');
  const retry = dialog.querySelector('[data-conversation-retry]');
  let ready = cached.ready;
  const current = () => dialog.open && scope === conversationScope();
  const note = text => { status.textContent = text; status.hidden = !text; };
  const paint = () => {
    const query = dialog.querySelector("input").value.toLocaleLowerCase();
    const rows = state.conversationRows.filter((row) =>
      row.title.toLocaleLowerCase().includes(query),
    );
    list.innerHTML = rows.length
      ? rows
          .map(
            (row) =>
              `<div class="conversation-result"><button type="button" class="conversation-open" data-conversation-id="${row.id}">${uiIcon(row.setup_saved_at ? "sliders" : "chat")}<span><strong>${esc(row.title)}</strong><small>${row.created_at ? new Date(row.created_at).toLocaleDateString((globalThis.SnaapI18n?.locale ?? "th-TH"), { day: "numeric", month: "short", year: "numeric" }) + ' · ' : ''}${esc(state.workspaces.find(w=>w.id===row.workspace_id)?.name??state.workspaces.find(w=>w.id===state.workspaceId)?.name??(globalThis.SnaapI18n?.text("พื้นที่หลัก") ?? "พื้นที่หลัก"))}${row.id === state.conversation ? (globalThis.SnaapI18n?.text(" · กำลังเปิด") ?? " · กำลังเปิด") : ""}</small><span class="conversation-kind${row.setup_saved_at ? ' is-saved' : ''}">${row.setup_saved_at ? (globalThis.SnaapI18n?.text("บันทึกเซ็ตอัพแล้ว") ?? "บันทึกเซ็ตอัพแล้ว") : row.setup_status_known ? (globalThis.SnaapI18n?.text("พูดคุย / วิเคราะห์") ?? "พูดคุย / วิเคราะห์") : (globalThis.SnaapI18n?.text("บทสนทนา") ?? "บทสนทนา")}</span></span>${uiIcon("arrow")}</button><button type="button" class="conversation-delete" data-delete-conversation="${row.id}${(globalThis.SnaapI18n?.text("\" aria-label=\"ลบบทสนทนา ") ?? "\" aria-label=\"ลบบทสนทนา ")}${esc(row.title)}${(globalThis.SnaapI18n?.text("\" title=\"ลบบทสนทนา\">") ?? "\" title=\"ลบบทสนทนา\">")}${uiIcon("trash")}</button></div>`,
          )
          .join("")
      : ready ? (globalThis.SnaapI18n?.text("<p>ไม่พบบทสนทนา</p>") ?? "<p>ไม่พบบทสนทนา</p>") : '';
  };
  const update = async (force = false) => {
    if (!current()) return;
    retry.hidden = true;
    if (!force && conversationCache.read().fresh) return;
    note(ready ? (globalThis.SnaapI18n?.text("กำลังอัปเดตรายการ…") ?? "กำลังอัปเดตรายการ…") : (globalThis.SnaapI18n?.text("กำลังโหลดบทสนทนา…") ?? "กำลังโหลดบทสนทนา…"));
    if (!ready) list.innerHTML = skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดบทสนทนา…") ?? "กำลังโหลดบทสนทนา…"));
    list.setAttribute('aria-busy', 'true');
    try {
      const rows = await conversationCache.list({force});
      if (!current()) { if (dialog.open && scope !== conversationScope()) dialog.close(); return; }
      applyConversationRows(rows);
      ready = true;
      // Preserve search text, focus, and the focused row when background data arrives.
      const focusedId = document.activeElement?.closest('[data-conversation-id]')?.dataset.conversationId;
      paint();
      if (focusedId) [...list.querySelectorAll('[data-conversation-id]')].find(button => button.dataset.conversationId === focusedId)?.focus();
      note('');
      recordConversationTiming('up-to-date', started);
    } catch (error) {
      if (!current()) return;
      if (!ready) list.innerHTML = '';
      note(ready ? (globalThis.SnaapI18n?.text("อัปเดตรายการไม่สำเร็จ ยังใช้รายการเดิมได้") ?? "อัปเดตรายการไม่สำเร็จ ยังใช้รายการเดิมได้") : (globalThis.SnaapI18n?.text("โหลดบทสนทนาไม่สำเร็จ") ?? "โหลดบทสนทนาไม่สำเร็จ"));
      retry.hidden = false;
    } finally { if (dialog.isConnected) list.setAttribute('aria-busy', 'false'); }
  };
  retry.onclick = () => void update(true);
  dialog.querySelector("input").oninput = paint;
  dialog.querySelector("header button").onclick = () => dialog.close();
  dialog.onclick = event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  };
  list.onclick = (event) => {
    if (!current()) { dialog.close(); return; }
    const remove = event.target.closest('[data-delete-conversation]');
    if (remove) {
      const row = state.conversationRows.find(row => row.id === remove.dataset.deleteConversation);
      if (row) confirmConversationDeletion(row, paint);
      return;
    }
    const button = event.target.closest("[data-conversation-id]");
    if (!button) return;
    conversations.value = button.dataset.conversationId;
    conversations.dispatchEvent(new Event("change"));
    dialog.close();
  };
  dialog.onclose = () => {
    dialog.remove();
    if (conversationDialog === dialog) conversationDialog = null;
    conversationPicker.focus();
  };
  document.body.append(dialog);
  paint();
  dialog.showModal();
  requestAnimationFrame(() => {
    if (!current()) return;
    recordConversationTiming('visible', started, {cached: cached.ready, rows: cached.rows.length});
    if (cached.fresh) recordConversationTiming('up-to-date', started);
    void update();
  });
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    dialog.animate(
      [
        { opacity: 0, transform: "translateY(12px) scale(.98)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
};
window.addEventListener('snaap-account-ready', () => {
  if (conversationDialogScope !== conversationScope()) conversationDialog?.close();
});
const chatComposer = document.createElement("div");
chatComposer.className = "chat-composer";
$("#followup-form").before(chatComposer);
chatComposer.append(previews, $("#followup-form"), chatTools, sources);
const presetsReady=import('./presets.js').then(m=>m.initPresets({state,api,esc,toast,chatComposer,showDesigner,setWorkbenchTab,ensureConversation,saveDraft,renderDesigner,refresh,fullSummary,message,scrollChatToLatest,persistRecovery,chatEmpty}));
chatTools.querySelector('[data-attach-image]').setAttribute('aria-label',(globalThis.SnaapI18n?.text("แนบภาพ") ?? "แนบภาพ"));
chatTools.querySelector('[data-attach-image]').title=(globalThis.SnaapI18n?.text("แนบภาพกราฟ") ?? "แนบภาพกราฟ");
const chatSendButton=$('#followup-form button[type="submit"]');
chatSendButton.classList.add('chat-send-button');
chatSendButton.setAttribute('form','followup-form');
chatSendButton.setAttribute('aria-label',(globalThis.SnaapI18n?.text("ส่งข้อความ") ?? "ส่งข้อความ"));
delete chatSendButton.dataset.tooltip;
chatSendButton.innerHTML=uiIcon('arrowUp');
chatTools.append(chatSendButton);
const latestMessages = document.createElement('button');
latestMessages.type='button';
latestMessages.className='chat-latest';
latestMessages.textContent=(globalThis.SnaapI18n?.text("↓ ข้อความล่าสุด") ?? "↓ ข้อความล่าสุด");
latestMessages.hidden=true;
chatComposer.before(latestMessages);
const messagePane=$('#messages');
messagePane.tabIndex=0;
messagePane.setAttribute('aria-label',(globalThis.SnaapI18n?.text("ประวัติการสนทนา") ?? "ประวัติการสนทนา"));
let followingChat=true;
function scrollChatToLatest(){messagePane.scrollTop=messagePane.scrollHeight;followingChat=true;latestMessages.hidden=true;}
function focusChatArtifact(card){if(!card?.isConnected)return;followingChat=false;messagePane.scrollTop+=card.getBoundingClientRect().top-messagePane.getBoundingClientRect().top-8;}
latestMessages.onclick=scrollChatToLatest;
messagePane.addEventListener('scroll',()=>{
  followingChat=messagePane.scrollHeight-messagePane.scrollTop-messagePane.clientHeight<80;
  latestMessages.hidden=followingChat;
},{passive:true});
messagePane.addEventListener('wheel',()=>{followingChat=false;},{passive:true});
messagePane.addEventListener('touchstart',()=>{followingChat=false;},{passive:true});
messagePane.addEventListener('pointerdown',()=>{followingChat=false;});
messagePane.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))followingChat=false;});
new MutationObserver(()=>{
  if(followingChat)scrollChatToLatest();else latestMessages.hidden=false;
}).observe(messagePane,{childList:true,subtree:true,characterData:true});
function sizeWorkbench(){
  if(workbench.hidden)return;
  const top=workbench.getBoundingClientRect().top;
  workbench.style.setProperty('--workbench-height',Math.max(280,window.innerHeight-top-20)+'px');
}
window.addEventListener('resize',sizeWorkbench);
new ResizeObserver(()=>{
  latestMessages.style.bottom=(chatComposer.offsetHeight+20)+'px';
  if(followingChat)requestAnimationFrame(scrollChatToLatest);
}).observe(chatComposer);
const followupText = document.createElement("textarea");
followupText.id = "followup-input";
followupText.rows = 2;
followupText.maxLength = 1600;
followupText.placeholder = (globalThis.SnaapI18n?.text("เล่าไอเดียเทรดที่อยากลอง…") ?? "เล่าไอเดียเทรดที่อยากลอง…");
$("#followup-input").replaceWith(followupText);
const chatPromptSamples = [
  (globalThis.SnaapI18n?.text("วิเคราะห์ประวัติเทรดที่ซิงก์ไว้ แล้วช่วยออกแบบเซ็ตอัพให้ฉัน") ?? "วิเคราะห์ประวัติเทรดที่ซิงก์ไว้ แล้วช่วยออกแบบเซ็ตอัพให้ฉัน"),
  (globalThis.SnaapI18n?.text("มีสไตล์การเทรดแบบไหนที่เหมาะกับเวลาและเป้าหมายของฉันบ้าง?") ?? "มีสไตล์การเทรดแบบไหนที่เหมาะกับเวลาและเป้าหมายของฉันบ้าง?"),
  (globalThis.SnaapI18n?.text("เพิ่งเริ่มเทรด ช่วยอธิบายกราฟและอินดิเคเตอร์แบบเข้าใจง่าย") ?? "เพิ่งเริ่มเทรด ช่วยอธิบายกราฟและอินดิเคเตอร์แบบเข้าใจง่าย"),
  (globalThis.SnaapI18n?.text("ช่วยถามทีละข้อ เพื่อหาสไตล์การเทรดที่ฉันอยากลอง") ?? "ช่วยถามทีละข้อ เพื่อหาสไตล์การเทรดที่ฉันอยากลอง"),
  (globalThis.SnaapI18n?.text("อธิบายความต่างระหว่าง Spot กับ Futures ให้ฉันหน่อย") ?? "อธิบายความต่างระหว่าง Spot กับ Futures ให้ฉันหน่อย"),
  (globalThis.SnaapI18n?.text("ช่วยอ่านกราฟที่แนบ แล้วสรุปแนวโน้มกับจุดที่ควรสังเกต") ?? "ช่วยอ่านกราฟที่แนบ แล้วสรุปแนวโน้มกับจุดที่ควรสังเกต"),
  (globalThis.SnaapI18n?.text("ช่วยออกแบบเซ็ตอัพตามเทรนด์ด้วย EMA และ RSI") ?? "ช่วยออกแบบเซ็ตอัพตามเทรนด์ด้วย EMA และ RSI"),
  (globalThis.SnaapI18n?.text("อยากลองเซ็ตอัพ Breakout ช่วยวางเงื่อนไขยืนยันให้หน่อย") ?? "อยากลองเซ็ตอัพ Breakout ช่วยวางเงื่อนไขยืนยันให้หน่อย"),
  (globalThis.SnaapI18n?.text("ช่วยออกแบบเซ็ตอัพรอราคาย่อตัวในแนวโน้มขาขึ้น") ?? "ช่วยออกแบบเซ็ตอัพรอราคาย่อตัวในแนวโน้มขาขึ้น"),
  (globalThis.SnaapI18n?.text("ตลาดออกข้าง ควรออกแบบเงื่อนไขแบบไหน?") ?? "ตลาดออกข้าง ควรออกแบบเงื่อนไขแบบไหน?"),
  (globalThis.SnaapI18n?.text("ช่วยออกแบบเซ็ตอัพ Long และ Short ให้มีเงื่อนไขชัดเจน") ?? "ช่วยออกแบบเซ็ตอัพ Long และ Short ให้มีเงื่อนไขชัดเจน"),
  (globalThis.SnaapI18n?.text("ช่วยย่อไอเดียเทรดของฉันให้เป็นเซ็ตอัพไม่เกิน 24 เงื่อนไข") ?? "ช่วยย่อไอเดียเทรดของฉันให้เป็นเซ็ตอัพไม่เกิน 24 เงื่อนไข"),
  (globalThis.SnaapI18n?.text("ฉันดูกราฟได้วันละนิด ควรเลือกกรอบเวลาแบบไหน?") ?? "ฉันดูกราฟได้วันละนิด ควรเลือกกรอบเวลาแบบไหน?"),
  (globalThis.SnaapI18n?.text("ช่วยเปรียบเทียบการเล่นสั้นกับการถือหลายวัน") ?? "ช่วยเปรียบเทียบการเล่นสั้นกับการถือหลายวัน"),
  (globalThis.SnaapI18n?.text("จากประวัติที่ซิงก์ไว้ ฉันซื้อขายคู่ไหนและฝั่งไหนบ่อยที่สุด?") ?? "จากประวัติที่ซิงก์ไว้ ฉันซื้อขายคู่ไหนและฝั่งไหนบ่อยที่สุด?"),
  (globalThis.SnaapI18n?.text("ช่วยสรุปพฤติกรรมการเทรดที่เห็นจากข้อมูลของฉัน") ?? "ช่วยสรุปพฤติกรรมการเทรดที่เห็นจากข้อมูลของฉัน"),
  (globalThis.SnaapI18n?.text("ช่วยทำเช็กลิสต์ก่อนเข้าเทรดให้ใช้ได้ทุกครั้ง") ?? "ช่วยทำเช็กลิสต์ก่อนเข้าเทรดให้ใช้ได้ทุกครั้ง"),
  (globalThis.SnaapI18n?.text("ช่วยอธิบายจุดตัดขาดทุนและเป้ากำไรด้วยตัวอย่างง่าย ๆ") ?? "ช่วยอธิบายจุดตัดขาดทุนและเป้ากำไรด้วยตัวอย่างง่าย ๆ"),
  (globalThis.SnaapI18n?.text("ช่วยวางแผนความเสี่ยงต่อครั้งจากงบที่ฉันกำหนด") ?? "ช่วยวางแผนความเสี่ยงต่อครั้งจากงบที่ฉันกำหนด"),
  (globalThis.SnaapI18n?.text("เซ็ตอัพนี้มีเงื่อนไขซ้ำซ้อนหรือขัดกันตรงไหนบ้าง?") ?? "เซ็ตอัพนี้มีเงื่อนไขซ้ำซ้อนหรือขัดกันตรงไหนบ้าง?"),
  (globalThis.SnaapI18n?.text("ช่วยเพิ่มเงื่อนไขกรองสัญญาณหลอกให้เซ็ตอัพของฉัน") ?? "ช่วยเพิ่มเงื่อนไขกรองสัญญาณหลอกให้เซ็ตอัพของฉัน"),
  (globalThis.SnaapI18n?.text("ช่วยดูว่าควรใช้วอลุ่มยืนยันสัญญาณตรงไหน") ?? "ช่วยดูว่าควรใช้วอลุ่มยืนยันสัญญาณตรงไหน"),
  (globalThis.SnaapI18n?.text("อยากใช้หลายกรอบเวลาร่วมกัน ช่วยจัดเงื่อนไขให้หน่อย") ?? "อยากใช้หลายกรอบเวลาร่วมกัน ช่วยจัดเงื่อนไขให้หน่อย"),
  (globalThis.SnaapI18n?.text("ช่วยออกแบบวิธีทบทวนการเทรดและจดบันทึกหลังจบแต่ละรอบ") ?? "ช่วยออกแบบวิธีทบทวนการเทรดและจดบันทึกหลังจบแต่ละรอบ"),
  (globalThis.SnaapI18n?.text("ช่วยอ่านภาพอ้างอิงของฉัน แล้วอธิบายแนวคิดที่นำไปทำเซ็ตอัพได้") ?? "ช่วยอ่านภาพอ้างอิงของฉัน แล้วอธิบายแนวคิดที่นำไปทำเซ็ตอัพได้"),
  (globalThis.SnaapI18n?.text("ช่วยวางแผนทดลองเซ็ตอัพย้อนหลัง ก่อนนำไปใช้จริง") ?? "ช่วยวางแผนทดลองเซ็ตอัพย้อนหลัง ก่อนนำไปใช้จริง"),
];
const chatPromptHint = document.createElement('span');
chatPromptHint.className = 'chat-prompt-hint';
chatPromptHint.setAttribute('aria-hidden', 'true');
followupText.after(chatPromptHint);
let promptBag = [], promptMotionVersion = 0;
function nextChatPrompt() {
  if (!promptBag.length) {
    promptBag = [...chatPromptSamples];
    for (let i = promptBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [promptBag[i], promptBag[j]] = [promptBag[j], promptBag[i]];
    }
    if (promptBag.at(-1) === chatPromptHint.textContent) promptBag.reverse();
  }
  return promptBag.pop();
}
function syncChatPromptHint() {
  const visible = workbench.dataset.tab === 'chat' && !followupText.value && document.activeElement !== followupText;
  chatPromptHint.hidden = !visible;
  followupText.classList.toggle('has-prompt-hint', visible);
  if (!visible) {
    promptMotionVersion++;
    chatPromptHint.getAnimations().forEach(animation => animation.cancel());
  } else if (!chatPromptHint.textContent) chatPromptHint.textContent = nextChatPrompt();
}
async function rotateChatPrompt() {
  syncChatPromptHint();
  if (chatPromptHint.hidden || document.hidden || !followupText.getClientRects().length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const version = ++promptMotionVersion;
  try {
    await chatPromptHint.animate([{opacity:1},{opacity:0}],{duration:300,easing:'ease-in',fill:'forwards'}).finished;
  } catch { return; }
  if (version !== promptMotionVersion || followupText.value || document.activeElement === followupText) {
    chatPromptHint.getAnimations().forEach(animation => animation.cancel());
    return;
  }
  chatPromptHint.textContent = nextChatPrompt();
  chatPromptHint.getAnimations().forEach(animation => animation.cancel());
  chatPromptHint.animate([{opacity:0},{opacity:1}],{duration:450,easing:'ease-out'});
}
setInterval(rotateChatPrompt, 4500);
followupText.addEventListener('input', syncChatPromptHint);
followupText.addEventListener('focus', syncChatPromptHint);
followupText.addEventListener('blur', syncChatPromptHint);
syncChatPromptHint();
function resizeChatInputs() {
  syncChatPromptHint();
  $('#conversation').style.removeProperty('--chat-empty-bottom-space');
  chatComposer.style.removeProperty('--chat-composer-min-height');
  for(const field of [$('#chat-input'),$('#followup-input')]){
    if(!field?.getClientRects().length)continue;
    const style=getComputedStyle(field);
    const minimum=parseFloat(style.minHeight)||76;
    let maximum=parseFloat(style.maxHeight)||240;
    if(field===followupText){
      const conversation=$('#conversation');
      const paneStyle=getComputedStyle(conversation);
      // Only constrain the input when the pane has a bounded viewport layout.
      if(paneStyle.overflowY!=='visible'){
        const composerStyle=getComputedStyle(chatComposer);
        const px=value=>parseFloat(value)||0;
        const outerHeight=element=>{
          const computed=getComputedStyle(element);
          return element.offsetHeight+px(computed.marginTop)+px(computed.marginBottom);
        };
        const limit=composerStyle.maxHeight;
        let available;
        if(limit!=='none')available=limit.endsWith('%')?conversation.clientHeight*px(limit)/100:px(limit);
        else{
          const siblings=[...conversation.children].filter(element=>element!==chatComposer && element.getClientRects().length && !['absolute','fixed'].includes(getComputedStyle(element).position));
          available=conversation.clientHeight-px(paneStyle.paddingTop)-px(paneStyle.paddingBottom)-siblings.reduce((sum,element)=>sum+outerHeight(element),0)-px(paneStyle.rowGap)*siblings.length-px(composerStyle.marginTop)-px(composerStyle.marginBottom);
        }
        const chrome=chatComposer.scrollHeight-field.offsetHeight+px(composerStyle.borderTopWidth)+px(composerStyle.borderBottomWidth);
        chatComposer.style.setProperty('--chat-composer-min-height',(chrome+minimum)+'px');
        if(limit!=='none')available=Math.max(available,chrome+minimum);
        if(limit==='none' && available<chrome+minimum){
          // Let decorative greeting space yield before scrolling the whole pane.
          const bottom=px(paneStyle.paddingBottom);
          const reduced=Math.max(12,bottom-(chrome+minimum-available)-1);
          conversation.style.setProperty('--chat-empty-bottom-space',reduced+'px');
          available+=bottom-reduced;
        }
        maximum=Math.max(minimum,Math.min(maximum,Math.floor(available-chrome)));
      }
    }
    field.style.height='auto';
    const border=(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0);
    const height=Math.max(minimum,field.scrollHeight+border);
    field.style.height=Math.min(maximum,height)+'px';
    field.style.overflowY=height>maximum?'auto':'hidden';
  }
}
for(const field of [$('#chat-input'),followupText])field.addEventListener('input',resizeChatInputs);
window.addEventListener('resize',resizeChatInputs);
// Refit after tab changes, attachments, source controls, or viewport layout changes.
const chatInputLayoutObserver=new ResizeObserver(resizeChatInputs);
chatInputLayoutObserver.observe($('#conversation'));
chatInputLayoutObserver.observe(chatComposer);
for(const section of chatComposer.children)chatInputLayoutObserver.observe(section);
followupText.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $("#followup-form").requestSubmit();
  }
});
const welcomeAttach = document.createElement("button");
welcomeAttach.type = "button";
welcomeAttach.className = "text-button";
welcomeAttach.setAttribute("data-attach-image", "");
welcomeAttach.textContent = (globalThis.SnaapI18n?.text("แนบภาพกราฟ") ?? "แนบภาพกราฟ");
$("#chat-form").after(welcomeAttach);
$("#view-home .intro").textContent = (globalThis.SnaapI18n?.text("พิมพ์ไอเดียหรือแนบกราฟ แล้วออกแบบเทรดเซ็ตอัพไปด้วยกัน") ?? "พิมพ์ไอเดียหรือแนบกราฟ แล้วออกแบบเทรดเซ็ตอัพไปด้วยกัน");
$$(".welcome .suggestions button").forEach((button) =>
  button.insertAdjacentHTML(
    "beforeend",
    `<span class="launch-arrow" aria-hidden="true">${uiIcon("arrow")}</span>`,
  ),
);
function chatEmpty() {
  if (!$("#messages").children.length)
    $("#messages").innerHTML =
      (globalThis.SnaapI18n?.text("<div class=\"chat-empty\"><strong>คุยกับ <span class=\"snaap-name\">Snaap</span></strong><p><span>พิมพ์ไอเดียหรือแนบกราฟ</span> <span>แล้วออกแบบเทรดเซ็ตอัพไปด้วยกัน</span></p></div>") ?? "<div class=\"chat-empty\"><strong>คุยกับ <span class=\"snaap-name\">Snaap</span></strong><p><span>พิมพ์ไอเดียหรือแนบกราฟ</span> <span>แล้วออกแบบเทรดเซ็ตอัพไปด้วยกัน</span></p></div>");
}
const badge = $(".prototype-badge");
badge.title = (globalThis.SnaapI18n?.text("บัญชี / แพ็กเกจ") ?? "บัญชี / แพ็กเกจ");
badge.setAttribute('aria-label', badge.title);
badge.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/></svg>';
badge.dataset.action = "billing";
const accountButton = $(".profile");
accountButton.dataset.action = "account-menu";
accountButton.title = (globalThis.SnaapI18n?.text("เมนูบัญชี") ?? "เมนูบัญชี");
accountButton.setAttribute("aria-expanded", "false");
accountButton.setAttribute("aria-controls", "account-menu");
accountButton.setAttribute("aria-haspopup", "true");
accountButton.querySelector(".icon").remove();
const accountMenu = document.createElement("div");
accountMenu.id = "account-menu";
accountMenu.className = "account-menu";
accountMenu.hidden = true;
accountMenu.setAttribute("aria-label", (globalThis.SnaapI18n?.text("เมนูบัญชี") ?? "เมนูบัญชี"));
accountButton.before(accountMenu);
const accountContact = document.createElement("a");
accountContact.className = "account-contact";
accountContact.href = "mailto:contract@snaap.me";
accountContact.draggable = false;
accountContact.textContent = (globalThis.SnaapI18n?.text("ติดต่อเรา · contract@snaap.me") ?? "ติดต่อเรา · contract@snaap.me");
accountContact.setAttribute("aria-label", (globalThis.SnaapI18n?.text("ติดต่อเรา: contract@snaap.me") ?? "ติดต่อเรา: contract@snaap.me"));
accountButton.before(accountContact);
function closeAccountMenu(restoreFocus = false) {
  accountMenu.hidden = true;
  accountButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) accountButton.focus();
}
document.addEventListener("click", (event) => {
  if (!accountMenu.hidden && !accountMenu.contains(event.target) && !accountButton.contains(event.target)) closeAccountMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !accountMenu.hidden) {
    event.preventDefault();
    closeAccountMenu(true);
  }
});
const sidebar = $("#sidebar");
const menuButton = $('[data-action="menu"]');
const sidebarBackdrop = $(".sidebar-backdrop");
menuButton.setAttribute("aria-controls", "sidebar");
menuButton.setAttribute("aria-expanded", "false");
function setSidebarOpen(open, restoreFocus = true) {
  const wasOpen = sidebar.classList.contains("is-open");
  sidebar.classList.toggle("is-open", open);
  sidebarBackdrop.hidden = !open;
  $(".main-shell").inert = open;
  menuButton.setAttribute("aria-expanded", String(open));
  if (open) sidebar.querySelector(".nav-item").focus();
  else if (wasOpen && restoreFocus) menuButton.focus();
}
matchMedia("(max-width: 899px)").addEventListener("change", () => setSidebarOpen(false, false));
document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || !sidebar.classList.contains("is-open") || document.querySelector("dialog[open]")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    setSidebarOpen(false);
  } else if (event.key === "Tab") {
    const items = [...sidebar.querySelectorAll('a[href],button:not(:disabled),input,select,[tabindex="0"]')].filter(el => el.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }
});
async function api(url, method = "GET", body, options = {}) {
  const headers = { "x-snaap-client": "web" };
  if(options.onEvent)headers.Accept='application/x-ndjson';
  if(state.workspaceId)headers['x-snaap-workspace']=state.workspaceId;
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const res = await fetch("/api/v1" + url, {
    method,
    headers,
    signal: options.signal,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if(res.ok && options.onEvent && res.headers.get('content-type')?.includes('application/x-ndjson')) {
    const {readChatStream}=await import('./chat-stream.js');
    return readChatStream(res,options.onEvent);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error((globalThis.SnaapI18n?.text("ยังเชื่อมต่อ backend ไม่ได้") ?? "ยังเชื่อมต่อ backend ไม่ได้"));
  }
  if (!res.ok) {
    const error = Error(data.error?.message ?? (globalThis.SnaapI18n?.text("ทำรายการไม่สำเร็จ") ?? "ทำรายการไม่สำเร็จ"));
    error.statusCode = res.status;
    if(res.status===401 && state.me){persistRecovery();location.replace('/login.html?error=expired');}
    throw error;
  }
  return data;
}
function alignToast() {
  const notice = $("#toast");
  if (notice.hidden) return;
  const shell = $(".main-shell").getBoundingClientRect();
  // Global notices belong to the whole workspace, regardless of panel widths.
  const center = shell.left + shell.width / 2;
  notice.style.left = `${center}px`;
  notice.style.maxWidth = `${Math.max(0, 2 * Math.min(center - shell.left, shell.right - center) - 32)}px`;
}
const toastLayoutObserver = new ResizeObserver(alignToast);
toastLayoutObserver.observe($(".main-shell"));
window.addEventListener("resize", alignToast);
function toast(text) {
  window.SnaapToast.show(text, alignToast);
}
function message(text, user = false) {
  const el = document.createElement("div");
  el.className = "message " + (user ? "user" : "assistant");
  if (user) el.textContent = text;
  else {
    const body = document.createElement("div");
    body.className = "assistant-body";
    body.textContent = text;
    assistantTextReady.then(({renderAssistantText})=>{if(body.isConnected)renderAssistantText(body,text);}).catch(()=>{});
    el.append(body);
  }
  $("#messages").append(el);
  return el;
}
async function showSetupChanges(before, after, historicalChanges = null) {
  const {diffSetup,describeSetupValue}=await setupChangesReady;
  const changes=historicalChanges??diffSetup(before,after);
  if(!changes.length)return;
  const conversation=state.conversation,workspace=state.workspaceId,target=JSON.stringify(after);
  const card=document.createElement('section');
  card.className='setup-change-card';
  card.setAttribute('aria-label',(globalThis.SnaapI18n?.text("สิ่งที่ snaap เปลี่ยนในเซ็ตอัพ") ?? "สิ่งที่ snaap เปลี่ยนในเซ็ตอัพ"));
  const valueText=(value,path)=>path==='destinations'&&Array.isArray(value)
    ?(value.map(id=>state.destinations.find(d=>d.id===id)?.name??(globalThis.SnaapI18n?.text("ช่องทางที่บันทึกไว้") ?? "ช่องทางที่บันทึกไว้")).join(', ')||(globalThis.SnaapI18n?.text("กล่องแจ้งเตือนในเว็บ") ?? "กล่องแจ้งเตือนในเว็บ"))
    :describeSetupValue(value);
  card.innerHTML=`<details><summary>${historicalChanges?(globalThis.SnaapI18n?.text("ข้อเสนอเซ็ตอัพในข้อความนี้") ?? "ข้อเสนอเซ็ตอัพในข้อความนี้"):(globalThis.SnaapI18n?.text("ดูสิ่งที่ปรับในร่าง") ?? "ดูสิ่งที่ปรับในร่าง")} · ${changes.length}${(globalThis.SnaapI18n?.text(" จุด</summary><ul>") ?? " จุด</summary><ul>")}${changes.map(c=>`<li><span class="change-action">${{add:(globalThis.SnaapI18n?.text("เพิ่ม") ?? "เพิ่ม"),remove:(globalThis.SnaapI18n?.text("นำออก") ?? "นำออก"),change:(globalThis.SnaapI18n?.text("เปลี่ยน") ?? "เปลี่ยน")}[c.action]}</span><div><strong>${esc(globalThis.SnaapI18n?.text(c.label) ?? c.label)}</strong><div>${c.action!=='add'?`<span class="change-before">${esc(valueText(c.before,c.path))}</span>`:''}${c.action==='change'?'<span aria-hidden="true"> → </span>':''}${c.action!=='remove'?`<span class="change-after">${esc(valueText(c.after,c.path))}</span>`:''}</div></div></li>`).join('')}</ul><small>${historicalChanges?(globalThis.SnaapI18n?.text("ข้อเสนอขณะสนทนา · ไม่ใช่สถานะปัจจุบัน") ?? "ข้อเสนอขณะสนทนา · ไม่ใช่สถานะปัจจุบัน"):(globalThis.SnaapI18n?.text("ปรับเฉพาะร่าง · ยังไม่เปลี่ยนเซ็ตอัพที่กำลังแจ้งเตือน") ?? "ปรับเฉพาะร่าง · ยังไม่เปลี่ยนเซ็ตอัพที่กำลังแจ้งเตือน")}</small>${!historicalChanges&&before?(globalThis.SnaapI18n?.text("<button class=\"secondary\" type=\"button\" data-revert-change>ย้อนการปรับครั้งนี้</button>") ?? "<button class=\"secondary\" type=\"button\" data-revert-change>ย้อนการปรับครั้งนี้</button>"):''}</details>`;
  card.querySelector('[data-revert-change]')?.addEventListener('click',()=>{
    if(state.busy)return toast((globalThis.SnaapI18n?.text("รอขั้นตอนปัจจุบันเสร็จก่อน") ?? "รอขั้นตอนปัจจุบันเสร็จก่อน"));
    if(state.conversation!==conversation||state.workspaceId!==workspace||JSON.stringify(state.draft)!==target)
      return toast((globalThis.SnaapI18n?.text("มีการปรับเซ็ตอัพต่อแล้ว ใช้ย้อนกลับในพื้นที่ออกแบบเพื่อไล่ทีละขั้น") ?? "มีการปรับเซ็ตอัพต่อแล้ว ใช้ย้อนกลับในพื้นที่ออกแบบเพื่อไล่ทีละขั้น"));
    state.draft=structuredClone(before);state.undo.pop();state.replay=null;
    renderDesigner();queueDraftSave();
    card.querySelector('small').textContent=(globalThis.SnaapI18n?.text("ย้อนการปรับครั้งนี้แล้ว") ?? "ย้อนการปรับครั้งนี้แล้ว");
    card.querySelector('[data-revert-change]').disabled=true;
  });
  $('#messages').append(card);
}
async function showChatSetupCard() {
  const conversation=state.conversation,workspace=state.workspaceId;
  const current=()=>state.conversation===conversation&&state.workspaceId===workspace;
  try {
    await saveDraft();
    if(!current())return;
    const result=await api(`/conversations/${conversation}/setup-card`,'POST',{
      expectedRevision:state.draftRevision,...(state.saved?{ruleId:state.saved.id}:{}),
    });
    if(!current())return;
    (await presetsReady).renderCard(result.message);
    scrollChatToLatest();
  } catch(error) {
    if(!current())return;
    const retry=document.createElement('button');
    retry.type='button';retry.className='secondary';
    retry.textContent=(globalThis.SnaapI18n?.text("แสดงปุ่มบันทึกเซ็ตอัพอีกครั้ง") ?? "แสดงปุ่มบันทึกเซ็ตอัพอีกครั้ง");
    retry.onclick=async()=>{if(!current())return;retry.remove();await showChatSetupCard();};
    message((globalThis.SnaapI18n?.text("ยังเตรียมปุ่มบันทึกไม่สำเร็จ: ") ?? "ยังเตรียมปุ่มบันทึกไม่สำเร็จ: ")+error.message);
    $('#messages').append(retry);
  }
}
function navigate(view, load = true) {
  if (view === "watch") {
    notificationSection = "rules";
    view = "notifications";
    window.SnaapRouter.replace("notifications");
  }
  if (view === "billing") {
    toast((globalThis.SnaapI18n?.text("เร็ว ๆ นี้") ?? "เร็ว ๆ นี้"));
    view = "home";
    window.SnaapRouter.replace("home");
  }
  if (!["home", "watch", "history", "notifications", "sentiment"].includes(view))
    view = "home";
  $$(".view").forEach((el) => (el.hidden = el.id !== "view-" + view));
  $$(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === view);
    if (el.dataset.view === view) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  $("#page-name").textContent = {
    home: (globalThis.SnaapI18n?.text("แชท") ?? "แชท"),
    sentiment: (globalThis.SnaapI18n?.text("ภาพรวมตลาด") ?? "ภาพรวมตลาด"),
    watch: (globalThis.SnaapI18n?.text("รายการแจ้งเตือน") ?? "รายการแจ้งเตือน"),
    history: (globalThis.SnaapI18n?.text("ข้อมูลของฉัน") ?? "ข้อมูลของฉัน"),
    notifications: (globalThis.SnaapI18n?.text("การแจ้งเตือน") ?? "การแจ้งเตือน"),
    billing: (globalThis.SnaapI18n?.text("บัญชีและแพ็กเกจ") ?? "บัญชีและแพ็กเกจ"),
  }[view];
  setSidebarOpen(false);
  requestAnimationFrame(alignToast);
  if (!load || !state.workspaceId) return;
  if (view === "watch") renderWatch();
  if (view === "history" && historyWorkspace !== state.workspaceId && historyLoadingWorkspace !== state.workspaceId) renderHistory();
  if (view === "notifications") {
    void window.SnaapSignalUnread?.enter();
    renderNotifications(false);
  }
  if (view === "billing") renderBilling();
}
function showDesigner() {
  renderConversationTitle();
  chatEmpty();
  state.draft ??= initial();
  $("#welcome").hidden = true;
  $("#conversation").hidden = false;
  workbench.hidden = false;
  requestAnimationFrame(sizeWorkbench);
  tabs.hidden = false;
  newConversationButton.hidden=false;
  renderDesigner();
}
let requestedWorkbenchMode;
function setWorkbenchTab(mode) {
  // Mobile shares one workspace; its selected pane determines the visible content.
  const mobileChat = mode === 'chat' && innerWidth < 900;
  mode = mode === 'chat' && !mobileChat ? 'chat' : 'split';
  requestAnimationFrame(resizeChatInputs);
  requestAnimationFrame(alignToast);
  requestedWorkbenchMode = mode;
  const applyMode = () => {
    if (requestedWorkbenchMode !== mode) return;
    workbench.dataset.tab = mode;
    if (mobileChat) workbench.dataset.inspector = "agent";
    setupPaneNav.hidden = mode !== 'split';
    followupText.placeholder = mode === 'split'
      ? (globalThis.SnaapI18n?.text("เล่าไอเดียเทรด แล้วออกแบบเซ็ตอัพแบบเรียลไทม์ผ่านการพูดคุย…") ?? "เล่าไอเดียเทรด แล้วออกแบบเซ็ตอัพแบบเรียลไทม์ผ่านการพูดคุย…")
      : (globalThis.SnaapI18n?.text("เล่าไอเดียเทรดที่อยากลอง…") ?? "เล่าไอเดียเทรดที่อยากลอง…");
    syncChatPromptHint();
    requestAnimationFrame(() => document.dispatchEvent(new Event("workbench-mode-changed")));
  };
  applyMode();
  tabs
    .querySelectorAll("button")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.tab === mode)),
    );
}
function snapshot() {
  state.editorNotice = null;
  state.undo.push(structuredClone(state.draft));
  if (state.undo.length > 30) state.undo.shift();
  state.replay = null;
}
function draftDirty() {
  return (
    state.draft &&
    JSON.stringify(state.draft) !==
      (state.persistedDraft ?? JSON.stringify(state.saved?.spec ?? initial()))
  );
}
let draftTimer, draftFlight, conversationFlight;
let draftStatus = "", draftStatusState = "pending";
function showDraftStatus(text, status = "pending") {
  draftStatus = text;
  draftStatusState = status;
  const label = panel.querySelector("[data-draft-status]");
  if (label) {
    const savedLabel = panel.querySelector(".saved-label");
    label.textContent = status === "saved" ? (globalThis.SnaapI18n?.text("เก็บร่างในแชทแล้ว") ?? "เก็บร่างในแชทแล้ว") : text || savedLabel?.textContent || (globalThis.SnaapI18n?.text("ร่างใหม่") ?? "ร่างใหม่");
    label.hidden = false;
    label.title = (globalThis.SnaapI18n?.text("เก็บร่างอัตโนมัติในแชท · การบันทึกเป็นเซ็ตอัพและเปิดใช้งานเป็นขั้นตอนแยกกัน") ?? "เก็บร่างอัตโนมัติในแชท · การบันทึกเป็นเซ็ตอัพและเปิดใช้งานเป็นขั้นตอนแยกกัน");
    label.dataset.state = status;
  }
}
async function ensureConversation(title = state.draft?.name ?? (globalThis.SnaapI18n?.text("เซ็ตอัพใหม่") ?? "เซ็ตอัพใหม่")) {
  if (state.conversation) return state.conversation;
  conversationFlight ??= api("/conversations", "POST", {
    title: title.slice(0, 100),
  })
    .then((c) => {
      window.SnaapStudio?.adoptConversation(c.id);
      state.conversation = c.id;
      state.conversationRows.unshift({ ...c, workspace_id:state.workspaceId, draft: null, draft_revision: 0 });
      conversationCache.upsert(state.conversationRows[0]);
      renderConversationTitle();
      const option = new Option(c.title, c.id, true, true);
      conversations.add(option);
      conversationPicker.hidden = false;
      return c.id;
    })
    .finally(() => {
      conversationFlight = null;
    });
  return conversationFlight;
}
async function saveDraft() {
  clearTimeout(draftTimer);
  if (!hasEntryCondition()) {
    persistRecovery();
    return;
  }
  if (draftFlight) {
    await draftFlight;
    if (draftDirty()) return saveDraft();
    return;
  }
  if (!draftDirty()) return;
  draftFlight = (async () => {
    showDraftStatus((globalThis.SnaapI18n?.text("กำลังบันทึกร่าง…") ?? "กำลังบันทึกร่าง…"), "saving");
    try {
      const id = await ensureConversation();
      // Keep the exact sent value: edits made during the request need a later save.
      const sent = JSON.stringify(state.draft);
      const result = await api(`/conversations/${id}/draft`, "PUT", {
        spec: JSON.parse(sent),
        expectedRevision: state.draftRevision,
      });
      state.draftRevision = result.draft_revision;
      state.persistedDraft = sent;
      const row = state.conversationRows.find((x) => x.id === id);
      if (row)
        Object.assign(row, {
          draft: JSON.parse(sent),
          draft_revision: result.draft_revision,
        });
      if (row) conversationCache.upsert(row);
      showDraftStatus((globalThis.SnaapI18n?.text("บันทึกร่างแล้ว") ?? "บันทึกร่างแล้ว"), "saved");
      persistRecovery();
    } catch (error) {
      showDraftStatus(persistRecovery() ? (globalThis.SnaapI18n?.text("เก็บร่างในเครื่องแล้ว · ซิงก์ไม่สำเร็จ") ?? "เก็บร่างในเครื่องแล้ว · ซิงก์ไม่สำเร็จ") : (globalThis.SnaapI18n?.text("ยังไม่บันทึก · ") ?? "ยังไม่บันทึก · ") + error.message, "error");
      throw error;
    }
  })();
  try {
    await draftFlight;
  } finally {
    draftFlight = null;
  }
  if (draftDirty()) return saveDraft();
}
let lastNotifiedDraft = '';
function queueDraftSave() {
  persistRecovery();
  const current = JSON.stringify([conversationScope(), state.draft]);
  if (current !== lastNotifiedDraft) {
    lastNotifiedDraft = current;
    document.dispatchEvent(new Event('setup-changed'));
  }
  const undoButton = panel.querySelector("[data-undo]");
  if (undoButton) undoButton.disabled = state.undo.length === 0;
  const summary = panel.querySelector(".draft-diff");
  if (summary && state.draft) summary.textContent = fullSummary(state.draft);
  if (!hasEntryCondition()) {
    clearTimeout(draftTimer);
    showDraftStatus((globalThis.SnaapI18n?.text("ร่างยังไม่มีเงื่อนไข") ?? "ร่างยังไม่มีเงื่อนไข"));
    return;
  }
  if (!draftDirty()) {
    clearTimeout(draftTimer);
    if (!draftFlight)
      showDraftStatus(state.persistedDraft ? (globalThis.SnaapI18n?.text("บันทึกร่างแล้ว") ?? "บันทึกร่างแล้ว") : "", state.persistedDraft ? "saved" : "pending");
    return;
  }
  clearTimeout(draftTimer);
  showDraftStatus((globalThis.SnaapI18n?.text("รอบันทึกร่าง…") ?? "รอบันทึกร่าง…"));
  draftTimer = setTimeout(() => {
    saveDraft().catch(() => {});
  }, 700);
}
async function leaveDraft() {
  if (state.saving) { toast((globalThis.SnaapI18n?.text("กำลังบันทึกเซ็ตอัพ รอสักครู่") ?? "กำลังบันทึกเซ็ตอัพ รอสักครู่")); return false; }
  if (state.busy) {
    toast((globalThis.SnaapI18n?.text("รอ snaap ตอบก่อนเปลี่ยนบทสนทนา") ?? "รอ snaap ตอบก่อนเปลี่ยนบทสนทนา"));
    return false;
  }
  try {
    await saveDraft();
    return true;
  } catch {
    if (persistRecovery()) return true;
    return confirm(
      (globalThis.SnaapI18n?.text("บันทึกร่างไม่สำเร็จ ต้องการทิ้งการแก้ไขแล้วเปลี่ยนหน้าหรือไม่?") ?? "บันทึกร่างไม่สำเร็จ ต้องการทิ้งการแก้ไขแล้วเปลี่ยนหน้าหรือไม่?"),
    );
  }
}
window.addEventListener("beforeunload", (event) => {
  if (draftDirty() && !persistRecovery()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener('snaap:language-changing', event => {
  if (state.busy || state.saving) {
    event.preventDefault();
    toast(globalThis.SnaapI18n?.language === 'en' ? 'Please wait for the current action to finish.' : 'กรุณารอให้รายการปัจจุบันเสร็จก่อน');
    return;
  }
  if (recoveryReady && !persistRecovery() && (draftDirty() || $('#chat-input').value || $('#followup-input').value)) {
    event.preventDefault();
    toast(globalThis.SnaapI18n?.language === 'en' ? 'Save your draft before changing language.' : 'กรุณาบันทึกร่างก่อนเปลี่ยนภาษา');
  }
});
function operandText(o) {
  return o.kind === "CONSTANT"
    ? String(o.value)
    : o.kind === "ENTRY_RETURN"
      ? (globalThis.SnaapI18n?.text("เปลี่ยนจากราคาสัญญาณเข้า (%)") ?? "เปลี่ยนจากราคาสัญญาณเข้า (%)")
      : o.kind === "PRICE"
        ? `${display[o.field] ?? o.field} (${o.timeframe})`
        : o.formula ? `${o.formula.title} (${o.timeframe})` : indicatorCatalog?.indicatorByName[o.name]
          ? `${indicatorCatalog.indicatorByName[o.name].label} ${indicatorCatalog.indicatorByName[o.name].params.map(p=>`${p.key}=${p.key==='period'?o.period:o.params?.[p.key]??p.value}`).join(' · ')} (${o.timeframe})`
          : `${o.name} ${o.period} (${o.timeframe})`;
}
function comparableSpec(value) {
  if (Array.isArray(value)) return value.map(comparableSpec);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, comparableSpec(value[key])]),
    );
  return value;
}
function conditionText(c) {
  if (c.kind === "GROUP" && !c.children.length) return (globalThis.SnaapI18n?.text("ยังไม่มีเงื่อนไขเข้า") ?? "ยังไม่มีเงื่อนไขเข้า");
  if (c.kind === "GROUP")
    return (
      "(" +
      c.children.map(conditionText).join(c.op === "AND" ? (globalThis.SnaapI18n?.text(" และ ") ?? " และ ") : (globalThis.SnaapI18n?.text(" หรือ ") ?? " หรือ ")) +
      ")"
    );
  if (c.kind === "HOLD")
    return `${conditionText(c.condition)}${(globalThis.SnaapI18n?.text(" ต่อเนื่อง ") ?? " ต่อเนื่อง ")}${c.bars}${(globalThis.SnaapI18n?.text(" แท่ง") ?? " แท่ง")}`;
  return `${operandText(c.left)} ${{ CROSS_ABOVE: (globalThis.SnaapI18n?.text("ตัดขึ้นเหนือ") ?? "ตัดขึ้นเหนือ"), CROSS_BELOW: (globalThis.SnaapI18n?.text("ตัดลงต่ำกว่า") ?? "ตัดลงต่ำกว่า") }[c.op] ?? c.op} ${operandText(c.right)}`;
}
const display = {
  PRICE: (globalThis.SnaapI18n?.text("ราคา / วอลุ่ม") ?? "ราคา / วอลุ่ม"),
  INDICATOR: (globalThis.SnaapI18n?.text("อินดิเคเตอร์") ?? "อินดิเคเตอร์"),
  CONSTANT: (globalThis.SnaapI18n?.text("ตัวเลข") ?? "ตัวเลข"),
  ENTRY_RETURN: (globalThis.SnaapI18n?.text("การเปลี่ยนราคาตามฝั่ง (%)") ?? "การเปลี่ยนราคาตามฝั่ง (%)"),
  open: (globalThis.SnaapI18n?.text("ราคาเปิด") ?? "ราคาเปิด"),
  high: (globalThis.SnaapI18n?.text("สูงสุด") ?? "สูงสุด"),
  low: (globalThis.SnaapI18n?.text("ต่ำสุด") ?? "ต่ำสุด"),
  close: (globalThis.SnaapI18n?.text("ราคาปิด") ?? "ราคาปิด"),
  volume: (globalThis.SnaapI18n?.text("วอลุ่ม") ?? "วอลุ่ม"),
  CROSS_ABOVE: (globalThis.SnaapI18n?.text("ตัดขึ้นเหนือ") ?? "ตัดขึ้นเหนือ"),
  CROSS_BELOW: (globalThis.SnaapI18n?.text("ตัดลงต่ำกว่า") ?? "ตัดลงต่ำกว่า"),
  ">": (globalThis.SnaapI18n?.text("มากกว่า (>)") ?? "มากกว่า (>)"),
  ">=": (globalThis.SnaapI18n?.text("มากกว่าหรือเท่ากับ (≥)") ?? "มากกว่าหรือเท่ากับ (≥)"),
  "<": (globalThis.SnaapI18n?.text("น้อยกว่า (<)") ?? "น้อยกว่า (<)"),
  "<=": (globalThis.SnaapI18n?.text("น้อยกว่าหรือเท่ากับ (≤)") ?? "น้อยกว่าหรือเท่ากับ (≤)"),
  AND: (globalThis.SnaapI18n?.text("ครบทุกข้อ (AND)") ?? "ครบทุกข้อ (AND)"),
  OR: (globalThis.SnaapI18n?.text("อย่างน้อยหนึ่งข้อ (OR)") ?? "อย่างน้อยหนึ่งข้อ (OR)"),
};
const options = (values, selected) =>
  values
    .map(
      (x) =>
        `<option value="${esc(x)}" ${x === selected ? "selected" : ""}>${esc(display[x] ?? x)}</option>`,
    )
    .join("");
const timeframeOptions = (selected, d = state.draft) => {
  const values = setupTimeframes(d);
  return (selected && !values.includes(selected) ? `<option value="${esc(selected)}" selected disabled>${esc(selected)}${(globalThis.SnaapI18n?.text(" · ตลาดนี้ไม่รองรับ</option>") ?? " · ตลาดนี้ไม่รองรับ</option>")}` : "") + options(values, selected);
};
function operandUI(o, path, title) {
  const select = (label, key, values, value) =>
    `<label>${label}<select data-path="${path}.${key}">${key === "timeframe" ? timeframeOptions(value) : options(values, value)}</select></label>`;
  const number = (label, key, value, attributes = "") =>
    `<label>${label}<input type="number" data-path="${path}.${key}" value="${value}" ${attributes}></label>`;
  let fields = `${(globalThis.SnaapI18n?.text("<label>ชนิดค่า<select data-opkind=\"") ?? "<label>ชนิดค่า<select data-opkind=\"")}${path}">${options(["PRICE", "INDICATOR", "CONSTANT", "ENTRY_RETURN"], o.kind)}</select></label>`;
  if (o.kind === "CONSTANT")
    fields += number((globalThis.SnaapI18n?.text("ค่าที่เปรียบเทียบ") ?? "ค่าที่เปรียบเทียบ"), "value", o.value, 'step="any"');
  if (o.kind === "PRICE")
    fields += select(
      (globalThis.SnaapI18n?.text("แหล่งราคา") ?? "แหล่งราคา"),
      "field",
      ["open", "high", "low", "close", "volume"],
      o.field,
    );
  if (o.kind === "INDICATOR") {

    if(o.formula)fields += `${(globalThis.SnaapI18n?.text("<p>สูตรนำเข้า: ") ?? "<p>สูตรนำเข้า: ")}${esc(o.formula.title)} · v${o.formula.version}</p>`;
    fields += select(
      (globalThis.SnaapI18n?.text("อินดิเคเตอร์") ?? "อินดิเคเตอร์"),
      "name",
      [
        ...(o.name === "CUSTOM" ? ["CUSTOM"] : []),
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
        ...(indicatorCatalog?.extendedNames??[]),

      ],
      o.name,
    );
    const extended=indicatorCatalog?.indicatorByName[o.name];
    if(extended)fields+=extended.params.map(p=>number(p.label,p.key==='period'?'period':`params.${p.key}`,p.key==='period'?o.period:o.params?.[p.key]??p.value,`min="${p.min}" max="${p.max}" step="${p.integer?1:.001}"`)).join('');
    if(o.name!=="CUSTOM"&&!extended)fields += number(
      (globalThis.SnaapI18n?.text("ระยะอินดิเคเตอร์ (แท่ง)") ?? "ระยะอินดิเคเตอร์ (แท่ง)"),
      "period",
      o.period,
      'min="2" max="500"',
    );
    if(extended?extended.source:!["ATR","VOLUME_RATIO","MFI","CMF","STOCH_K","WILLIAMS_R","DONCHIAN_UPPER","DONCHIAN_LOWER","DONCHIAN_MID","TR"].includes(o.name))fields += select(
      (globalThis.SnaapI18n?.text("แหล่งค่าของอินดิเคเตอร์") ?? "แหล่งค่าของอินดิเคเตอร์"),
      "source",
      ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"],
      o.source ?? "close",
    );

    if (o.name.startsWith("MACD"))
      fields +=
        number((globalThis.SnaapI18n?.text("MACD slow (แท่ง)") ?? "MACD slow (แท่ง)"), "slow", o.slow ?? 26) +
        number((globalThis.SnaapI18n?.text("MACD signal (แท่ง)") ?? "MACD signal (แท่ง)"), "signal", o.signal ?? 9);
    if (o.name.startsWith("BB_"))
      fields += number(
        (globalThis.SnaapI18n?.text("ส่วนเบี่ยงเบนมาตรฐาน") ?? "ส่วนเบี่ยงเบนมาตรฐาน"),
        "deviation",
        o.deviation ?? 2,
        'step="0.1"',
      );
  }
  if (["PRICE", "INDICATOR"].includes(o.kind))
   fields += select((globalThis.SnaapI18n?.text("กรอบเวลา") ?? "กรอบเวลา"), "timeframe", setupTimeframes(), o.timeframe);
  return `<div class="operand-block" role="group" aria-label="${title}"><div class="operand-heading"><p class="operand-title">${title}</p>${o.kind === "INDICATOR" ? `<button type="button" class="indicator-import-trigger" data-import-indicator="${path}">${uiIcon("file")}${(globalThis.SnaapI18n?.text("<span>นำเข้าสูตร / TradingView</span></button>") ?? "<span>นำเข้าสูตร / TradingView</span></button>")}` : ""}</div><div class="operand-fields${o.kind === "INDICATOR" ? " indicator-fields" : ""}">${fields}</div>${o.kind === "INDICATOR" ? `${(globalThis.SnaapI18n?.text("<div class=\"operand-reference\"><a href=\"/indicator-guide.html\" target=\"_blank\" rel=\"noopener\">สูตร หน่วย และข้อมูลที่ต้องใช้ ") ?? "<div class=\"operand-reference\"><a href=\"/indicator-guide.html\" target=\"_blank\" rel=\"noopener\">สูตร หน่วย และข้อมูลที่ต้องใช้ ")}${uiIcon("arrowUpRight")}</a></div>` : ""}</div>`;
}
function conditionUI(c, path) {
  if (c.kind === "GROUP")
    return `${(globalThis.SnaapI18n?.text("<div class=\"condition-group\"><select aria-label=\"เงื่อนไขกลุ่ม\" data-path=\"") ?? "<div class=\"condition-group\"><select aria-label=\"เงื่อนไขกลุ่ม\" data-path=\"")}${path}.op">${options(["AND", "OR"], c.op)}</select>${c.children.map((x, i) => `<details class="group-condition" data-condition-editor="${path}.children.${i}${(globalThis.SnaapI18n?.text("\"><summary>ข้อ ") ?? "\"><summary>ข้อ ")}${i + 1}<span>${esc(conditionText(x))}</span></summary><div>${conditionUI(x, `${path}.children.${i}`)}${c.children.length > 1 ? `<button class="text-button" data-remove="${path}.children.${i}${(globalThis.SnaapI18n?.text("\">ลบข้อ ") ?? "\">ลบข้อ ")}${i + 1}</button>` : ""}</div></details>`).join("")}<button class="text-button" data-add="${path}${(globalThis.SnaapI18n?.text("\">เพิ่มเงื่อนไข</button></div>") ?? "\">เพิ่มเงื่อนไข</button></div>")}`;
  if (c.kind === "HOLD")
    return `${(globalThis.SnaapI18n?.text("<label>ต่อเนื่องกี่แท่ง<input type=\"number\" min=\"1\" max=\"30\" data-path=\"") ?? "<label>ต่อเนื่องกี่แท่ง<input type=\"number\" min=\"1\" max=\"30\" data-path=\"")}${path}.bars" value="${c.bars}"></label>${conditionUI(c.condition, path + ".condition")}`;
  const chartLinks = [...new Set([c.left.timeframe,c.right.timeframe].filter(Boolean))].map(frame => `<button type="button" class="secondary" data-open-condition-chart="${esc(frame)}${(globalThis.SnaapI18n?.text("\">ดูกราฟ ") ?? "\">ดูกราฟ ")}${esc(frame)}</button>`).join('');
  return `<div class="condition-chart-links">${chartLinks}</div><div class="condition-line">${operandUI(c.left, path + ".left", (globalThis.SnaapI18n?.text("ค่าที่ตรวจ") ?? "ค่าที่ตรวจ"))}${(globalThis.SnaapI18n?.text("<label class=\"comparison-field\">การเปรียบเทียบ<select class=\"operator\" data-path=\"") ?? "<label class=\"comparison-field\">การเปรียบเทียบ<select class=\"operator\" data-path=\"")}${path}.op">${options([">", ">=", "<", "<=", "CROSS_ABOVE", "CROSS_BELOW"], c.op)}</select></label>${operandUI(c.right, path + ".right", (globalThis.SnaapI18n?.text("เทียบกับ") ?? "เทียบกับ"))}</div><div class="condition-tools"><button class="text-button" data-group="${path}${(globalThis.SnaapI18n?.text("\">จัดกลุ่ม AND / OR</button><button class=\"text-button\" data-hold=\"") ?? "\">จัดกลุ่ม AND / OR</button><button class=\"text-button\" data-hold=\"")}${path}${(globalThis.SnaapI18n?.text("\">ต่อเนื่องหลายแท่ง</button></div>") ?? "\">ต่อเนื่องหลายแท่ง</button></div>")}`;
}
let MAX_SETUP_CONDITIONS;
const setupLimitsReady = import("./setup-limits.js").then(m => MAX_SETUP_CONDITIONS = m.MAX_SETUP_CONDITIONS);
function setupConditionCount(spec) {
  const count = c => !c ? 0 : c.kind === "GROUP" ? c.children.reduce((n, child) => n + count(child), 0) : c.kind === "HOLD" ? count(c.condition) : 1;
  const branch = b => !b ? 0 : count(b.entry) + count(b.exit) + count(b.cancel) + (b.stages ?? []).reduce((n, stage) => n + count(stage.condition), 0);
  return branch(spec) + branch(spec?.short);
}
function canAddSetupCondition() {
  if (setupConditionCount(state.draft) < MAX_SETUP_CONDITIONS) return true;
  toast((globalThis.SnaapI18n?.text("ครบ 24 เงื่อนไขแล้ว ลบข้อเดิมก่อนเพิ่มข้อใหม่") ?? "ครบ 24 เงื่อนไขแล้ว ลบข้อเดิมก่อนเพิ่มข้อใหม่"));
  return false;
}
function renderDesigner() {
  if(state.draft?.side==='SHORT'&&state.draft.mirrorShort)state.draft=directionTools.selectDirections(state.draft,['SHORT']);
  const openConditions = [
    ...panel.querySelectorAll("[data-condition-editor][open]"),
  ].map((el) => el.dataset.conditionEditor);
  const openAdvanced = panel.querySelector("[data-advanced-options]")?.open;
  const focused = document.activeElement;
  const focusKey = panel.contains(focused)
    ? [
        "data-path",
        "data-opkind",
        "data-exchange",
        "data-destination",
        "data-pairs",
      ].find((k) => focused.hasAttribute(k))
    : null;
  const focusValue = focusKey ? focused.getAttribute(focusKey) : null;
  setWorkbenchTab(requestedWorkbenchMode ?? workbench.dataset.tab);
  queueDraftSave();
  const d = state.draft;
  panel.innerHTML = `${(globalThis.SnaapI18n?.text("<div class=\"design-toolbar\"><strong>ออกแบบเซ็ตอัพ</strong><span class=\"saved-label\">") ?? "<div class=\"design-toolbar\"><strong>ออกแบบเซ็ตอัพ</strong><span class=\"saved-label\">")}${state.saved ? (globalThis.SnaapI18n?.text("เวอร์ชัน ") ?? "เวอร์ชัน ") + state.saved.revision : (globalThis.SnaapI18n?.text("ร่างใหม่") ?? "ร่างใหม่")}${state.saved && JSON.stringify(comparableSpec(state.saved.spec)) !== JSON.stringify(comparableSpec(d)) ? (globalThis.SnaapI18n?.text(" · ยังไม่บันทึก") ?? " · ยังไม่บันทึก") : ""}</span><button class="text-button" data-undo ${state.undo.length ? "" : "disabled"}${(globalThis.SnaapI18n?.text(">ย้อนกลับ</button></div><div class=\"design-body\"><div id=\"editor-feedback\" tabindex=\"-1\" hidden></div><label>ชื่อเซ็ตอัพ<input data-path=\"name\" value=\"") ?? ">ย้อนกลับ</button></div><div class=\"design-body\"><div id=\"editor-feedback\" tabindex=\"-1\" hidden></div><label>ชื่อเซ็ตอัพ<input data-path=\"name\" value=\"")}${esc(d.name)}${(globalThis.SnaapI18n?.text("\" maxlength=\"100\"></label><div class=\"field-grid\"><label>รอบตรวจแท่งปิด<select data-path=\"timeframe\">") ?? "\" maxlength=\"100\"></label><div class=\"field-grid\"><label>รอบตรวจแท่งปิด<select data-path=\"timeframe\">")}${timeframeOptions(d.timeframe, d)}${(globalThis.SnaapI18n?.text("</select></label></div><div class=\"pair-control asset-control\"><span>สินทรัพย์</span><button type=\"button\" class=\"secondary\" data-pair-picker data-pair-example=\"") ?? "</select></label></div><div class=\"pair-control asset-control\"><span>สินทรัพย์</span><button type=\"button\" class=\"secondary\" data-pair-picker data-pair-example=\"")}${esc(d.pairs[0] ?? "BTC/USDT")}"><span>${esc(d.pairs.length > 1 ? d.pairs.length + (globalThis.SnaapI18n?.text(" คู่เทรด") ?? " คู่เทรด") : d.pairs[0] ?? (globalThis.SnaapI18n?.text("เลือกสินทรัพย์") ?? "เลือกสินทรัพย์"))}${(globalThis.SnaapI18n?.text("</span><span>เปลี่ยน ▾</span></button><small>") ?? "</span><span>เปลี่ยน ▾</span></button><small>")}${esc(d.market === "Spot" ? "Spot" : "Perpetual")} · ${esc(d.exchange.join(", "))}</small><p class="field-note" data-pair-availability role="status"></p></div>${directionChoices(d)}<section class="setup-section"><h3>1. ${d.market === "Spot" ? (globalThis.SnaapI18n?.text("เงื่อนไขเริ่มต้น") ?? "เงื่อนไขเริ่มต้น") : d.side === "SHORT" ? (globalThis.SnaapI18n?.text("เงื่อนไข Short") ?? "เงื่อนไข Short") : d.side ? (globalThis.SnaapI18n?.text("เงื่อนไข Long") ?? "เงื่อนไข Long") : (globalThis.SnaapI18n?.text("เงื่อนไขเริ่มต้น") ?? "เงื่อนไขเริ่มต้น")}</h3>${conditionUI(d.entry, "entry")}</section><details data-advanced-options ${openAdvanced || d.stages.length || d.exit || d.cancel || d.cooldownBars ? "open" : ""}${(globalThis.SnaapI18n?.text("><summary>เงื่อนไขเพิ่มเติม<span>รอยืนยัน · สัญญาณออก · ยกเลิก · พักสัญญาณ</span></summary><div class=\"advanced-options\">") ?? "><summary>เงื่อนไขเพิ่มเติม<span>รอยืนยัน · สัญญาณออก · ยกเลิก · พักสัญญาณ</span></summary><div class=\"advanced-options\">")}${d.stages.map((s, i) => `<section class="setup-section"><h3>${i + 2}${(globalThis.SnaapI18n?.text(". รอยืนยัน</h3><label>ภายในกี่แท่ง<input type=\"number\" min=\"1\" max=\"100\" data-path=\"stages.") ?? ". รอยืนยัน</h3><label>ภายในกี่แท่ง<input type=\"number\" min=\"1\" max=\"100\" data-path=\"stages.")}${i}.withinBars" value="${s.withinBars}"></label>${conditionUI(s.condition, `stages.${i}.condition`)}<button class="text-button" data-remove="stages.${i}${(globalThis.SnaapI18n?.text("\">ลบขั้นตอน</button></section>") ?? "\">ลบขั้นตอน</button></section>")}`).join("")}${(globalThis.SnaapI18n?.text("<button class=\"secondary\" data-stage>เพิ่มขั้นตอนรอยืนยัน</button><section class=\"setup-section\"><h3>สัญญาณออก / ยกเลิก</h3>") ?? "<button class=\"secondary\" data-stage>เพิ่มขั้นตอนรอยืนยัน</button><section class=\"setup-section\"><h3>สัญญาณออก / ยกเลิก</h3>")}${d.exit ? `${(globalThis.SnaapI18n?.text("<div class=\"optional-condition\"><div class=\"optional-heading\"><h4>เงื่อนไขสัญญาณออก</h4><button class=\"text-button\" data-remove-optional=\"exit\">ลบเงื่อนไขออก</button></div>") ?? "<div class=\"optional-condition\"><div class=\"optional-heading\"><h4>เงื่อนไขสัญญาณออก</h4><button class=\"text-button\" data-remove-optional=\"exit\">ลบเงื่อนไขออก</button></div>")}${conditionUI(d.exit, "exit")}</div>` : (globalThis.SnaapI18n?.text("<button class=\"text-button\" data-optional=\"exit\">เพิ่มเงื่อนไขออก</button>") ?? "<button class=\"text-button\" data-optional=\"exit\">เพิ่มเงื่อนไขออก</button>")}${d.cancel ? `${(globalThis.SnaapI18n?.text("<div class=\"optional-condition\"><div class=\"optional-heading\"><h4>เงื่อนไขยกเลิก</h4><button class=\"text-button\" data-remove-optional=\"cancel\">ลบเงื่อนไขยกเลิก</button></div>") ?? "<div class=\"optional-condition\"><div class=\"optional-heading\"><h4>เงื่อนไขยกเลิก</h4><button class=\"text-button\" data-remove-optional=\"cancel\">ลบเงื่อนไขยกเลิก</button></div>")}${conditionUI(d.cancel, "cancel")}</div>` : (globalThis.SnaapI18n?.text("<button class=\"text-button\" data-optional=\"cancel\">เพิ่มเงื่อนไขยกเลิก</button>") ?? "<button class=\"text-button\" data-optional=\"cancel\">เพิ่มเงื่อนไขยกเลิก</button>")}${(globalThis.SnaapI18n?.text("<p class=\"field-note\">วงจรสัญญาณ ไม่ใช่ออเดอร์ที่ถือจริง</p></section><label>พักหลังสัญญาณ (แท่ง)<input type=\"number\" min=\"0\" max=\"1000\" data-path=\"cooldownBars\" value=\"") ?? "<p class=\"field-note\">วงจรสัญญาณ ไม่ใช่ออเดอร์ที่ถือจริง</p></section><label>พักหลังสัญญาณ (แท่ง)<input type=\"number\" min=\"0\" max=\"1000\" data-path=\"cooldownBars\" value=\"")}${d.cooldownBars}"></label></div></details>${d.short?`${(globalThis.SnaapI18n?.text("<details class=\"setup-custom-short\"><summary>เงื่อนไข Short</summary>") ?? "<details class=\"setup-custom-short\"><summary>เงื่อนไข Short</summary>")}${conditionUI(d.short.entry,"short.entry")}${d.short.stages.map((s,i)=>`${(globalThis.SnaapI18n?.text("<h4>รอยืนยัน ") ?? "<h4>รอยืนยัน ")}${i+1}</h4>${conditionUI(s.condition,`short.stages.${i}.condition`)}${(globalThis.SnaapI18n?.text("<label>ภายในกี่แท่ง<input type=\"number\" min=\"1\" max=\"100\" data-path=\"short.stages.") ?? "<label>ภายในกี่แท่ง<input type=\"number\" min=\"1\" max=\"100\" data-path=\"short.stages.")}${i}.withinBars" value="${s.withinBars}"></label>`).join("")}${d.short.exit?`${(globalThis.SnaapI18n?.text("<h4>สัญญาณออก Short</h4>") ?? "<h4>สัญญาณออก Short</h4>")}${conditionUI(d.short.exit,"short.exit")}`:""}${d.short.cancel?`${(globalThis.SnaapI18n?.text("<h4>ยกเลิก Short</h4>") ?? "<h4>ยกเลิก Short</h4>")}${conditionUI(d.short.cancel,"short.cancel")}`:""}${(globalThis.SnaapI18n?.text("<label>พักสัญญาณ Short (แท่ง)<input type=\"number\" min=\"0\" max=\"1000\" data-path=\"short.cooldownBars\" value=\"") ?? "<label>พักสัญญาณ Short (แท่ง)<input type=\"number\" min=\"0\" max=\"1000\" data-path=\"short.cooldownBars\" value=\"")}${d.short.cooldownBars}"></label></details>`:""}${(globalThis.SnaapI18n?.text("<details open class=\"rule-review\"><summary>สรุปเซ็ตอัพ</summary><p class=\"draft-diff\">") ?? "<details open class=\"rule-review\"><summary>สรุปเซ็ตอัพ</summary><p class=\"draft-diff\">")}${esc(fullSummary(d))}${(globalThis.SnaapI18n?.text("</p></details><fieldset class=\"destination-choices\"><legend>แจ้งเตือนไปที่</legend><p>กล่องแจ้งเตือนในเว็บเสมอ</p>") ?? "</p></details><fieldset class=\"destination-choices\"><legend>แจ้งเตือนไปที่</legend><p>กล่องแจ้งเตือนในเว็บเสมอ</p>")}${state.destinations
    .filter((x) => x.verified)
    .map(
      (x) =>
        `<label><input type="checkbox" data-destination="${x.id}" ${d.destinations.includes(x.id) ? "checked" : ""}>${esc(x.name)}</label>`,
    )
    .join(
      "",
    )}${(globalThis.SnaapI18n?.text("</fieldset><div class=\"design-actions studio-footer-actions\"><button type=\"button\" class=\"secondary\" data-save>บันทึก</button><button type=\"button\" class=\"primary\" data-studio-activate disabled>เปิดใช้งาน</button></div><div id=\"replay-result\"></div></div>") ?? "</fieldset><div class=\"design-actions studio-footer-actions\"><button type=\"button\" class=\"secondary\" data-save>บันทึก</button><button type=\"button\" class=\"primary\" data-studio-activate disabled>เปิดใช้งาน</button></div><div id=\"replay-result\"></div></div>")}`;
  const conditionCount = setupConditionCount(d);
  const limitLabel = document.createElement("p");
  limitLabel.className = "field-note setup-condition-limit";
  limitLabel.setAttribute("role", "status");
  limitLabel.textContent = `${(globalThis.SnaapI18n?.text("เงื่อนไข ") ?? "เงื่อนไข ")}${conditionCount}/${MAX_SETUP_CONDITIONS}${(globalThis.SnaapI18n?.text(" · รวมเริ่มต้น รอยืนยัน ออก ยกเลิก และ Short ที่ตั้งแยก") ?? " · รวมเริ่มต้น รอยืนยัน ออก ยกเลิก และ Short ที่ตั้งแยก")}`;
  panel.querySelector("#editor-feedback").after(limitLabel);
  if (conditionCount >= MAX_SETUP_CONDITIONS) panel.querySelectorAll("[data-add], [data-group], [data-stage], [data-optional]").forEach(button => {
    button.disabled = true;
    button.title = (globalThis.SnaapI18n?.text("ครบ 24 เงื่อนไขแล้ว ลบข้อเดิมก่อนเพิ่มข้อใหม่") ?? "ครบ 24 เงื่อนไขแล้ว ลบข้อเดิมก่อนเพิ่มข้อใหม่");
  });
  if (d.stages.length >= 5) panel.querySelector("[data-stage]").disabled = true;
  const draftLabel = document.createElement("span");
  draftLabel.className = "field-note";
  draftLabel.dataset.draftStatus = "";
  draftLabel.setAttribute("role", "status");
  draftLabel.textContent = draftStatus;
  const toolbarMeta = document.createElement("span");
  toolbarMeta.className = "studio-toolbar-meta";
  const savedLabel = panel.querySelector(".saved-label");
  savedLabel.hidden = true;
  savedLabel.before(toolbarMeta);
  toolbarMeta.append(savedLabel, draftLabel);
  showDraftStatus(draftStatus, draftStatusState);
  panel
    .querySelector(".design-toolbar strong")
    .insertAdjacentHTML("afterbegin", uiIcon("sliders"));
  panel.querySelectorAll("[data-condition-editor]").forEach((el) => {
    el.open = openConditions.includes(el.dataset.conditionEditor);
  });
  if (state.editorNotice)
    showEditorFeedback(
      state.editorNotice.text,
      state.editorNotice.success,
      false,
    );
  if (focusKey)
    [...panel.querySelectorAll(`[${focusKey}]`)]
      .find((el) => el.getAttribute(focusKey) === focusValue)
      ?.focus({ preventScroll: true });
  document.dispatchEvent(new Event('setup-rendered'));
  if (state.replay) {
    panel.querySelector(".design-body").prepend($("#replay-result"));
    renderReplay();
  }
}
function showEditorFeedback(text, success = false, focus = true) {
  state.editorNotice = { text, success };
  const box = panel.querySelector("#editor-feedback");
  if (!box) return;
  box.hidden = false;
  box.className = success ? "editor-feedback success" : "editor-feedback error";
  box.setAttribute("role", success ? "status" : "alert");
  box.replaceChildren();
  const message = document.createElement("p");
  message.textContent = text;
  box.append(message);
  if (success) {
    const link = document.createElement("a");
    link.href = "/watch";
    link.textContent = (globalThis.SnaapI18n?.text("ไปดูเซ็ตอัพที่ตั้งไว้") ?? "ไปดูเซ็ตอัพที่ตั้งไว้");
    box.append(link);
  }
  if (focus) {
    box.focus();
    box.scrollIntoView({ block: "center", behavior: "instant" });
  }
}
function validateEditor() {
  if (!hasEntryCondition()) {
    showEditorFeedback((globalThis.SnaapI18n?.text("เพิ่มเงื่อนไขเข้าก่อนบันทึกเซ็ตอัพ") ?? "เพิ่มเงื่อนไขเข้าก่อนบันทึกเซ็ตอัพ"));
    return false;
  }
  if (setupConditionCount(state.draft) > MAX_SETUP_CONDITIONS) {
    showEditorFeedback((globalThis.SnaapI18n?.text("เซ็ตอัพมีได้สูงสุด 24 เงื่อนไข กรุณาลบข้อที่เกินก่อนบันทึก") ?? "เซ็ตอัพมีได้สูงสุด 24 เงื่อนไข กรุณาลบข้อที่เกินก่อนบันทึก"));
    return false;
  }
  panel
    .querySelectorAll("[aria-invalid]")
    .forEach((el) => el.removeAttribute("aria-invalid"));
  let field, message;
  if (!state.draft.name.trim()) {
    field = panel.querySelector('[data-path="name"]');
    message = (globalThis.SnaapI18n?.text("ตั้งชื่อเซ็ตอัพก่อนบันทึก เช่น BTC เหนือ EMA 200") ?? "ตั้งชื่อเซ็ตอัพก่อนบันทึก เช่น BTC เหนือ EMA 200");
  } else if (!state.draft.exchange.length) {
    field = panel.querySelector("[data-pair-picker]");
    message = (globalThis.SnaapI18n?.text("เลือกอย่างน้อย 1 กระดาน") ?? "เลือกอย่างน้อย 1 กระดาน");
  } else if (state.draft.market !== "Spot" && !["LONG","SHORT","BOTH"].includes(state.draft.side)) {
    field=panel.querySelector("[data-direction]");
    message=(globalThis.SnaapI18n?.text("เลือก Long, Short หรือทั้งคู่ก่อนบันทึก") ?? "เลือก Long, Short หรือทั้งคู่ก่อนบันทึก");
  } else if (!state.draft.pairs.length) {
    field = panel.querySelector("[data-pair-picker]");
    message = (globalThis.SnaapI18n?.text("ระบุคู่เทรด เช่น BTC/USDT") ?? "ระบุคู่เทรด เช่น BTC/USDT");
  } else {
    field = [...panel.querySelectorAll('input[type="number"]')].find(
      (el) => !el.value || !el.validity.valid,
    );
    if (field) message = (globalThis.SnaapI18n?.text("ตรวจค่าตัวเลขในช่องที่ทำเครื่องหมายไว้") ?? "ตรวจค่าตัวเลขในช่องที่ทำเครื่องหมายไว้");
  }
  if (!message) return true;
  showEditorFeedback(message);
  field.setAttribute("aria-invalid", "true");
  field.setAttribute("aria-describedby", "editor-feedback");
  for (
    let parent = field.parentElement;
    parent && panel.contains(parent);
    parent = parent.parentElement
  ) {
    if (parent.tagName === "DETAILS") parent.open = true;
  }
  field.focus();
  return false;
}
function at(path) {
  return path.split(".").reduce((o, k) => o[k], state.draft);
}
function set(path, value) {
  const keys = path.split("."),
    last = keys.pop();
  keys.reduce((o, k) => o[k] ?? (o[k] = {}), state.draft)[last] = value;
}
function watchChannelMark(channel) {
  const logo = { DISCORD: "discord.svg", TELEGRAM: "telegram.svg", LINE: "line.png" }[channel.kind];
  return logo ? `<img src="/assets/brands/${logo}" alt="" width="14" height="14">` : uiIcon("link");
}
async function setRuleActivation(r, t, active = !r?.active) {
  if (!r || t.disabled) return;
  const original = t.innerHTML;
  t.disabled = true;
  t.textContent = active ? (globalThis.SnaapI18n?.text("กำลังเปิดใช้งาน…") ?? "กำลังเปิดใช้งาน…") : (globalThis.SnaapI18n?.text("กำลังหยุด…") ?? "กำลังหยุด…");
  t.setAttribute("aria-busy", "true");
  try {
    const updated = await api(`/rules/${r.id}/activation`, "POST", {
      active,
      expectedRevision: r.revision,
      confirmation: active ? "ACTIVATE" : "PAUSE",
    });
    Object.assign(r, updated);
    if (state.saved?.id === r.id) state.saved = r;
    renderWatch();
    if (state.saved?.id === r.id) renderDesigner();
    document.dispatchEvent(new Event('setup-changed'));
    toast(active ? (globalThis.SnaapI18n?.text("เปิดเซ็ตอัพแล้ว เริ่มตรวจแท่งปิดถัดไป") ?? "เปิดเซ็ตอัพแล้ว เริ่มตรวจแท่งปิดถัดไป") : (globalThis.SnaapI18n?.text("หยุดเซ็ตอัพแล้ว") ?? "หยุดเซ็ตอัพแล้ว"));
  } finally {
    t.disabled = false;
    if (t.isConnected) t.innerHTML = original;
    t.removeAttribute("aria-busy");
  }
}
function watchChannelPicker(r) {
  const channels = state.destinations.filter(d => d.verified);
  return `${(globalThis.SnaapI18n?.text("<details class=\"watch-channel-picker\"><summary aria-label=\"เลือกช่องทางแจ้งเตือน ") ?? "<details class=\"watch-channel-picker\"><summary aria-label=\"เลือกช่องทางแจ้งเตือน ")}${esc(r.spec.name)}${(globalThis.SnaapI18n?.text("\" title=\"เลือกช่องทางแจ้งเตือน\">") ?? "\" title=\"เลือกช่องทางแจ้งเตือน\">")}${uiIcon("bell")}${(globalThis.SnaapI18n?.text("แจ้งเตือน<svg class=\"ui-icon watch-channel-chevron\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m6 9 6 6 6-6\"/></svg></summary><div class=\"watch-channel-menu\"><strong>ส่งสัญญาณไปที่</strong><p>รับในเว็บเสมอ · เลือกเพิ่มได้ 5 ช่องทาง</p>") ?? "แจ้งเตือน<svg class=\"ui-icon watch-channel-chevron\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"m6 9 6 6 6-6\"/></svg></summary><div class=\"watch-channel-menu\"><strong>ส่งสัญญาณไปที่</strong><p>รับในเว็บเสมอ · เลือกเพิ่มได้ 5 ช่องทาง</p>")}${channels.length ? channels.map(d => `<label>${watchChannelMark(d)}<span>${esc(d.name)}</span><input type="checkbox" value="${esc(d.id)}" ${r.spec.destinations.includes(d.id) ? "checked" : ""}></label>`).join("") : (globalThis.SnaapI18n?.text("<p class=\"watch-channel-empty\">ยังไม่มีช่องทางที่เชื่อมไว้</p>") ?? "<p class=\"watch-channel-empty\">ยังไม่มีช่องทางที่เชื่อมไว้</p>")}${(globalThis.SnaapI18n?.text("<div class=\"watch-channel-actions\"><a href=\"/notifications\" data-watch-connect-channel>เชื่อมช่องทาง</a><button type=\"button\" class=\"primary\" data-save-rule-channels=\"") ?? "<div class=\"watch-channel-actions\"><a href=\"/notifications\" data-watch-connect-channel>เชื่อมช่องทาง</a><button type=\"button\" class=\"primary\" data-save-rule-channels=\"")}${esc(r.id)}${(globalThis.SnaapI18n?.text("\">บันทึก</button></div></div></details>") ?? "\">บันทึก</button></div></div></details>")}`;
}
function watchSetupRow(r) {
  const pairs = r.spec.pairs;
  const pairPreview = pairs.slice(0, 2).join(", ");
  const remaining = pairs.length - 2;
  const direction = r.spec.market === "Spot" ? (globalThis.SnaapI18n?.text("ซื้อ") ?? "ซื้อ")
    : { LONG: "Long", SHORT: "Short", BOTH: "Long + Short" }[r.spec.side] ?? (globalThis.SnaapI18n?.text("ยังไม่ระบุฝั่ง") ?? "ยังไม่ระบุฝั่ง");
  const status = r.quota_blocked
    ? (globalThis.SnaapI18n?.text("หยุดตรวจ · เกินสิทธิ์แพ็กเกจ") ?? "หยุดตรวจ · เกินสิทธิ์แพ็กเกจ")
    : r.active ? (globalThis.SnaapI18n?.text("เปิดใช้งาน") ?? "เปิดใช้งาน") : (globalThis.SnaapI18n?.text("ยังไม่เปิดใช้งาน") ?? "ยังไม่เปิดใช้งาน");
  const destinations = r.spec.destinations.map(id => state.destinations.find(d => d.id === id)).filter(Boolean);
  const channelTags = destinations.map(d => `<span class="watch-tag watch-channel-tag ${r.active && !r.quota_blocked && d.verified ? "is-routing" : ""}" title="${d.verified ? r.quota_blocked ? (globalThis.SnaapI18n?.text("พักส่ง · เกินสิทธิ์แพ็กเกจ") ?? "พักส่ง · เกินสิทธิ์แพ็กเกจ") : r.active ? (globalThis.SnaapI18n?.text("เปิดส่งแจ้งเตือน") ?? "เปิดส่งแจ้งเตือน") : (globalThis.SnaapI18n?.text("ส่งเมื่อเปิดใช้งานเซ็ตอัพ") ?? "ส่งเมื่อเปิดใช้งานเซ็ตอัพ") : (globalThis.SnaapI18n?.text("ช่องทางตัดการเชื่อมต่อแล้ว") ?? "ช่องทางตัดการเชื่อมต่อแล้ว")}">${watchChannelMark(d)}<span>${esc(d.name)}</span>${!d.verified ? (globalThis.SnaapI18n?.text("<span>· ตัดแล้ว</span>") ?? "<span>· ตัดแล้ว</span>") : ''}</span>`).join("");
  return `<article class="watch-row">
    <div class="watch-row-heading"><div class="watch-title-line"><h2>${esc(r.spec.name)}</h2><span class="status ${r.active && !r.quota_blocked ? "is-active" : "paused"}">${status}</span></div>
      <div class="watch-setup-meta"><span class="watch-pairs">${esc(pairPreview)}${remaining > 0 ? ` <span class="watch-pair-count">+${remaining}${(globalThis.SnaapI18n?.text(" คู่</span>") ?? " คู่</span>")}` : ""}</span><span class="watch-tags"><span class="watch-tag">${esc(r.spec.exchange.join(" · "))}</span><span class="watch-tag">${esc(r.spec.market)}</span><span class="watch-tag watch-direction">${esc(direction)}</span>${channelTags}</span></div>

    </div>
    <div class="watch-row-footer">
      ${watchChannelPicker(r)}
      <button class="secondary" data-activate-rule="${esc(r.id)}">${uiIcon(r.active ? "pause" : "play")}${r.active ? (globalThis.SnaapI18n?.text("หยุดชั่วคราว") ?? "หยุดชั่วคราว") : (globalThis.SnaapI18n?.text("เปิดใช้งาน") ?? "เปิดใช้งาน")}</button>
      <button class="secondary watch-edit" data-open-rule="${esc(r.id)}${(globalThis.SnaapI18n?.text("\" aria-label=\"แก้ไข ") ?? "\" aria-label=\"แก้ไข ")}${esc(r.spec.name)}${(globalThis.SnaapI18n?.text("\" title=\"แก้ไขเซ็ตอัพ\">") ?? "\" title=\"แก้ไขเซ็ตอัพ\">")}${uiIcon("sliders")}${(globalThis.SnaapI18n?.text("<span class=\"sr-only\">แก้ไข</span></button>\n    </div>\n    ") ?? "<span class=\"sr-only\">แก้ไข</span></button>\n    </div>\n    ")}${r.quota_blocked ? (globalThis.SnaapI18n?.text("<p role=\"alert\">เลือกหยุดเซ็ตอัพให้เหลือภายในสิทธิ์แพ็กเกจ แล้วระบบจะติดตามรายการที่เหลือต่อ</p>") ?? "<p role=\"alert\">เลือกหยุดเซ็ตอัพให้เหลือภายในสิทธิ์แพ็กเกจ แล้วระบบจะติดตามรายการที่เหลือต่อ</p>") : ""}${(globalThis.SnaapI18n?.text("\n    <details class=\"watch-details\"><summary>รายละเอียด</summary><div class=\"watch-details-content\">\n      <p class=\"watch-all-pairs\"><strong>คู่เทรด</strong> ") ?? "\n    <details class=\"watch-details\"><summary>รายละเอียด</summary><div class=\"watch-details-content\">\n      <p class=\"watch-all-pairs\"><strong>คู่เทรด</strong> ")}${esc(pairs.join(", "))}</p>
      <div class="watch-flexibility" data-flex-rule="${esc(r.id)}${(globalThis.SnaapI18n?.text("\"><div class=\"flex-summary\"><strong>ความยืดหยุ่น</strong><span>") ?? "\"><div class=\"flex-summary\"><strong>ความยืดหยุ่น</strong><span>")}${esc(entryFlexUI.flexibilitySummary(r.spec))}${(globalThis.SnaapI18n?.text("</span><button type=\"button\" data-flex-toggle aria-label=\"ปรับความยืดหยุ่น\" aria-expanded=\"false\" aria-controls=\"flex-") ?? "</span><button type=\"button\" data-flex-toggle aria-label=\"ปรับความยืดหยุ่น\" aria-expanded=\"false\" aria-controls=\"flex-")}${esc(r.id)}${(globalThis.SnaapI18n?.text("\">ปรับ</button></div><div class=\"flex-panel\" id=\"flex-") ?? "\">ปรับ</button></div><div class=\"flex-panel\" id=\"flex-")}${esc(r.id)}${(globalThis.SnaapI18n?.text("\" data-flex-panel hidden></div></div>\n      <p class=\"watch-rule-summary\"><strong>เงื่อนไขเข้า</strong> ") ?? "\" data-flex-panel hidden></div></div>\n      <p class=\"watch-rule-summary\"><strong>เงื่อนไขเข้า</strong> ")}${esc(setupEntrySummary(r.spec))}</p>
      <div class="watch-details-actions"><button class="secondary" data-export-setup-code="${esc(r.id)}">${uiIcon("file")}${(globalThis.SnaapI18n?.text("ส่งออกเซ็ตอัพ</button><button class=\"text-button watch-delete\" data-delete-rule=\"") ?? "ส่งออกเซ็ตอัพ</button><button class=\"text-button watch-delete\" data-delete-rule=\"")}${esc(r.id)}${(globalThis.SnaapI18n?.text("\" aria-label=\"ลบเซ็ตอัพ ") ?? "\" aria-label=\"ลบเซ็ตอัพ ")}${esc(r.spec.name)}">${uiIcon("trash")}${(globalThis.SnaapI18n?.text("ลบเซ็ตอัพ</button></div>\n    </div></details>\n  </article>") ?? "ลบเซ็ตอัพ</button></div>\n    </div></details>\n  </article>")}`;
}
function renderWatch() {
  const notice = $("#view-watch .demo-notice");
  if (notice)
    notice.textContent = state.me?.requiresRuleSelection
      ? (globalThis.SnaapI18n?.text("สิทธิ์ Pro หมดแล้ว กรุณาหยุดเซ็ตอัพให้เหลือ 3 รายการ ระบบพักการตรวจจนกว่าจะเลือกครบ") ?? "สิทธิ์ Pro หมดแล้ว กรุณาหยุดเซ็ตอัพให้เหลือ 3 รายการ ระบบพักการตรวจจนกว่าจะเลือกครบ")
      : (globalThis.SnaapI18n?.text("ประเมินแท่งปิดทุกนาที · ข้อมูลแต่ละกระดานตรวจแยกกัน") ?? "ประเมินแท่งปิดทุกนาที · ข้อมูลแต่ละกระดานตรวจแยกกัน");
  if (notice) notice.hidden = !state.me?.requiresRuleSelection;
  const list = state.rules.filter(
    (r) =>
      state.filter === "all" ||
      (state.filter === "active" ? r.active : !r.active),
  );
  window.SnaapSignalUnread?.paint();
  $$("[data-filter]").forEach((el) => {
    const active = el.dataset.filter === state.filter;
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });
  const openDetails = new Set([...$("#watch-list").querySelectorAll("[data-flex-rule]")]
    .filter(host => host.closest("details")?.open).map(host => host.dataset.flexRule));
  $("#watch-list").innerHTML = list.length
    ? list
        .map(watchSetupRow)
        .join("")
    : uiEmpty(
        "bell",
        state.filter === "all" ? (globalThis.SnaapI18n?.text("เริ่มจากเซ็ตอัพแรกของคุณ") ?? "เริ่มจากเซ็ตอัพแรกของคุณ") : (globalThis.SnaapI18n?.text("ไม่มีรายการในหมวดนี้") ?? "ไม่มีรายการในหมวดนี้"),
        state.filter === "all"
          ? (globalThis.SnaapI18n?.text("ตั้งเงื่อนไข ตรวจบนกราฟ แล้วค่อยเปิดแจ้งเตือน") ?? "ตั้งเงื่อนไข ตรวจบนกราฟ แล้วค่อยเปิดแจ้งเตือน")
          : (globalThis.SnaapI18n?.text("เลือกทั้งหมดเพื่อดูเซ็ตอัพที่บันทึกไว้") ?? "เลือกทั้งหมดเพื่อดูเซ็ตอัพที่บันทึกไว้"),
        '<button class="primary with-icon" data-action="new-rule">' +
          uiIcon("plus") +
          (globalThis.SnaapI18n?.text("ออกแบบเซ็ตอัพ</button>") ?? "ออกแบบเซ็ตอัพ</button>"),
      );
  $("#watch-list").querySelectorAll("[data-flex-rule]").forEach(host => {
    if (openDetails.has(host.dataset.flexRule)) host.closest("details").open = true;
  });
  const footnote = $("#view-watch .demo-footnote");
  entryFlexUI.mountFlexibility($('#watch-list'), {
    rules:state.rules, api,
    canEdit(rule){
      if(state.busy){toast((globalThis.SnaapI18n?.text("รอการวิเคราะห์เสร็จก่อนปรับความยืดหยุ่น") ?? "รอการวิเคราะห์เสร็จก่อนปรับความยืดหยุ่น"));return false;}
      if(state.saved?.id===rule.id && JSON.stringify(comparableSpec(state.draft))!==JSON.stringify(comparableSpec(rule.spec))){toast((globalThis.SnaapI18n?.text("มีร่างที่แก้ค้างอยู่ กรุณาบันทึกเซ็ตอัพจากหน้าออกแบบก่อน") ?? "มีร่างที่แก้ค้างอยู่ กรุณาบันทึกเซ็ตอัพจากหน้าออกแบบก่อน"));return false;}
      return true;
    },
    async onSaved(saved){
      if(state.saved?.id===saved.id){state.saved=saved;state.draft=structuredClone(saved.spec);state.replay=null;state.undo=[];renderDesigner();await saveDraft();}
      await refresh();toast((globalThis.SnaapI18n?.text("บันทึกความยืดหยุ่นแล้ว") ?? "บันทึกความยืดหยุ่นแล้ว")+(saved.active?(globalThis.SnaapI18n?.text(" · ยังเปิดใช้งานอยู่") ?? " · ยังเปิดใช้งานอยู่"):''));
    },
    onReload:()=>refresh(),
  });
  if (footnote)
    footnote.textContent =
      (globalThis.SnaapI18n?.text("ประเมินแท่งปิดทุกนาที · ดูสถานะข้อมูลและผลการส่งในหน้าการแจ้งเตือน") ?? "ประเมินแท่งปิดทุกนาที · ดูสถานะข้อมูลและผลการส่งในหน้าการแจ้งเตือน");
}
let refreshGeneration=0;
async function refresh({ reuseMe = false } = {}) {
  const generation=++refreshGeneration,workspace=state.workspaceId;
  const [rules, me, rows, destinations] = await Promise.all([
    api("/rules"),
    reuseMe && state.me ? Promise.resolve(state.me) : api("/me"),
    conversationCache.list({force: true}),
    api("/destinations"),
  ]);
  if (generation!==refreshGeneration || workspace !== state.workspaceId) return;
  state.rules = rules;
  state.destinationAvailability = destinations.available;
  if(state.saved)state.saved=rules.find(rule=>rule.id===state.saved.id)??null;
  state.me = me;
  window.dispatchEvent(new Event('snaap-account-ready'));
  paintWorkspacePicker();
  if (!state.me.local) {
    const name = state.me.email.split("@")[0];
    $(".profile .avatar").textContent = name.slice(0, 1).toUpperCase();
    $(".profile>span:not(.avatar)").innerHTML =
      esc(name) + "<small>" + (state.me.plan === "PRO" ? "Pro" : "Free") + "</small>";
  }
  if(!$('#auth-signout')){
    const signout=document.createElement('button');signout.id='auth-signout';signout.className='auth-signout';signout.innerHTML=uiIcon('exit', 'icon')+(globalThis.SnaapI18n?.text("<span>ออกจากระบบ</span>") ?? "<span>ออกจากระบบ</span>");
    signout.onclick=async()=>{
      if(state.busy||state.uploading){toast((globalThis.SnaapI18n?.text("รอให้ข้อความหรือภาพเสร็จก่อนออกจากระบบ") ?? "รอให้ข้อความหรือภาพเสร็จก่อนออกจากระบบ"));return;}
      signout.disabled=true;
      try{persistRecovery();if(state.draft&&draftDirty())await saveDraft();await api('/auth/logout','POST',{});sessionStorage.setItem('snaap-signed-out','true');location.replace('/login.html');}
      catch(error){toast(error.message);signout.disabled=false;}
    };
    accountMenu.append(signout);
  }
  if(state.me?.impersonating && !document.getElementById('admin-impersonation-banner')) {
    const banner=document.createElement('div');
    banner.id='admin-impersonation-banner';
    banner.setAttribute('role','status');
    banner.style.cssText='position:sticky;top:0;z-index:9999;padding:12px;background:#fef3d6;color:#543600;display:flex;gap:16px;justify-content:center;align-items:center;flex-wrap:wrap';
    const message=document.createElement('span');
    message.textContent=(globalThis.SnaapI18n?.text("โหมดช่วยตรวจสอบบัญชีผู้ใช้ · เซสชันนี้มีอายุ 15 นาที") ?? "โหมดช่วยตรวจสอบบัญชีผู้ใช้ · เซสชันนี้มีอายุ 15 นาที");
    const restore=document.createElement('button');
    restore.className='btn';
    restore.textContent=(globalThis.SnaapI18n?.text("กลับสู่ Admin Dashboard") ?? "กลับสู่ Admin Dashboard");
    restore.addEventListener('click',async()=>{
      restore.disabled=true;
      try {
        const response=await fetch('/api/v1/impersonation/restore',{method:'POST',headers:{'x-snaap-client':'web','content-type':'application/json'},body:'{}'});
        if(!response.ok) throw new Error((globalThis.SnaapI18n?.text("กลับบัญชีผู้ดูแลไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่") ?? "กลับบัญชีผู้ดูแลไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่"));
        location.href='/admin';
      } catch(error) {message.textContent=error.message;restore.disabled=false;}
    });
    banner.append(message,restore);
    document.body.prepend(banner);
    new ResizeObserver(() => {
      document.body.style.setProperty('--admin-banner-height', `${banner.getBoundingClientRect().height}px`);
    }).observe(banner);
  }
  $("#ai-mode option[value=deep]").disabled = true;
  $("#ai-mode option[value=deep]").textContent = (globalThis.SnaapI18n?.text("วิเคราะห์ละเอียด · Pro · เร็ว ๆ นี้") ?? "วิเคราะห์ละเอียด · Pro · เร็ว ๆ นี้");
  $("#ai-mode").value = 'standard';
  renderWatch();
  applyConversationRows(rows);
  state.destinations = destinations.items;
}
async function refreshContext() {
  const previous = new Map(
    [...sources.querySelectorAll("[data-source]")].map((x) => [
      x.dataset.source,
      x.checked,
    ]),
  );
  const data = await api("/context", "POST", {});
  state.sources = data.sources;
  sources.querySelector(".source-list").innerHTML = data.sources.length
    ? data.sources
        .map(
          (s) =>
            `<label><input type="checkbox" data-source="${s.id}" data-kind="${s.type}" ${previous.get(s.id) === false ? "" : "checked"}>${esc(s.type)} · ${esc(s.name ?? s.facts.name ?? s.id.slice(0, 8))} · ${esc(new Date(s.asOf).toLocaleDateString((globalThis.SnaapI18n?.locale ?? "th-TH")))}</label>`,
        )
        .join("")
    : (globalThis.SnaapI18n?.text("ยังไม่มีประวัติหรือเซ็ตอัพที่บันทึกไว้") ?? "ยังไม่มีประวัติหรือเซ็ตอัพที่บันทึกไว้");
}
async function chat(text) {
  if (state.saving) { toast((globalThis.SnaapI18n?.text("กำลังบันทึกเซ็ตอัพ รอสักครู่") ?? "กำลังบันทึกเซ็ตอัพ รอสักครู่")); return; }
  if (!text.trim() || state.busy) return;
  if(state.uploading){toast((globalThis.SnaapI18n?.text("กำลังแนบภาพ รอให้พรีวิวปรากฏก่อนส่ง") ?? "กำลังแนบภาพ รอให้พรีวิวปรากฏก่อนส่ง"));return;}
  if(new Set([...state.images,...(state.useMyData?state.libraryImages:[])].map(image=>image.id)).size>5){
    toast((globalThis.SnaapI18n?.text("ใช้ภาพรวมได้สูงสุด 5 ภาพต่อข้อความ รวมภาพจากข้อมูลของฉัน กรุณาลดภาพหรือปิดใช้ข้อมูลของฉัน") ?? "ใช้ภาพรวมได้สูงสุด 5 ภาพต่อข้อความ รวมภาพจากข้อมูลของฉัน กรุณาลดภาพหรือปิดใช้ข้อมูลของฉัน"));return;
  }
  if (!state.health) await healthReady;
  if (state.busy || state.uploading) return;
  if (!state.health?.ai) {
    toast((globalThis.SnaapI18n?.text("AI ยังไม่พร้อมใช้งาน คุณตั้งเงื่อนไขเองได้") ?? "AI ยังไม่พร้อมใช้งาน คุณตั้งเงื่อนไขเองได้"));
    return;
  }
  if(workbench.dataset.tab!=="split")setWorkbenchTab("chat");
  showDesigner();
  window.SnaapRouter.go("home");
  message(text, true);
  const pendingImages = state.images.filter(image => !image.sent);
  appendChatImages([...pendingImages, ...(state.useMyData ? state.libraryImages : [])]);
  pendingImages.forEach(image => { image.sent = true; });
  renderImages();
  let requestCompleted = false;
  followingChat=true;
  requestAnimationFrame(scrollChatToLatest);
  $("#chat-input").value = "";
  $("#followup-input").value = "";
  resizeChatInputs();
  state.busy = true;
  const thinking = document.createElement("div");
  thinking.className = "thinking-indicator";
  thinking.setAttribute("role", "status");
  thinking.setAttribute('aria-live','polite');
  thinking.setAttribute('aria-atomic','true');
  thinking.innerHTML =
    `<span class="thinking-mark" aria-hidden="true">${thinkingLogo()}${(globalThis.SnaapI18n?.text("</span><span class=\"sr-only\">Snaap: </span><span data-thinking-stage>กำลังเตรียมคำตอบ…</span><span class=\"thinking-dots\" aria-hidden=\"true\"><i></i><i></i><i></i></span>") ?? "</span><span class=\"sr-only\">Snaap: </span><span data-thinking-stage>กำลังเตรียมคำตอบ…</span><span class=\"thinking-dots\" aria-hidden=\"true\"><i></i><i></i><i></i></span>")}`;
  const thinkingStage=thinking.querySelector('[data-thinking-stage]');
  const setThinkingStage=text=>{thinkingStage.textContent=text;};
  let thinkingWaitTimer;
  let streamedMessage, streamedBody, streamedText='';
  const updateStream=event=>{
    if(event.type==='reset'){
      streamedText='';streamedMessage?.remove();streamedMessage=null;streamedBody=null;
      thinking.hidden=false;setThinkingStage((globalThis.SnaapI18n?.text("กำลังคิดคำตอบ…") ?? "กำลังคิดคำตอบ…"));
    }
    if(event.type!=='delta')return;
    clearTimeout(thinkingWaitTimer);thinking.hidden=true;
    if(!streamedMessage){
      streamedMessage=document.createElement('div');streamedMessage.className='message assistant';
      streamedBody=document.createElement('div');streamedBody.className='assistant-body';
      streamedMessage.append(streamedBody);$('#messages').append(streamedMessage);
    }
    streamedText+=event.delta;streamedBody.textContent=streamedText;
    if(followingChat)requestAnimationFrame(scrollChatToLatest);
  };
  $("#messages").append(thinking);
  $$("#chat-form button[type=submit],.chat-send-button").forEach(
    (b) => (b.disabled = true),
  );
  try {
    await ensureConversation(text);
    await saveDraft();
    if(state.useMyData){setThinkingStage((globalThis.SnaapI18n?.text("กำลังเตรียมภาพและประวัติเทรด…") ?? "กำลังเตรียมภาพและประวัติเทรด…"));await refreshContext();await renderLabImageChoices();}
    const checked = state.useMyData ? [...sources.querySelectorAll("input[data-source]:checked")] : [];
    const selection = {
      ruleIds: checked
        .filter((x) => x.dataset.kind === "rule")
        .map((x) => x.dataset.source),
      importIds: state.useMyData ? undefined : [],
    };
    const submittedDraft = JSON.stringify(state.draft);
    setThinkingStage(state.images.length || (state.useMyData && state.libraryImages.length)
      ? (globalThis.SnaapI18n?.text("กำลังวิเคราะห์ข้อความและภาพ…") ?? "กำลังวิเคราะห์ข้อความและภาพ…") : (globalThis.SnaapI18n?.text("กำลังคิดคำตอบ…") ?? "กำลังคิดคำตอบ…"));
    thinkingWaitTimer=setTimeout(()=>setThinkingStage((globalThis.SnaapI18n?.text("ยังประมวลผลอยู่ · กรุณารอสักครู่") ?? "ยังประมวลผลอยู่ · กรุณารอสักครู่")),15000);
    const result = await api(
      `/conversations/${state.conversation}/turns`,
      "POST",
      {
        text,
        mode: $("#ai-mode").value,
        selection,
        draft: hasEntryCondition() ? state.draft : undefined,
        editorContext: hasEntryCondition() ? window.SnaapStudio?.context() : undefined,
        useMyData:state.useMyData,
        imageIds: [...new Set([...state.images, ...(state.useMyData ? state.libraryImages : [])].map(x=>x.id))],

      },
      {onEvent:updateStream},
    );
    requestCompleted = true;
    clearTimeout(thinkingWaitTimer);
    thinking.remove();
    if(streamedBody){
      const {renderAssistantText}=await assistantTextReady;
      renderAssistantText(streamedBody,result.text);
    }else streamedMessage=message(result.text);
    if(result.artifacts?.length){
      const conversation=state.conversation;
      (await chatArtifactsReady).renderArtifacts(streamedMessage,result.artifacts,{refresh:artifactId=>api(`/conversations/${conversation}/messages/${result.messageId}/artifacts/${artifactId}/refresh`,'POST',{})});
      if(followingChat&&!result.draft)requestAnimationFrame(()=>focusChatArtifact(streamedMessage.querySelector('.chat-artifact')));
    }
    if (result.draft) {
      if (JSON.stringify(state.draft) !== submittedDraft) {
        message((globalThis.SnaapI18n?.text("คุณแก้เซ็ตอัพระหว่างรอคำตอบ ลองเทียบข้อเสนอก่อนใช้") ?? "คุณแก้เซ็ตอัพระหว่างรอคำตอบ ลองเทียบข้อเสนอก่อนใช้"));
        reviewProposal(result.draft);
      } else {
        const previousDraft = structuredClone(state.draft);
        snapshot();
        state.draft = result.draft;
        state.replay = null;
        renderDesigner();
        await showSetupChanges(previousDraft,state.draft);
        await showChatSetupCard();
      }
    }
    state.crop = null;
    renderImages();
    persistRecovery();
    await refresh();
  } catch (error) {
    if (!requestCompleted) {
      streamedMessage?.remove();
      pendingImages.forEach(image => { image.sent = false; });
      renderImages();
    }
    message(error.message);
    $("#followup-input").value = text;
    resizeChatInputs();
    toast(error.message);
  } finally {
    clearTimeout(thinkingWaitTimer);
    state.busy = false;
    thinking.remove();
    $$("#chat-form button[type=submit],.chat-send-button").forEach(
      (b) => (b.disabled = false),
    );
    await refresh().catch(() => {});
  }
}
function appendChatImages(images) {
  const unique = [...new Map(images.map(image => [image.id, image])).values()];
  if (!unique.length) return;
  const gallery = document.createElement('div');
  gallery.className = 'chat-image-gallery user';
  gallery.setAttribute('role', 'group');
  gallery.setAttribute('aria-label', (globalThis.SnaapI18n?.text("ภาพที่ผู้ใช้ส่ง") ?? "ภาพที่ผู้ใช้ส่ง"));
  for (const image of unique) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-image-thumbnail';
    button.setAttribute('aria-haspopup', 'dialog');
    const name = image.name ?? (globalThis.SnaapI18n?.text("ภาพในบทสนทนา") ?? "ภาพในบทสนทนา");
    button.setAttribute('aria-label', (globalThis.SnaapI18n?.text("ดูภาพเต็ม: ") ?? "ดูภาพเต็ม: ") + name);
    const img = document.createElement('img');
    img.src = '/api/v1/images/' + image.id;
    img.alt = name;
    img.className = 'chat-saved-image';
    img.loading = 'lazy';
    img.decoding = 'async';
    button.onclick = () => import('./chat-images.js').then(({openChatImage}) => openChatImage(img.src, name, button));
    button.append(img);
    gallery.append(button);
  }
  $('#messages').append(gallery);
}
async function restoreChatImages(selectedIds, sentIds = []) {
  if (!state.conversation) return;
  const conversationId = state.conversation, workspace = state.workspaceId;
  const images = await api(`/conversations/${conversationId}/images`);
  if (state.conversation !== conversationId || state.workspaceId !== workspace) return;
  state.images = selectedIds ? images.filter(image => selectedIds.includes(image.id)).slice(-5) : images.slice(-5);
  state.images.forEach(image => { image.sent = !selectedIds || sentIds.includes(image.id); });
  renderImages();
}
function renderImages() {
  previews.innerHTML = state.images
    .filter(image => !image.sent)
    .map(
      (i) =>
        `<span><img src="/api/v1/images/${i.id}" alt="${esc(i.name)}"><button class="text-button" data-remove-image="${i.id}${(globalThis.SnaapI18n?.text("\">นำออก</button></span>") ?? "\">นำออก</button></span>")}`,
    )
    .join("");
}
async function attachChatImages(files) {
  if(state.busy||state.uploading)return toast((globalThis.SnaapI18n?.text("รอให้ข้อความหรือภาพก่อนหน้าเสร็จก่อน") ?? "รอให้ข้อความหรือภาพก่อนหน้าเสร็จก่อน"));
  const valid=[];
  for(const file of files){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){
      toast(`${file.name || (globalThis.SnaapI18n?.text("ไฟล์นี้") ?? "ไฟล์นี้")}${(globalThis.SnaapI18n?.text(": รองรับ PNG, JPEG และ WebP") ?? ": รองรับ PNG, JPEG และ WebP")}`);continue;
    }
    if(file.size>5*1024*1024){toast(`${file.name}${(globalThis.SnaapI18n?.text(": ภาพต้องไม่เกิน 5 MB") ?? ": ภาพต้องไม่เกิน 5 MB")}`);continue;}
    valid.push(file);
  }
  if(!valid.length)return;
  const remaining=5-state.images.length;
  if(valid.length>remaining)return toast((globalThis.SnaapI18n?.text("แนบได้สูงสุด 5 ภาพต่อข้อความ กรุณาเลือกภาพให้น้อยลงหรือนำภาพเดิมออก") ?? "แนบได้สูงสุด 5 ภาพต่อข้อความ กรุณาเลือกภาพให้น้อยลงหรือนำภาพเดิมออก"));
  state.uploading=true;
  const workspaceAtUpload=state.workspaceId;
  previews.setAttribute('aria-busy','true');
  const progress=document.createElement('p');progress.setAttribute('role','status');
  const updateProgress=index=>{progress.textContent=`${(globalThis.SnaapI18n?.text("กำลังแนบภาพ ") ?? "กำลังแนบภาพ ")}${index}/${valid.length}…`;previews.append(progress);};
  updateProgress(1);
  try{
    showDesigner();
    await ensureConversation((globalThis.SnaapI18n?.text("บทสนทนาภาพ") ?? "บทสนทนาภาพ"));
    const uploadConversation=state.conversation;
    for(const [index,file] of valid.entries()){
      if(state.workspaceId!==workspaceAtUpload||state.conversation!==uploadConversation)break;
      updateProgress(index+1);
      const form=new FormData();form.append('file',file);
      try{
        const image=await api(`/images?purpose=chat&conversationId=${uploadConversation}`,'POST',form);
        if(state.workspaceId!==workspaceAtUpload||state.conversation!==uploadConversation){toast((globalThis.SnaapI18n?.text("ภาพไม่ได้แนบเข้าบทสนทนาที่เพิ่งเปลี่ยน") ?? "ภาพไม่ได้แนบเข้าบทสนทนาที่เพิ่งเปลี่ยน"));break;}
        state.crop=null;state.images.push(image);renderImages();
      }catch(error){toast(`${file.name}: ${error.message}`);}
    }
  }catch(error){toast(error.message);}
  finally{state.uploading=false;previews.removeAttribute('aria-busy');progress.remove();}
}
for(const target of [chatComposer,$('#chat-form')]){
  target.addEventListener('paste',event=>{
    const files=[...(event.clipboardData?.files ?? [])];
    if(!files.length)return;
    event.preventDefault();
    void attachChatImages(files);
  });
  target.addEventListener('dragover',event=>{
    if(!event.dataTransfer?.types.includes('Files'))return;
    event.preventDefault();event.dataTransfer.dropEffect='copy';target.classList.add('is-image-dragover');
  });
  target.addEventListener('dragleave',event=>{
    if(!target.contains(event.relatedTarget))target.classList.remove('is-image-dragover');
  });
  target.addEventListener('drop',event=>{
    target.classList.remove('is-image-dragover');
    if(!event.dataTransfer?.files.length)return;
    event.preventDefault();void attachChatImages([...event.dataTransfer.files]);
  });
}
function renderReplay() {
  const target = $("#replay-result");
  if (!target) return;
  const r = state.replay,
    cs = r.candles.slice(-100);
  if (!cs.length) {
    target.textContent = (globalThis.SnaapI18n?.text("ไม่มีแท่งเทียน") ?? "ไม่มีแท่งเทียน");
    return;
  }
  const min = Math.min(...cs.map((c) => c.low)),
    max = Math.max(...cs.map((c) => c.high)),
    scale = (v) => 180 - ((v - min) / (max - min || 1)) * 150;
  const svg = cs
    .map((c, i) => {
      const x = 60 + i * 5,
        color = c.close >= c.open ? "#86b830" : "#cf625a";
      return `<line x1="${x}" x2="${x}" y1="${scale(c.high)}" y2="${scale(c.low)}" stroke="${color}"/><rect x="${x - 1.7}" y="${Math.min(scale(c.open), scale(c.close))}" width="3.4" height="${Math.max(1, Math.abs(scale(c.open) - scale(c.close)))}" fill="${color}"/>`;
    })
    .join("");
  target.innerHTML = `${(globalThis.SnaapI18n?.text("<h2>ผลทดสอบย้อนหลัง</h2><div class=\"chart-frame\"><svg viewBox=\"0 0 600 220\" role=\"img\" aria-label=\"กราฟแท่งปิด ") ?? "<h2>ผลทดสอบย้อนหลัง</h2><div class=\"chart-frame\"><svg viewBox=\"0 0 600 220\" role=\"img\" aria-label=\"กราฟแท่งปิด ")}${esc(r.source.pair)}">${[min, (min + max) / 2, max].map((v) => `<line x1="55" x2="580" y1="${scale(v)}" y2="${scale(v)}" stroke="currentColor" opacity=".1"/><text x="5" y="${scale(v) + 4}" fill="currentColor" font-size="10">${Math.round(v)}</text>`).join("")}${svg}${r.events
    .filter((e) => cs.some((c) => c.time === e.time))
    .map(
      (e) =>
        `<circle cx="${60 + cs.findIndex((c) => c.time === e.time) * 5}" cy="${scale(e.referencePrice)}" r="4" fill="var(--lime)" stroke="var(--ink)"><title>${esc(e.kind)} · ${esc(signalDirection(e))} ${e.referencePrice}</title></circle>`,
    )
    .join(
      "",
    )}<text x="60" y="204" fill="currentColor" font-size="10">${new Date(cs[0].time).toLocaleDateString((globalThis.SnaapI18n?.locale ?? "th-TH"))}</text><text x="580" y="204" text-anchor="end" fill="currentColor" font-size="10">${new Date(cs.at(-1).time).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"))}</text></svg></div><p class="field-note">${esc(r.source.exchange)} · ${esc(r.source.pair)} · ${r.source.frame}${(globalThis.SnaapI18n?.text(" · จุดสีเขียว = สัญญาณ</p><details class=\"replay-details\"><summary>ตรวจเงื่อนไขและเหตุการณ์ (") ?? " · จุดสีเขียว = สัญญาณ</p><details class=\"replay-details\"><summary>ตรวจเงื่อนไขและเหตุการณ์ (")}${r.events.length})</summary>${r.timeline ? `${(globalThis.SnaapI18n?.text("<label>ตรวจทีละแท่ง<input aria-label=\"แท่งที่ตรวจ\" type=\"range\" min=\"0\" max=\"") ?? "<label>ตรวจทีละแท่ง<input aria-label=\"แท่งที่ตรวจ\" type=\"range\" min=\"0\" max=\"")}${r.timeline.length - 1}" value="${r.timeline.length - 1}" data-timeline></label><div id="bar-evidence">${barEvidence(r.timeline.at(-1))}</div>` : ""}<p class="field-note">${r.events.length}${(globalThis.SnaapI18n?.text(" สัญญาณในช่วงข้อมูล · ไม่ใช่ผลตอบแทน</p>") ?? " สัญญาณในช่วงข้อมูล · ไม่ใช่ผลตอบแทน</p>")}${r.events
    .slice(-15)
    .reverse()
    .map(
      (e) =>
        `<div class="replay-event"><strong>${{ ENTRY: (globalThis.SnaapI18n?.text("สัญญาณเข้า") ?? "สัญญาณเข้า"), EXIT: (globalThis.SnaapI18n?.text("สัญญาณออก") ?? "สัญญาณออก"), CANCEL: (globalThis.SnaapI18n?.text("ยกเลิก") ?? "ยกเลิก"), EXPIRED: (globalThis.SnaapI18n?.text("หมดเวลารอ") ?? "หมดเวลารอ") }[e.kind] ?? esc(e.kind)}</strong> · ${esc(signalDirection(e))} · ${new Date(e.time).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"))}${(globalThis.SnaapI18n?.text("<br>ราคาอ้างอิง ") ?? "<br>ราคาอ้างอิง ")}${e.referencePrice}${(globalThis.SnaapI18n?.text("<details><summary>ค่าที่ตรวจ</summary>") ?? "<details><summary>ค่าที่ตรวจ</summary>")}${evidenceUI(e.evidence)}</details></div>`,
    )
    .join(
      "",
    )}<p class="field-note">${r.limitations.map(value => esc(globalThis.SnaapI18n?.text(value) ?? value)).join("<br>")}</p></details>`;
}
const billing = document.createElement("section");
billing.id = "view-billing";
billing.className = "view secondary-view";
billing.hidden = true;
$("#main").append(billing);
function renderBilling() {
  billing.innerHTML = `${(globalThis.SnaapI18n?.text("<div class=\"page-heading\"><h1>บัญชีและการใช้งาน</h1></div><div class=\"runtime-card\"><h2>") ?? "<div class=\"page-heading\"><h1>บัญชีและการใช้งาน</h1></div><div class=\"runtime-card\"><h2>")}${state.me ? (state.me.plan === "PRO" ? "Pro" : "Free") : (globalThis.SnaapI18n?.text("ยังไม่ได้เข้าสู่ระบบ") ?? "ยังไม่ได้เข้าสู่ระบบ")}</h2><p>${esc(state.me?.email ?? "")} ${state.me?.local ? (globalThis.SnaapI18n?.text("· บัญชีพัฒนาบนเครื่อง") ?? "· บัญชีพัฒนาบนเครื่อง") : ""}${(globalThis.SnaapI18n?.text("</p><p>เซ็ตอัพที่เปิดพร้อมกัน ") ?? "</p><p>เซ็ตอัพที่เปิดพร้อมกัน ")}${state.me?.limits.activeRules ?? (globalThis.SnaapI18n?.text("ไม่จำกัด") ?? "ไม่จำกัด")}${(globalThis.SnaapI18n?.text(" · AI ปกติ ") ?? " · AI ปกติ ")}${state.me?.limits.standard ?? (globalThis.SnaapI18n?.text("ไม่จำกัด") ?? "ไม่จำกัด")}${(globalThis.SnaapI18n?.text(" ครั้ง/เดือน · เวิร์กสเปซ ") ?? " ครั้ง/เดือน · เวิร์กสเปซ ")}${state.me?.limits.workspaces ?? (globalThis.SnaapI18n?.text("ไม่จำกัด") ?? "ไม่จำกัด")}${(globalThis.SnaapI18n?.text(" พื้นที่</p><p>โหมดละเอียดอยู่ระหว่างพัฒนา</p><button class=\"secondary\" data-export>ส่งออกข้อมูล</button></div>") ?? " พื้นที่</p><p>โหมดละเอียดอยู่ระหว่างพัฒนา</p><button class=\"secondary\" data-export>ส่งออกข้อมูล</button></div>")}`;
  const first = billing.querySelector(".runtime-card");
  const limitText = first?.querySelectorAll("p")[1];
  if (limitText) {
    const metrics = document.createElement("div");
    metrics.className = "plan-capabilities";
    metrics.innerHTML = [
      ["bell", state.me?.limits.activeRules ?? (globalThis.SnaapI18n?.text("ไม่จำกัด") ?? "ไม่จำกัด"), (globalThis.SnaapI18n?.text("เซ็ตอัพที่เปิดได้") ?? "เซ็ตอัพที่เปิดได้")],
      ["spark", state.me?.limits.standard ?? (globalThis.SnaapI18n?.text("ไม่จำกัด") ?? "ไม่จำกัด"), (globalThis.SnaapI18n?.text("AI ต่อเดือน") ?? "AI ต่อเดือน")],
      ["layers", state.me?.limits.workspaces ?? (globalThis.SnaapI18n?.text("ไม่จำกัด") ?? "ไม่จำกัด"), (globalThis.SnaapI18n?.text("เวิร์กสเปซ") ?? "เวิร์กสเปซ")],
    ]
      .map(
        ([icon, value, label]) =>
          `<div>${uiIcon(icon)}<strong>${value}</strong><span>${label}</span></div>`,
      )
      .join("");
    limitText.replaceWith(metrics);
  }
}
let historyRenderVersion=0;
let historyWorkspace;
let historyLoadingWorkspace;
let historyLoadController;
async function renderHistory() {
  const version=++historyRenderVersion;
  historyLoadController?.abort();
  historyLoadController = new AbortController();
  const signal = AbortSignal.any([historyLoadController.signal, AbortSignal.timeout(12000)]);
  const workspace = state.workspaceId;
  historyLoadingWorkspace = workspace;
  const visibleView = $("#view-history");
  const view = document.createElement('section');
  if (historyWorkspace !== workspace) visibleView.innerHTML=(globalThis.SnaapI18n?.text("<div class=\"page-heading\"><div><h1>ข้อมูลของฉัน</h1><p>ภาพอ้างอิงและประวัติเทรดที่คุณเลือกให้ Snaap ใช้</p></div></div>") ?? "<div class=\"page-heading\"><div><h1>ข้อมูลของฉัน</h1><p>ภาพอ้างอิงและประวัติเทรดที่คุณเลือกให้ Snaap ใช้</p></div></div>")+skeletonUI('history', (globalThis.SnaapI18n?.text("กำลังโหลดข้อมูลของฉัน…") ?? "กำลังโหลดข้อมูลของฉัน…"));
  visibleView.setAttribute('aria-busy', 'true');
  try {
    const loaded = await Promise.allSettled([
      api('/imports', 'GET', undefined, {signal}),
      api('/connections', 'GET', undefined, {signal}),
      api('/images', 'GET', undefined, {signal}),
    ]);
    if(version!==historyRenderVersion || workspace !== state.workspaceId)return;
    const [imports, connections, images] = loaded.map(item => item.status === 'fulfilled' ? item.value : null);
    view.innerHTML =
      (globalThis.SnaapI18n?.text("<div class=\"page-heading\"><div><h1>ข้อมูลของฉัน</h1><p>ภาพอ้างอิงและประวัติเทรดที่คุณเลือกให้ Snaap ใช้</p></div></div><div class=\"runtime-card history-file-card\"><h2>นำเข้าจากไฟล์</h2><p>CSV / XLSX รูปแบบกลาง · ตรวจข้อมูลก่อนบันทึก</p><a class=\"secondary template-download\" href=\"/assets/trade-import-template.csv\" download>ดาวน์โหลดไฟล์ต้นแบบ CSV</a><details class=\"import-format\"><summary>รูปแบบข้อมูลที่รองรับ</summary><p class=\"field-note\">คอลัมน์: time, exchange, market, pair, side, price, quantity, fee, id<br>market: Spot / Futures · ไม่ระบุจะเป็น Spot · quantity: จำนวนเหรียญ · เวลาแบบ ISO · side: buy / sell</p></details><label>ชื่อเรียกชุดประวัติ <input id=\"account-scope\" placeholder=\"เช่น ประวัติเทรดเดือนตุลาคม\"><small class=\"field-note\">ชื่อที่คุณตั้งไว้แยกชุดข้อมูล ไม่ใช่ชื่อบัญชีบนกระดาน</small></label><p class=\"field-note\">รายการไม่มี trade ID จะเก็บทั้งหมด กรุณาตรวจไฟล์ซ้ำก่อนนำเข้า</p><input id=\"history-upload\" type=\"file\" accept=\".csv,.xlsx\"><div id=\"import-preview\"></div></div>") ?? "<div class=\"page-heading\"><div><h1>ข้อมูลของฉัน</h1><p>ภาพอ้างอิงและประวัติเทรดที่คุณเลือกให้ Snaap ใช้</p></div></div><div class=\"runtime-card history-file-card\"><h2>นำเข้าจากไฟล์</h2><p>CSV / XLSX รูปแบบกลาง · ตรวจข้อมูลก่อนบันทึก</p><a class=\"secondary template-download\" href=\"/assets/trade-import-template.csv\" download>ดาวน์โหลดไฟล์ต้นแบบ CSV</a><details class=\"import-format\"><summary>รูปแบบข้อมูลที่รองรับ</summary><p class=\"field-note\">คอลัมน์: time, exchange, market, pair, side, price, quantity, fee, id<br>market: Spot / Futures · ไม่ระบุจะเป็น Spot · quantity: จำนวนเหรียญ · เวลาแบบ ISO · side: buy / sell</p></details><label>ชื่อเรียกชุดประวัติ <input id=\"account-scope\" placeholder=\"เช่น ประวัติเทรดเดือนตุลาคม\"><small class=\"field-note\">ชื่อที่คุณตั้งไว้แยกชุดข้อมูล ไม่ใช่ชื่อบัญชีบนกระดาน</small></label><p class=\"field-note\">รายการไม่มี trade ID จะเก็บทั้งหมด กรุณาตรวจไฟล์ซ้ำก่อนนำเข้า</p><input id=\"history-upload\" type=\"file\" accept=\".csv,.xlsx\"><div id=\"import-preview\"></div></div>") +
      (imports ?? [])
        .map(
          (i) =>
            `<div class="runtime-card history-import-entry" data-import-connection="${esc(i.account_scope??'')}"><div class="history-api-header"><h2>${esc(i.name)}</h2><span data-history-api-actions></span></div><p>${i.count}${(globalThis.SnaapI18n?.text(" รายการ · ") ?? " รายการ · ")}${new Date(i.created_at).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"))}</p></div>`,
        )
        .join("");
    const refreshButton = document.createElement('button');
    refreshButton.className = 'secondary';
    refreshButton.dataset.historyRefresh = '';
    refreshButton.textContent = (globalThis.SnaapI18n?.text("รีเฟรชข้อมูล") ?? "รีเฟรชข้อมูล");
    view.querySelector('.page-heading').append(refreshButton);
    const failedSection = (title) => {
      const section = document.createElement('div'); section.className = 'runtime-card';
      section.innerHTML = '<h2>'+title+(globalThis.SnaapI18n?.text("</h2><p role=\"status\">ยังโหลดข้อมูลส่วนนี้ไม่ได้ · กดรีเฟรชข้อมูลเพื่อลองอีกครั้ง</p>") ?? "</h2><p role=\"status\">ยังโหลดข้อมูลส่วนนี้ไม่ได้ · กดรีเฟรชข้อมูลเพื่อลองอีกครั้ง</p>");
      view.append(section);
    };
    if (imports === null) failedSection((globalThis.SnaapI18n?.text("ประวัติที่นำเข้า") ?? "ประวัติที่นำเข้า"));
    if (connections === null) failedSection((globalThis.SnaapI18n?.text("การเชื่อมต่อกระดาน") ?? "การเชื่อมต่อกระดาน"));
    else await renderConnections(view, connections);
    if(version!==historyRenderVersion)return;
    if (images === null) failedSection((globalThis.SnaapI18n?.text("ภาพอ้างอิง") ?? "ภาพอ้างอิง"));
    else await renderTradingLab(view, images);
    if(version!==historyRenderVersion)return;
    const imageLibrary=view.querySelector('.trading-lab-images');
    const connectionSection = view.querySelector('#history-connections');
    if (imageLibrary && connectionSection) imageLibrary.after(connectionSection);
    const fileImport=view.querySelector('#account-scope')?.closest('.runtime-card');
    if(fileImport){
      const disclosure=document.createElement('details');disclosure.className='history-file-details';
      const summary=document.createElement('summary');summary.textContent=(globalThis.SnaapI18n?.text("เลือกไฟล์ CSV / XLSX หรือดูรูปแบบที่รองรับ") ?? "เลือกไฟล์ CSV / XLSX หรือดูรูปแบบที่รองรับ");disclosure.append(summary);
      [...fileImport.children].filter(child=>child.tagName!=='H2').forEach(child=>disclosure.append(child));
      fileImport.append(disclosure);
    }
    const upload = view.querySelector("#history-upload");
    const fileLabel = document.createElement("label");
    fileLabel.className = "file-drop";
    fileLabel.innerHTML =
      uiIcon("upload") +
      (globalThis.SnaapI18n?.text("<span><strong>เลือกไฟล์ประวัติ</strong><small>CSV หรือ XLSX · ตรวจข้อมูลก่อนนำเข้า</small></span>") ?? "<span><strong>เลือกไฟล์ประวัติ</strong><small>CSV หรือ XLSX · ตรวจข้อมูลก่อนนำเข้า</small></span>");
    upload.before(fileLabel);
    fileLabel.append(upload);
    upload.setAttribute("aria-label", (globalThis.SnaapI18n?.text("เลือกไฟล์ประวัติ CSV หรือ XLSX") ?? "เลือกไฟล์ประวัติ CSV หรือ XLSX"));
    if (version !== historyRenderVersion || workspace !== state.workspaceId) return;
    visibleView.replaceChildren(...view.childNodes);
    if (images !== null) state.allLibraryImages = images;
    historyWorkspace = workspace;
    scheduleHistorySyncRefresh();
  } catch (e) {
    if (version !== historyRenderVersion || workspace !== state.workspaceId) return;
    if (historyWorkspace !== workspace) visibleView.innerHTML=(globalThis.SnaapI18n?.text("<div class=\"page-heading\"><h1>ข้อมูลของฉัน</h1></div><p role=\"alert\">") ?? "<div class=\"page-heading\"><h1>ข้อมูลของฉัน</h1></div><p role=\"alert\">")+esc(e.message)+(globalThis.SnaapI18n?.text("</p><button class=\"secondary\" data-history-refresh>ลองอีกครั้ง</button>") ?? "</p><button class=\"secondary\" data-history-refresh>ลองอีกครั้ง</button>");
    toast(e.message);
  } finally {
    if (version === historyRenderVersion) { visibleView.removeAttribute('aria-busy'); historyLoadingWorkspace = undefined; }
  }
}
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "channel-form") return;
  e.preventDefault();
  const channelSubmit=e.target.querySelector('button[type="submit"],button.primary');
  if(channelSubmit?.disabled)return;
  const channelLabel=channelSubmit?.textContent;
  if(channelSubmit){channelSubmit.disabled=true;channelSubmit.textContent=(globalThis.SnaapI18n?.text("กำลังเชื่อมช่องทาง…") ?? "กำลังเชื่อมช่องทาง…");}
  try {
    const data = Object.fromEntries(new FormData(e.target));
    if (!data.url) delete data.url;
    const result = await api("/destinations", "POST", data);
    $("#channel-instruction").textContent = result.instruction;
    if(result.verified){e.target.reset();toast((globalThis.SnaapI18n?.text("เชื่อมช่องทางแล้ว · เลือกใช้ในเซ็ตอัพได้เลย") ?? "เชื่อมช่องทางแล้ว · เลือกใช้ในเซ็ตอัพได้เลย"));await refresh();await renderNotifications();}
    else toast((globalThis.SnaapI18n?.text("บันทึกช่องทางแล้ว · ทำตามคำแนะนำเพื่อยืนยันการเชื่อมต่อ") ?? "บันทึกช่องทางแล้ว · ทำตามคำแนะนำเพื่อยืนยันการเชื่อมต่อ"));
  } catch (error) {
    toast(error.message);
  } finally {if(channelSubmit?.isConnected){channelSubmit.disabled=false;channelSubmit.textContent=channelLabel;}}
});
document.addEventListener("click", async (e) => {
  const button = e.target.closest("[data-disconnect]");
  if (!button || button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = (globalThis.SnaapI18n?.text("กำลังยกเลิก…") ?? "กำลังยกเลิก…");
  try {
    await api("/destinations/" + button.dataset.disconnect, "DELETE");
    state.destinations = state.destinations.filter(item => item.id !== button.dataset.disconnect);
    toast((globalThis.SnaapI18n?.text("ยกเลิกช่องทางแล้ว") ?? "ยกเลิกช่องทางแล้ว"));
    await renderNotifications();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});
panel.addEventListener("input", (e) => {
  const t = e.target;
  if (
    t.tagName !== "INPUT" ||
    (!t.dataset.path && !t.hasAttribute("data-pairs"))
  )
    return;
  if (!t.dataset.editing) {
    snapshot();
    t.dataset.editing = "true";
  }
  if (t.type === "number" && (!t.value || !t.validity.valid)) return;
  if (t.dataset.path)
    set(t.dataset.path, t.type === "number" ? Number(t.value) : t.value);
  else
    state.draft.pairs = t.value
      .toUpperCase()
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  queueDraftSave();
});
panel.addEventListener("change", (e) => {
  const t = e.target;
  if (
    !t.dataset.path &&
    !t.dataset.opkind &&
    !t.dataset.exchange &&
    !t.dataset.destination &&
    !t.dataset.direction &&
    !t.hasAttribute("data-mirror-short") &&
    !t.hasAttribute("data-pairs")
  )
    return;
  if (t.type === "number" && (!t.value || !t.validity.valid)) return;
  if (!t.dataset.editing) snapshot();
  if(t.dataset.direction){
    const selected=[...panel.querySelectorAll('[data-direction]:checked')].map(x=>x.dataset.direction);
    state.draft=directionTools.selectDirections(state.draft,selected);
    state.replay=null;
  } else if(t.hasAttribute('data-mirror-short')){
    const nextDraft=directionTools.setShortMirroring(state.draft,t.checked);
    if (setupConditionCount(nextDraft) > MAX_SETUP_CONDITIONS) {
      toast((globalThis.SnaapI18n?.text("ตั้ง Long และ Short แยกกันได้รวมสูงสุด 24 เงื่อนไข ลดเงื่อนไขก่อนแยกฝั่ง") ?? "ตั้ง Long และ Short แยกกันได้รวมสูงสุด 24 เงื่อนไข ลดเงื่อนไขก่อนแยกฝั่ง"));
      renderDesigner();
      return;
    }
    state.draft=nextDraft;
    state.replay=null;
  } else if (t.dataset.opkind) {
    const kind = t.value;
    set(
      t.dataset.opkind,
      kind === "CONSTANT"
        ? constant(30)
        : kind === "ENTRY_RETURN"
          ? { kind }
          : kind === "PRICE"
            ? price()
            : {
                kind,
                name: "RSI",
                period: 14,
                timeframe: state.draft.timeframe,
              },
    );
  } else if (t.dataset.path) {
    set(t.dataset.path, t.type === "number" ? Number(t.value) : t.value);
    if(t.dataset.path==='market'){
      delete state.draft.targets;
      state.draft.side=t.value==='Spot'?'SPOT':undefined;
      delete state.draft.short;delete state.draft.mirrorShort;state.replay=null;
    }
    if(t.dataset.path.endsWith(".name") && t.value!=="CUSTOM"){
      const parent=t.dataset.path.slice(0,-5);set(parent+".formula",undefined);set(parent+".params",undefined);
      const definition=indicatorCatalog?.indicatorByName[t.value];
      if(definition)set(parent+'.period',definition.params.find(p=>p.key==='period')?.value??14);
    }
  }
  else if (t.dataset.destination)
    state.draft.destinations = [
      ...panel.querySelectorAll("[data-destination]:checked"),
    ].map((x) => x.dataset.destination);
  else if (t.dataset.exchange)
    { state.draft.exchange = [t.dataset.exchange]; delete state.draft.targets; }
  else
    state.draft.pairs = t.value
      .toUpperCase()
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  queueDraftSave();
  if (t.tagName === "SELECT" || t.type === "checkbox" || t.type === "radio") renderDesigner();
});
document.addEventListener("submit", (e) => {
  if (["chat-form", "followup-form"].includes(e.target.id)) {
    e.preventDefault();
    chat(
      e.target.id === "chat-form"
        ? $("#chat-input").value
        : $("#followup-input").value,
    );
  }
});
$("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("#chat-form").requestSubmit();
  }
});
document.addEventListener("change", async (e) => {
  try {
    if (e.target.id === "image-upload") {
      const files = [...e.target.files];
      e.target.value = "";
      await attachChatImages(files);
    }
    if (e.target.id === "history-upload") {
      const file = e.target.files[0];
      if (!file) return;
      const form = new FormData();
      form.append("file", file);
      const previewHost = $('#import-preview');
      previewHost.innerHTML = skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังตรวจไฟล์ประวัติ…") ?? "กำลังตรวจไฟล์ประวัติ…"));
      let p;
      try { p = await api("/imports/preview", "POST", form); }
      catch (error) { previewHost.innerHTML = '<p role="alert">'+esc(error.message)+'</p>';throw error; }
      state.importPreview = p;
      $("#import-preview").innerHTML =
        `<p>${p.rows.length}${(globalThis.SnaapI18n?.text(" แถวพร้อมนำเข้า / ") ?? " แถวพร้อมนำเข้า / ")}${p.total}${(globalThis.SnaapI18n?.text(" แถว · ขาดค่าธรรมเนียม ") ?? " แถว · ขาดค่าธรรมเนียม ")}${p.feeMissing}${(globalThis.SnaapI18n?.text(" แถว</p>") ?? " แถว</p>")}${p.errors.map((x) => `${(globalThis.SnaapI18n?.text("<p>แถว ") ?? "<p>แถว ")}${x.row}${(globalThis.SnaapI18n?.text(": ตรวจ ") ?? ": ตรวจ ")}${esc(x.fields.join(", "))}</p>`).join("")}${(globalThis.SnaapI18n?.text("<div class=\"data-table\"><table><thead><tr><th>เวลา</th><th>ตลาด</th><th>คู่</th><th>ซื้อ/ขาย</th><th>ราคา</th><th>จำนวน</th><th>ค่าธรรมเนียม</th></tr></thead><tbody>") ?? "<div class=\"data-table\"><table><thead><tr><th>เวลา</th><th>ตลาด</th><th>คู่</th><th>ซื้อ/ขาย</th><th>ราคา</th><th>จำนวน</th><th>ค่าธรรมเนียม</th></tr></thead><tbody>")}${p.rows
          .slice(0, 10)
          .map(
            (x) =>
              `<tr><td>${esc(x.time)}</td><td>${esc(x.market??'Spot')}</td><td>${esc(x.pair)}</td><td>${esc(x.side)}</td><td>${x.price}</td><td>${x.quantity}</td><td>${x.fee ?? (globalThis.SnaapI18n?.text("ไม่ระบุ") ?? "ไม่ระบุ")}</td></tr>`,
          )
          .join(
            "",
          )}${(globalThis.SnaapI18n?.text("</tbody></table></div><p class=\"field-note\">แสดง ") ?? "</tbody></table></div><p class=\"field-note\">แสดง ")}${Math.min(10, p.rows.length)}${(globalThis.SnaapI18n?.text(" แถวแรก</p><button class=\"primary\" data-confirm-import ") ?? " แถวแรก</p><button class=\"primary\" data-confirm-import ")}${p.errors.length ? "disabled" : ""}${(globalThis.SnaapI18n?.text(">ยืนยันนำเข้า</button>") ?? ">ยืนยันนำเข้า</button>")}`;
    }
  } catch (error) {
    toast(error.message);
  }
});
let historyGeneration=0;
async function loadChatHistory(){
    const generation=++historyGeneration,conversation=state.conversation,workspace=state.workspaceId;
    const current=()=>generation===historyGeneration&&state.conversation===conversation&&state.workspaceId===workspace;
    const summary = state.conversationRows?.find(row => row.id === conversation);
    // Recovery starts from summary metadata. Legacy change receipts need the saved
    // draft to rebuild their save card; selecting a chat already loaded this detail.
    const detail = summary && !Object.hasOwn(summary, 'draft')
      ? api(`/conversations/${conversation}`).then(row => {
          if (current()) conversationCache.upsert(row, {invalidate: false});
        })
      : Promise.resolve();
    let [chatPage] = await Promise.all([api(`/conversations/${conversation}/messages`), detail]);
    if(!current())return;
    const paintPage = async (rows) => { for (const m of rows) {
      if(!current())return;
      if(!['preset','setup'].includes(m.ui_card?.type)){
        const node=message(m.content, m.role === "user");
        if(m.role==='assistant' && m.artifacts?.length)(await chatArtifactsReady).renderArtifacts(node,m.artifacts,{refresh:artifactId=>api(`/conversations/${conversation}/messages/${m.id}/artifacts/${artifactId}/refresh`,'POST',{})});
      }
      if(['preset','setup'].includes(m.ui_card?.type))(await presetsReady).renderCard(m);
      if (m.setup_changes?.length) await showSetupChanges(null, null, m.setup_changes);
      if (m.sources?.some((s) => !s.available))
        message((globalThis.SnaapI18n?.text("ข้อมูลอ้างอิงบางส่วนถูกลบแล้ว ข้อสรุปเดิมอาจใช้ต่อไม่ได้") ?? "ข้อมูลอ้างอิงบางส่วนถูกลบแล้ว ข้อสรุปเดิมอาจใช้ต่อไม่ได้"));
      if(m.role === 'user')appendChatImages((m.sources ?? []).filter(source => source.type === 'image' && source.available));
    }};
    await paintPage(chatPage);
    if(!current())return;
    const stored=state.conversationRows.find(row=>row.id===conversation);
    if(stored?.draft&&!chatPage.some(m=>['preset','setup'].includes(m.ui_card?.type))&&chatPage.some(m=>m.setup_changes?.length))await showChatSetupCard();
    requestAnimationFrame(()=>{if(current()){scrollChatToLatest();focusChatArtifact(messagePane.lastElementChild?.querySelector('.chat-artifact'));}});
    if (chatPage.length === 200) {
      const older = document.createElement("button");
      older.className="text-button"; older.textContent=(globalThis.SnaapI18n?.text("โหลดข้อความก่อนหน้า") ?? "โหลดข้อความก่อนหน้า");
      $("#messages").prepend(older);
      const conversationId=state.conversation;
      older.onclick=async()=>{
        older.disabled=true;
        const priorHeight=messagePane.scrollHeight,priorTop=messagePane.scrollTop;
        followingChat=false;
        try {
          const page=await api(`/conversations/${conversationId}/messages?before=${chatPage[0].id}`);
          if(!current())return;
          const existing=[...$("#messages").childNodes].filter(n=>n!==older);
          $("#messages").replaceChildren();await paintPage(page);existing.forEach(n=>$("#messages").append(n));
          document.dispatchEvent(new Event('setup-changed'));
          messagePane.scrollTop=priorTop+messagePane.scrollHeight-priorHeight;
          chatPage=page;if(page.length===200)$("#messages").prepend(older);
        }catch(error){toast(error.message);}finally{older.disabled=false;}
      };
    }
}
let conversationSelection=0;
let conversationDetailController;
conversations.addEventListener("change", async () => {
  if (!conversations.value) return;
  const selected = conversations.value;
  const selection=++conversationSelection,workspace=state.workspaceId;
  const started = performance.now();
  conversationDetailController?.abort();
  if (!(await leaveDraft())) {
    if(selection!==conversationSelection||state.workspaceId!==workspace)return;
    conversations.value = state.conversation ?? "";
    return;
  }
  let loading;
  try {
    if(selection!==conversationSelection||state.workspaceId!==workspace)return;
    const controller = new AbortController();
    conversationDetailController = controller;
    loading = document.createElement('div');
    loading.innerHTML = skeletonUI('chat', (globalThis.SnaapI18n?.text("กำลังเปิดบทสนทนา…") ?? "กำลังเปิดบทสนทนา…"));
    $('#messages').prepend(loading);
    showDraftStatus((globalThis.SnaapI18n?.text("กำลังเปิดบทสนทนา…") ?? "กำลังเปิดบทสนทนา…"), "saving");
    const stored = await api(`/conversations/${selected}`, 'GET', undefined, {signal: controller.signal});
    if(selection!==conversationSelection||state.workspaceId!==workspace)return;
    conversationCache.upsert(stored, {invalidate: false});
    applyConversationRows(conversationCache.read().rows);
    state.conversation = selected;
    conversations.value = selected;
    state.draft = stored?.draft ?? initial();
    state.persistedDraft = JSON.stringify(state.draft);
    showDraftStatus(stored?.draft ? (globalThis.SnaapI18n?.text("บันทึกร่างแล้ว") ?? "บันทึกร่างแล้ว") : "", stored?.draft ? "saved" : "pending");
    state.undo = [];
    state.replay = null;
    state.images = [];
    state.crop = null;
    renderImages();
    state.saved = state.rules.find(rule=>rule.id===stored?.saved_rule_id)??null;
    state.editorNotice = null;
    setWorkbenchTab("chat");
    state.draftRevision = stored?.draft_revision ?? 0;
    $("#messages").replaceChildren();
    $('#messages').prepend(loading);
    showDesigner();
    await Promise.all([loadChatHistory(), restoreChatImages()]);
    if(selection===conversationSelection&&state.workspaceId===workspace)
      recordConversationTiming('selection', started, {outcome: 'success'});
  } catch (error) {
    if(selection!==conversationSelection||state.workspaceId!==workspace||error.name==='AbortError')return;
    conversations.value = state.conversation ?? '';
    showDraftStatus((globalThis.SnaapI18n?.text("เปิดบทสนทนาไม่สำเร็จ") ?? "เปิดบทสนทนาไม่สำเร็จ"), "error");
    recordConversationTiming('selection', started, {outcome: 'error'});
    toast(error.message);
  } finally { loading?.remove(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const menu = e.target.closest(".watch-channel-picker[open]");
  if (!menu) return;
  menu.open = false;
  menu.querySelector("summary").focus();
});
document.addEventListener("toggle", (e) => {
  if (!e.target.matches(".watch-channel-picker[open]")) return;
  document.querySelectorAll(".watch-channel-picker[open]").forEach(menu => {
    if (menu !== e.target) menu.open = false;
  });
}, true);
document.addEventListener("click", async (e) => {
  document.querySelectorAll(".watch-channel-picker[open]").forEach(menu => {
    if (!menu.contains(e.target)) menu.open = false;
  });
  if (sidebar.classList.contains("is-open") && !document.querySelector("dialog[open]") && !sidebar.contains(e.target) && !e.target.closest('[data-action="menu"]')) {
    setSidebarOpen(false);
    return;
  }
  const t = e.target.closest("button,a");
  if (!t) return;
  if (t.classList.contains("nav-item")) setSidebarOpen(false);
  try {
    if (t.classList.contains("nav-item") && t.dataset.view !== "home" && window.SnaapRouter.current() === t.dataset.view) {
      e.preventDefault();
      navigate(t.dataset.view);
      return;
    }
    if (t.classList.contains("nav-item") && t.dataset.view === "home") {
      e.preventDefault();
      setWorkbenchTab("chat");
      showDesigner();
      navigate("home");
      window.SnaapRouter.go("home");
      persistRecovery();
      return;
    }
    if (t.hasAttribute("data-attach-image")) {
      showDesigner();
      setWorkbenchTab("chat");
      $("#image-upload").click();
      return;
    }
    if (t.dataset.action === "menu")
      return setSidebarOpen(!sidebar.classList.contains("is-open"));
    if (t.dataset.action === "close-menu") return setSidebarOpen(false);
    if (t.dataset.action === "account-menu") {
      const opening = accountMenu.hidden;
      accountMenu.hidden = !opening;
      accountButton.setAttribute("aria-expanded", String(opening));
      if (opening) $("#auth-signout")?.focus();
      return;
    }
    if (t.dataset.action === "billing") {
      toast((globalThis.SnaapI18n?.text("เร็ว ๆ นี้") ?? "เร็ว ๆ นี้"));
      return;
    }
    if (t.dataset.action === "history") {
      window.SnaapRouter.go("history");
      return;
    }
    if (t.dataset.action === "new" || t.dataset.action === "new-rule") {
      if (!(await leaveDraft())) return;
      state.conversation = null;
      conversations.value = "";
      $('#chat-input').value='';
      $('#followup-input').value='';
      requestAnimationFrame(resizeChatInputs);
      state.draftRevision = 0;
      state.persistedDraft = null;
      showDraftStatus("");
      state.images = [];
      state.crop = null;
      renderImages();
      state.saved = null;
      state.draft = blankSetup();
      state.replay = null;
      state.undo = [];
      $("#messages").replaceChildren();
      state.editorNotice = null;
      window.SnaapStudio?.reset();
      window.SnaapChart?.reset();
      setWorkbenchTab(t.dataset.action === "new-rule" ? "design" : "chat");
      showDesigner();
      window.SnaapRouter.go("home");
      await refreshContext();
      return;
    }
    if (t.dataset.action === "advanced" || t.dataset.action === "sample-rule") {
      showDesigner();
      window.SnaapRouter.go("home");
      setWorkbenchTab("design");
      return;
    }
    if (t.dataset.prompt) {
      await chat(t.dataset.prompt);
      return;
    }
    if (t.dataset.tab) {
      setWorkbenchTab(t.dataset.tab);
      return;
    }
    if (t.dataset.filter) {
      state.filter = t.dataset.filter;
      $$("[data-filter]").forEach((x) => x.classList.toggle("active", x === t));
      renderWatch();
      return;
    }
    if (t.dataset.deleteRule) {
      if(state.busy){toast((globalThis.SnaapI18n?.text("รอรายการปัจจุบันเสร็จก่อนลบ") ?? "รอรายการปัจจุบันเสร็จก่อนลบ"));return;}
      const rule=state.rules.find(row=>row.id===t.dataset.deleteRule);
      if(!rule)return;
      if(!window.confirm(`${(globalThis.SnaapI18n?.text("ลบ “") ?? "ลบ “")}${rule.spec.name}${(globalThis.SnaapI18n?.text("” และหยุดแจ้งเตือน?\nบทสนทนาและร่างยังอยู่ คุณบันทึกกลับมาได้") ?? "” และหยุดแจ้งเตือน?\nบทสนทนาและร่างยังอยู่ คุณบันทึกกลับมาได้")}`))return;
      t.disabled=true;
      try{
        await api(`/rules/${rule.id}`,'DELETE',{expectedRevision:rule.revision});
        await refresh();renderDesigner();persistRecovery();
        toast((globalThis.SnaapI18n?.text("ลบเซ็ตอัพแล้ว · บันทึกกลับมาได้จากบทสนทนาเดิม") ?? "ลบเซ็ตอัพแล้ว · บันทึกกลับมาได้จากบทสนทนาเดิม"));
      }finally{t.disabled=false;}
      return;
    }
    if (t.hasAttribute("data-watch-connect-channel")) {
      e.preventDefault();
      notificationSection = "channels";
      await renderNotifications();
      return;
    }
    if (t.dataset.saveRuleChannels) {
      const r = state.rules.find(row => row.id === t.dataset.saveRuleChannels);
      if (!r || t.disabled) return;
      const menu = t.closest(".watch-channel-picker");
      const destinations = [...menu.querySelectorAll("input:checked")].map(input => input.value);
      if (destinations.length > 5) { toast((globalThis.SnaapI18n?.text("เลือกได้ไม่เกิน 5 ช่องทาง") ?? "เลือกได้ไม่เกิน 5 ช่องทาง")); return; }
      t.disabled = true;
      try {
        const saved = await api(`/rules/${r.id}/destinations`, "PUT", { expectedRevision: r.revision, destinations });
        if (state.saved?.id === r.id) {
          state.saved = saved;
          state.draft.destinations = [...saved.spec.destinations];
          renderDesigner();
          persistRecovery();
          await saveDraft();
        }
        await refresh();
        toast(destinations.length ? (globalThis.SnaapI18n?.text("บันทึกช่องทางแล้ว · ใช้กับสัญญาณถัดไป") ?? "บันทึกช่องทางแล้ว · ใช้กับสัญญาณถัดไป") : (globalThis.SnaapI18n?.text("รับสัญญาณในเว็บเท่านั้น") ?? "รับสัญญาณในเว็บเท่านั้น"));
      } finally { t.disabled = false; }
      return;
    }
    if (t.dataset.activateRule) {
      if (t.disabled) return;
      const r = state.rules.find((x) => x.id === t.dataset.activateRule);
      if (!r || t.disabled) return;
      await setRuleActivation(r, t);
      return;
    }
    if (t.dataset.openRule) {
      if (!(await leaveDraft())) return;
      const r = state.rules.find((r) => r.id === t.dataset.openRule);
      state.conversation = null;
      conversations.value = "";
      state.draftRevision = 0;
      state.persistedDraft = JSON.stringify(r.spec);
      showDraftStatus("");
      state.images = [];
      state.crop = null;
      renderImages();
      $("#messages").replaceChildren();
      state.editorNotice = null;
      state.saved = r;
      state.draft = structuredClone(r.spec);
      state.undo = [];
      state.replay = null;
      showDesigner();
      window.SnaapRouter.go("home");
      setWorkbenchTab("design");
      return;
    }
    if (t.hasAttribute("data-context")) {
      await setMyData(!state.useMyData);
      return;
    }
    if (t.dataset.removeImage) {
      state.crop = null;
      state.images = state.images.filter((x) => x.id !== t.dataset.removeImage);
      renderImages();
      return;
    }
    if (t.hasAttribute("data-undo")) {
      if (state.undo.length) {
        state.draft = state.undo.pop();
        state.replay = null;
        renderDesigner();
        queueDraftSave();
      }
      return;
    }
    if (t.dataset.group) {
      if (!canAddSetupCondition()) return;
      snapshot();
      set(t.dataset.group, {
        kind: "GROUP",
        op: "AND",
        children: [at(t.dataset.group), cmp()],
      });
      renderDesigner();
      return;
    }
    if (t.dataset.hold) {
      snapshot();
      set(t.dataset.hold, {
        kind: "HOLD",
        bars: 2,
        condition: at(t.dataset.hold),
      });
      renderDesigner();
      return;
    }
    if (t.dataset.add) {
      if (!canAddSetupCondition()) return;
      snapshot();
      at(t.dataset.add).children.push(cmp());
      renderDesigner();
      return;
    }
    if (t.dataset.remove) {
      snapshot();
      const keys = t.dataset.remove.split("."),
        i = Number(keys.pop());
      at(keys.join(".")).splice(i, 1);
      renderDesigner();
      return;
    }
    if (t.hasAttribute("data-stage")) {
      if (!canAddSetupCondition() || state.draft.stages.length >= 5) return;
      snapshot();
      state.draft.stages.push({ condition: cmp(), withinBars: 3 });
      renderDesigner();
      return;
    }
    if (t.dataset.removeOptional) {
      snapshot();
      delete state.draft[t.dataset.removeOptional];
      renderDesigner();
      return;
    }
    if (t.dataset.optional) {
      if (!canAddSetupCondition()) return;
      snapshot();
      state.draft[t.dataset.optional] = cmp();
      renderDesigner();
      return;
    }
    if (t.hasAttribute("data-save")) {
      if (t.disabled || state.saving) return;
      if (state.busy) return toast((globalThis.SnaapI18n?.text("รอขั้นตอนปัจจุบันเสร็จก่อน") ?? "รอขั้นตอนปัจจุบันเสร็จก่อน"));
      if (!validateEditor()) return;
      state.busy=true;
      setupPane.inert=true;
      try {
      t.disabled = true;
      state.saving = true;
      panel.inert = true;
      const saveLabel = t.textContent;
      t.textContent = (globalThis.SnaapI18n?.text("กำลังบันทึก…") ?? "กำลังบันทึก…");
      try { await saveDraft();
      await api("/strategies/validate", "POST", state.draft);
      const saved = state.saved
        ? await api("/rules/" + state.saved.id, "PUT", {
            expectedRevision: state.saved.revision,
            spec: state.draft,
            conversationId:state.conversation??undefined,
          })
        : await api("/rules", "POST", state.conversation?{spec:state.draft,conversationId:state.conversation}:state.draft);
      state.saved = saved;
      const index = state.rules.findIndex(rule => rule.id === saved.id);
      if (index < 0) state.rules.push(saved); else state.rules[index] = saved;
      if(state.conversation)await showChatSetupCard();
      state.images=[];state.crop=null;renderImages();
      renderWatch();
      renderDesigner();
      toast((globalThis.SnaapI18n?.text("บันทึกเซ็ตอัพแล้ว") ?? "บันทึกเซ็ตอัพแล้ว"));
      showEditorFeedback(
        saved.active
          ? (globalThis.SnaapI18n?.text("บันทึกเวอร์ชันใหม่แล้ว เซ็ตอัพยังเปิดใช้งานอยู่") ?? "บันทึกเวอร์ชันใหม่แล้ว เซ็ตอัพยังเปิดใช้งานอยู่")
          : (globalThis.SnaapI18n?.text("บันทึกเซ็ตอัพแล้ว เปิดแจ้งเตือนได้จากการ์ดในแชทหรือหน้าเซ็ตอัพที่ตั้งไว้") ?? "บันทึกเซ็ตอัพแล้ว เปิดแจ้งเตือนได้จากการ์ดในแชทหรือหน้าเซ็ตอัพที่ตั้งไว้"),
        true,
      );
      } finally { state.saving = false; panel.inert = false; t.disabled = false; t.textContent = saveLabel; }
      } finally {
        state.busy=false;setupPane.inert=false;
        if(t.isConnected)t.disabled=false;
      }
      return;
    }
    if (t.hasAttribute("data-replay")) {
      if (!validateEditor()) return;
      document.dispatchEvent(new Event('studio-refresh'));
      document.querySelector('.setup-studio').scrollIntoView({block:'start',behavior:'smooth'});
      return;
    }
    if (t.hasAttribute("data-confirm-import")) {
      t.disabled = true;
      const p = state.importPreview;
      const r = await api("/imports", "POST", {
        name: p.name,
        rows: p.rows,
        accountScope: $("#account-scope").value,
      });
      toast(`${(globalThis.SnaapI18n?.text("บันทึก ") ?? "บันทึก ")}${r.inserted}${(globalThis.SnaapI18n?.text(" รายการ · ซ้ำ ") ?? " รายการ · ซ้ำ ")}${r.duplicates}`);
      await renderHistory();
      return;
    }
    if (t.dataset.checkout) {
      const r = await api("/billing/checkout", "POST", {
        method: t.dataset.checkout,
      });
      location.href = r.url;
      return;
    }
    if (t.hasAttribute("data-portal")) {
      location.href = (await api("/billing/portal", "POST", {})).url;
      return;
    }
    if (t.hasAttribute("data-export")) {
      const data = await api("/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "snaap-export.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    toast(error.message);
    if (panel.contains(t)) {
      renderDesigner();
      showEditorFeedback(error.message);
    }
  }
});
window.addEventListener("snaap:navigate", () => navigate(window.SnaapRouter.current()));
let recoveryReady = false, recoveryFingerprint = '';
function recoveryKey() {
  return state.me?.id && state.workspaceId ? `snaap-draft-v1:${state.me.id}:${state.workspaceId}` : null;
}
function persistRecovery() {
  const key=recoveryKey();
  if(!key || !recoveryReady)return false;
  try {
    // Deliberately whitelist drafting fields. Never store API credentials or file bytes.
    const snapshot={version:1,conversation:state.conversation,draft:state.draft,
      savedId:state.saved?.id??null,draftRevision:state.draftRevision,persistedDraft:state.persistedDraft,
      chatText:$('#chat-input').value,followupText:$('#followup-input').value,
      tab:requestedWorkbenchMode??workbench.dataset.tab,designerOpen:!workbench.hidden,useMyData:state.useMyData,
      aiMode:$('#ai-mode').value,imageIds:state.images.map(image=>image.id),sentImageIds:state.images.filter(image=>image.sent).map(image=>image.id)};
    const fingerprint=key+JSON.stringify(snapshot);
    if(fingerprint!==recoveryFingerprint){
      localStorage.setItem(key,JSON.stringify({...snapshot,updatedAt:Date.now()}));
      recoveryFingerprint=fingerprint;
    }
    return true;
  } catch { return false; }
}
async function restoreRecovery() {
  recoveryReady=false;
  const pending = [];
  let stored;
  try{stored=JSON.parse(localStorage.getItem(recoveryKey())??'null');}catch{}
  if(stored?.version===1){
    $('#chat-input').value=typeof stored.chatText==='string'?stored.chatText.slice(0,1600):'';
    $('#followup-input').value=typeof stored.followupText==='string'?stored.followupText.slice(0,1600):'';
    $('#chat-input').dispatchEvent(new Event('input',{bubbles:true}));
    const row=state.conversationRows.find(r=>r.id===stored.conversation);
    state.conversation=row?.id??null;
    renderConversationTitle();
    conversations.value=state.conversation??'';
    state.draft=stored.draft?.schemaVersion===2?stored.draft:null;
    state.draftRevision=row?stored.draftRevision??0:0;
    state.persistedDraft=row?stored.persistedDraft:null;
    state.saved=state.rules.find(r=>r.id===stored.savedId)??null;
    $('#ai-mode').value='standard';
    if(stored.designerOpen&&state.draft){
      setWorkbenchTab(['chat','design','split'].includes(stored.tab)?stored.tab:'chat');
      showDesigner();
      if(state.conversation){
        try{
          pending.push(loadChatHistory().catch(() => {}));
        }catch{}
      }
    }
    if(stored.useMyData)pending.push(setMyData(true).catch(() => {}));
    if(state.conversation)pending.push(restoreChatImages(Array.isArray(stored.imageIds)?stored.imageIds:undefined,Array.isArray(stored.sentImageIds)?stored.sentImageIds:[]).catch(() => {}));
  }
  await Promise.all(pending);
  recoveryReady=true;
  if(state.draft)queueDraftSave();
}
document.addEventListener('input',event=>{
  if(['chat-input','followup-input'].includes(event.target.id))persistRecovery();
});
document.addEventListener('change',event=>{
  if(event.target.id==='ai-mode')persistRecovery();
});
window.addEventListener('pagehide',persistRecovery);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistRecovery();});
window.addEventListener('online',()=>{if(state.draft&&draftDirty())saveDraft().catch(()=>{});});
// Also checkpoint programmatic updates such as cleared text after sending a message.
setInterval(()=>{if(recoveryReady)persistRecovery();},2000);
async function boot() {
  await Promise.all([directionToolsReady, indicatorCatalogReady, setupLimitsReady, timeframeToolsReady, conversationCacheReady]);
  // Companion deferred scripts provide workspace and page helpers.
  await companionScriptsReady;
  $("#nav-count").textContent = "";
  navigate(window.SnaapRouter.current(), false);
  try {
    try {
      healthReady = api('/health').then(health => { state.health = health; }).catch(() => { state.health = { ai: false, billing: false }; });
      const [me] = await Promise.all([api('/me'), initWorkspaces(), directionToolsReady, indicatorCatalogReady, entryFlexReady]);
      state.me = me;
    }
    catch(error){
      if(error.statusCode!==401)throw error;
      location.replace('/login.html');return;
    }
    sessionStorage.removeItem('snaap-signed-out');
    await refresh({ reuseMe: true });
    await restoreRecovery();
  } catch (error) {
    if(error.statusCode===401){location.replace('/login.html?error=expired');return;}
    window.SnaapBoot?.fail(error.message);
    return;
  }
  navigate(window.SnaapRouter.current());
  if(workbench.hidden || !state.draft){showDesigner();setWorkbenchTab('chat');}
  else renderDesigner();
  // Allow restored geometry and fonts to settle before the first visible frame.
  if (document.fonts) await Promise.race([
    document.fonts.ready,
    new Promise(resolve => setTimeout(resolve, 250)),
  ]);
  requestAnimationFrame(() => {
    sizeWorkbench();
    document.querySelectorAll('#messages .message').forEach(message => message.classList.add('boot-restored'));
    window.SnaapBoot?.finish();
  });
}
boot();

function evidenceUI(e) {
  if (!e) return "";
  const label = { TRUE: (globalThis.SnaapI18n?.text("ผ่าน") ?? "ผ่าน"), FALSE: (globalThis.SnaapI18n?.text("ไม่ผ่าน") ?? "ไม่ผ่าน"), UNKNOWN: (globalThis.SnaapI18n?.text("ข้อมูลไม่พอ") ?? "ข้อมูลไม่พอ") };
  return `<div class="evidence-row"><strong>${label[e.result] ?? (globalThis.SnaapI18n?.text("รอ") ?? "รอ")}</strong>${e.left !== undefined ? " · " + Number(e.left).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"), { maximumFractionDigits: 6 }) : ""}${e.right !== undefined ? (globalThis.SnaapI18n?.text(" เทียบกับ ") ?? " เทียบกับ ") + Number(e.right).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"), { maximumFractionDigits: 6 }) : ""}${e.reason ? " · " + esc(globalThis.SnaapI18n?.text(e.reason) ?? e.reason) : ""}${e.children ? e.children.map(evidenceUI).join("") : ""}</div>`;
}
function barEvidence(bar, { showProgress = true } = {}) {
  if(bar?.explanations){
    const e=bar.explanations;
    return `${(globalThis.SnaapI18n?.text("<p>ประเมิน ณ ") ?? "<p>ประเมิน ณ ")}${esc(insightTime(bar.time))}</p>${showProgress ? progressUI(bar.progress) : ''}${(globalThis.SnaapI18n?.text("<p>เงื่อนไขเริ่มต้น</p>") ?? "<p>เงื่อนไขเริ่มต้น</p>")}${explanationsUI(e.entry)}${e.stages.map((lines,i)=>`${(globalThis.SnaapI18n?.text("<p>รอยืนยันขั้น ") ?? "<p>รอยืนยันขั้น ")}${i+1}</p>${explanationsUI(lines)}`).join('')}${e.exit.length?(globalThis.SnaapI18n?.text("<p>เงื่อนไขออก</p>") ?? "<p>เงื่อนไขออก</p>")+explanationsUI(e.exit):''}${e.cancel.length?(globalThis.SnaapI18n?.text("<p>เงื่อนไขยกเลิก</p>") ?? "<p>เงื่อนไขยกเลิก</p>")+explanationsUI(e.cancel):''}${timeframeUI(bar.timeframes, { showConditions: false })}`;
  }
  if(bar?.branches)return bar.branches.map(b=>`<h4>${esc(directionLabel(b.side,b.side==='SPOT'?'Spot':'Perpetual Futures'))}</h4>`+barEvidence({...b,time:bar.time}, { showProgress })).join('');
  return bar
    ? `<p>${new Date(bar.time).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"))}${bar.waitingStage >= 0 ? (globalThis.SnaapI18n?.text(" · รอขั้นตอน ") ?? " · รอขั้นตอน ") + (bar.waitingStage + 2) : ""}${bar.activeSignal ? (globalThis.SnaapI18n?.text(" · วงจรสัญญาณเข้าเปิดอยู่") ?? " · วงจรสัญญาณเข้าเปิดอยู่") : ""}${(globalThis.SnaapI18n?.text("</p><p>เงื่อนไขเริ่มต้น</p>") ?? "</p><p>เงื่อนไขเริ่มต้น</p>")}${evidenceUI(bar.entry)}${bar.stages.map((s, i) => (globalThis.SnaapI18n?.text("<p>ขั้นตอน ") ?? "<p>ขั้นตอน ") + (i + 2) + "</p>" + evidenceUI(s)).join("")}${bar.exit ? (globalThis.SnaapI18n?.text("<p>สัญญาณออก</p>") ?? "<p>สัญญาณออก</p>") + evidenceUI(bar.exit) : ""}`
    : "";
}
panel.addEventListener("input", (e) => {
  if (e.target.hasAttribute("data-timeline"))
    $("#bar-evidence").innerHTML = barEvidence(
      state.replay.timeline[Number(e.target.value)],
    );
});

function setupEntrySummary(d){
 if(d.market==='Spot'||!['LONG','SHORT','BOTH'].includes(d.side))return conditionText(d.entry);
 const short=d.mirrorShort?directionTools.mirrorBranch(d):d.short;
 if(d.side==='BOTH'&&short)return 'Long: '+conditionText(d.entry)+' · Short: '+conditionText(short.entry);
 return (d.side==='SHORT'?'Short: ':'Long: ')+conditionText(d.side==='SHORT'&&short?short.entry:d.entry);
}
function fullSummary(d) {
  const summary=branchSummary(d);
  if(d.market==='Spot')return (globalThis.SnaapI18n?.text("Spot (ซื้อ)\n") ?? "Spot (ซื้อ)\n")+summary;
  if(d.mirrorShort){
    const short=branchSummary(directionTools.mirrorBranch(d));
    return d.side==='BOTH'?(globalThis.SnaapI18n?.text("Long (ซื้อ)\n") ?? "Long (ซื้อ)\n")+summary+(globalThis.SnaapI18n?.text("\n\nShort (ขาย · สลับฝั่ง)\n") ?? "\n\nShort (ขาย · สลับฝั่ง)\n")+short:(globalThis.SnaapI18n?.text("Short (ขาย · สลับฝั่ง)\n") ?? "Short (ขาย · สลับฝั่ง)\n")+short;
  }
  if(d.side==='BOTH'&&d.short)return (globalThis.SnaapI18n?.text("Long (ซื้อ)\n") ?? "Long (ซื้อ)\n")+summary+(globalThis.SnaapI18n?.text("\n\nShort (ขาย)\n") ?? "\n\nShort (ขาย)\n")+branchSummary(d.short);
  return directionLabel(d.side,d.market)+'\n'+summary;
}
function branchSummary(d) {
  return (
    conditionText(d.entry) +
    d.stages
      .map(
        (s) =>
          (globalThis.SnaapI18n?.text("\n→ ภายใน ") ?? "\n→ ภายใน ") + s.withinBars + (globalThis.SnaapI18n?.text(" แท่ง: ") ?? " แท่ง: ") + conditionText(s.condition),
      )
      .join("") +
    (d.exit ? (globalThis.SnaapI18n?.text("\nออก: ") ?? "\nออก: ") + conditionText(d.exit) : "") +
    (d.cancel ? (globalThis.SnaapI18n?.text("\nยกเลิก: ") ?? "\nยกเลิก: ") + conditionText(d.cancel) : "") +
    (globalThis.SnaapI18n?.text("\nพัก ") ?? "\nพัก ") +
    d.cooldownBars +
    (globalThis.SnaapI18n?.text(" แท่ง") ?? " แท่ง")
  );
}
function reviewProposal(draft) {
  const conversation=state.conversation,workspace=state.workspaceId;
  const dialog = document.createElement("dialog");
  dialog.className = "runtime-dialog";
  dialog.innerHTML = `${(globalThis.SnaapI18n?.text("<h2>ตรวจร่างที่ snaap เสนอ</h2><h3>ร่างปัจจุบัน</h3><p><strong>") ?? "<h2>ตรวจร่างที่ snaap เสนอ</h2><h3>ร่างปัจจุบัน</h3><p><strong>")}${esc(state.draft.name)}</strong> · ${esc(state.draft.exchange.join(', '))} · ${esc(state.draft.pairs.join(', '))}</p><p class="draft-diff">${esc(fullSummary(state.draft))}${(globalThis.SnaapI18n?.text("</p><h3>ข้อเสนอ</h3><p><strong>") ?? "</p><h3>ข้อเสนอ</h3><p><strong>")}${esc(draft.name)}</strong> · ${esc(draft.exchange.join(", "))} · ${esc(draft.pairs.join(", "))}</p><p class="draft-diff">${esc(fullSummary(draft))}${(globalThis.SnaapI18n?.text("</p><p class=\"field-note\">ใช้ร่างนี้จะแทนที่ร่างปัจจุบัน รวมชื่อและเงื่อนไขที่คุณแก้ระหว่างรอ</p><div class=\"design-actions\"><button class=\"primary\" data-apply>ใช้ร่างนี้</button><button class=\"secondary\" data-keep>ใช้ร่างเดิม</button></div>") ?? "</p><p class=\"field-note\">ใช้ร่างนี้จะแทนที่ร่างปัจจุบัน รวมชื่อและเงื่อนไขที่คุณแก้ระหว่างรอ</p><div class=\"design-actions\"><button class=\"primary\" data-apply>ใช้ร่างนี้</button><button class=\"secondary\" data-keep>ใช้ร่างเดิม</button></div>")}`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("[data-apply]").onclick = async () => {
    if(state.conversation!==conversation||state.workspaceId!==workspace){dialog.close();return toast((globalThis.SnaapI18n?.text("บทสนทนาเปลี่ยนแล้ว กรุณาขอร่างในบทสนทนาปัจจุบัน") ?? "บทสนทนาเปลี่ยนแล้ว กรุณาขอร่างในบทสนทนาปัจจุบัน"));}
    if(state.busy)return toast((globalThis.SnaapI18n?.text("รอขั้นตอนปัจจุบันเสร็จก่อน") ?? "รอขั้นตอนปัจจุบันเสร็จก่อน"));
    state.busy=true;
    try {
    const previousDraft = structuredClone(state.draft);
    snapshot();
    state.draft = draft;
    state.replay = null;
    renderDesigner();
    dialog.close();
    await showSetupChanges(previousDraft,state.draft);
    await showChatSetupCard();
    } finally {state.busy=false;}
  };
  dialog.querySelector("[data-keep]").onclick = () => dialog.close();
  dialog.onclose = () => dialog.remove();
}
