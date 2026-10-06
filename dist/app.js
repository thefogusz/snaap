'use strict';
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const defaults = {name:'ราคาย่อตัวในขาขึ้น', exchange:'Binance', market:'Spot', pairs:'BTC/USDT, ETH/USDT', timeframe:'1h', ema:200, rsi:30, volume:1.5, close:true, channel:'Telegram'};
const state = {view:'home',filter:'all',editing:null,channel:'Telegram',rules:[{...defaults,id:1,active:true},{...defaults,id:2,name:'RSI ตัดขึ้นเหนือ 40',exchange:'MEXC',pairs:'SOL/USDT',timeframe:'4h',rsi:40,active:false}]};
const pageNames = {home:['คุยกับ snaap','สร้างรายการ'],watch:['รายการแจ้งเตือน','รายการทั้งหมด'],history:['ข้อมูลของฉัน','ข้อมูลของฉัน'],notifications:['การแจ้งเตือน','ช่องทางรับข้อความ']};
function toast(message) {
  window.SnaapToast.show(message);
}
function navigate(view) {
  if(!pageNames[view]) view='home'; state.view=view;
  $$('.view').forEach(el=>el.hidden=el.id!==`view-${view}`);
  $$('.nav-item').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('#page-name').textContent=pageNames[view][0];$('#page-detail').textContent=pageNames[view][1];
  $('#sidebar').classList.remove('is-open'); if(view==='watch')renderWatch();
  window.scrollTo({top:0,behavior:'instant'});
}
function go(view){window.SnaapRouter.go(view);}
function summary(rule){return `ราคา > EMA ${rule.ema} · RSI (14) ตัดขึ้นเหนือ ${rule.rsi} · วอลุ่ม > ${rule.volume}× ค่าเฉลี่ย 20 แท่ง · ${rule.timeframe} · ${rule.close?'รอแท่งปิด':'ตรวจระหว่างแท่ง'}`;}
function renderWatch(){
  const rules=state.rules.filter(r=>state.filter==='all'||(state.filter==='active'?r.active:!r.active));
  $('#nav-count').textContent=state.rules.length;
  $('#watch-list').innerHTML=rules.length?rules.map(r=>`<article class="watch-row"><div class="watch-row-heading"><span class="setup-icon">${icon('leaf')}</span><div><h2>${escapeHTML(r.name)}</h2><small>${escapeHTML(r.exchange)} · ${escapeHTML(r.market)} · ${escapeHTML(r.pairs)}</small></div><span class="status ${r.active?'':'paused'}">${r.active?'เปิดใช้งาน · ทดลอง':'หยุดชั่วคราว'}</span></div><p class="watch-rule-summary">${escapeHTML(summary(r))}</p><div class="watch-row-footer"><small>ปลายทาง ${escapeHTML(r.channel)} · ยังไม่ส่งจริง</small><div class="row-actions"><button class="secondary" data-preview="${r.id}">ดูข้อความแจ้งเตือน</button><button class="secondary" data-edit="${r.id}">แก้ไข</button><button class="secondary" data-toggle="${r.id}">${r.active?'หยุดชั่วคราว':'เปิดใช้งาน'}</button></div></div></article>`).join(''):'<div class="empty-state">ยังไม่มีรายการในหมวดนี้</div>';
}
function openRule(rule=defaults,editId=null,advanced=false){
  state.editing=editId;state.flowReview=false;
  const map={'rule-name':'name',exchange:'exchange',market:'market',pairs:'pairs',timeframe:'timeframe',ema:'ema',rsi:'rsi',volume:'volume','rule-channel':'channel'};
  Object.entries(map).forEach(([id,key])=>$('#'+id).value=rule[key]);
  $('#pairs').setCustomValidity('');$('#rule-name').setCustomValidity('');
  $('#candle-close').checked=rule.close;$('#advanced-details').open=advanced;updateFormula();
  $('#rule-dialog').showModal();
}
function updateFormula(){
  $('#formula').textContent=`${$('#exchange').value} / ${$('#market').value} / ${$('#timeframe').value}\nclose > EMA(${$('#ema').value}) AND RSI(14) crosses above ${$('#rsi').value} AND volume > ${$('#volume').value} × SMA(volume, 20)${$('#candle-close').checked?' · candle closed':''}`;
  const rules=$$('.plain-rules p');
  rules[0].innerHTML=`<span>1</span>ราคาอยู่เหนือ EMA ${escapeHTML($('#ema').value)}`;
  rules[1].innerHTML=`<span>2</span>RSI (14) ตัดขึ้นเหนือ ${escapeHTML($('#rsi').value)}`;
  rules[2].innerHTML=`<span>3</span>วอลุ่มมากกว่า ${escapeHTML($('#volume').value)} เท่าของค่าเฉลี่ย 20 แท่ง`;
}
$('#rule-form').addEventListener('input',()=>{updateFormula();$('#pairs').setCustomValidity('');$('#rule-name').setCustomValidity('');});
$('#rule-form').addEventListener('invalid',()=>{$('#advanced-details').open=true;},true);
$('#rule-form').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('#rule-name').value.trim();
  if(!name){$('#rule-name').setCustomValidity('กรุณาตั้งชื่อรายการ');$('#rule-name').reportValidity();return;}
  const pairList=$('#pairs').value.toUpperCase().split(',').map(s=>s.trim());
  if(!pairList.length||pairList.some(p=>!/^([A-Z0-9]{2,20})\/([A-Z0-9]{2,12})$/.test(p))){$('#pairs').setCustomValidity('ใช้รูปแบบ BTC/USDT, ETH/USDT');$('#pairs').reportValidity();return;}
  const existing=state.rules.find(r=>r.id===state.editing);
  const rule={name,exchange:$('#exchange').value,market:$('#market').value,pairs:[...new Set(pairList)].join(', '),timeframe:$('#timeframe').value,ema:Number($('#ema').value),rsi:Number($('#rsi').value),volume:Number($('#volume').value),close:$('#candle-close').checked,channel:$('#rule-channel').value,id:existing?.id??Date.now(),active:existing?.active??true};
  if(existing)state.rules[state.rules.indexOf(existing)]=rule;else state.rules.push(rule);
  if(state.flowReview || setupFlowOwns(rule.id)){completeSetupFlow(rule);state.flowReview=false;}
  $('#rule-dialog').close();state.filter='all';$$('[data-filter]').forEach(el=>el.classList.toggle('active',el.dataset.filter==='all'));renderWatch();go('watch');
  toast('บันทึกรายการทดลองแล้ว · ยังไม่เปิดเฝ้าตลาดจริง');
});
function addMessage(text,user=false){
  const message=document.createElement('div');message.className=`message ${user?'user':'assistant'}`;
  if(user)message.textContent=text;else message.innerHTML=`<span class="mini-brand" aria-hidden="true"><img class="brand-badge-symbol" src="/assets/snaap-favicon.svg?v=2" alt="" aria-hidden="true"></span><div class="assistant-body">${text}</div>`;
  $('#messages').append(message);
}
function chat(prompt){
  const text=prompt.trim();if(!text)return;
  go('home');$('#welcome').hidden=true;$('#conversation').hidden=false;addMessage(text,true);
  if(/ประวัติ|ไม้เก่า|ไม้ชนะ|วิเคราะห์/.test(text)){
    addMessage('<p>ดูผลวิเคราะห์ประวัติตัวอย่างได้ด้านล่าง</p><div class="chat-rule"><h3>วิเคราะห์ข้อมูลของฉัน</h3><p>ยังไม่รองรับการนำเข้าข้อมูลส่วนตัว</p><button class="primary" data-action="history">ดูประวัติตัวอย่าง</button></div>');
  }else{
    startSetupFlow(text);
  }
  $('#chat-input').value='';$('#followup-input').value='';
  if(!/ประวัติ|ไม้เก่า|ไม้ชนะ|วิเคราะห์/.test(text))focusSetupFlow();else $('#followup-input').focus();
}
$('#chat-form').addEventListener('submit',e=>{e.preventDefault();chat($('#chat-input').value);});
$('#chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#chat-form').requestSubmit();}});
$('#followup-form').addEventListener('submit',e=>{e.preventDefault();chat($('#followup-input').value);});
function resetChat(){go('home');$('#messages').replaceChildren();resetSetupFlow();$('#conversation').hidden=true;$('#welcome').hidden=false;$('#chat-input').value='';$('#chat-input').focus();}
function sampleHistory(){
  $('#history-result').hidden=false;
  $('#history-result').innerHTML='<span class="small-label">ผลวิเคราะห์ตัวอย่าง</span><h2>ตัวอย่าง: ราคาย่อตัวในขาขึ้น</h2><p>ราคาอยู่ในแนวโน้มขาขึ้น RSI ฟื้นตัว และวอลุ่มเพิ่มขึ้น</p><p>ผลสมมติ ยังไม่ได้ทดสอบประสิทธิภาพ</p><button class="primary" data-action="sample-rule">สร้างเงื่อนไขจากตัวอย่าง</button>';
  $('#history-result').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
}
$('#notification-form').addEventListener('change',()=>{$('#preview-channel').textContent=$('input[name="channel"]:checked').value;});
$('#notification-form').addEventListener('submit',e=>{e.preventDefault();state.channel=$('input[name="channel"]:checked').value;toast(`บันทึก ${state.channel} สำหรับรายการใหม่แล้ว · ยังไม่เชื่อมต่อจริง`);});
document.addEventListener('click',e=>{
  const target=e.target.closest('button, a');if(!target)return;
  if(target.dataset.close){$('#'+target.dataset.close).close();return;}
  if(target.dataset.prompt){chat(target.dataset.prompt);return;}
  if(target.dataset.edit){const rule=state.rules.find(r=>r.id===Number(target.dataset.edit));if(rule)openRule(rule,rule.id);return;}
  if(target.dataset.toggle){const rule=state.rules.find(r=>r.id===Number(target.dataset.toggle));if(rule){rule.active=!rule.active;renderWatch();toast(rule.active?'เปิดรายการทดลองอีกครั้งแล้ว':'พักรายการทดลองแล้ว');}return;}
  if(target.dataset.filter){state.filter=target.dataset.filter;$$('[data-filter]').forEach(el=>el.classList.toggle('active',el===target));renderWatch();return;}
  switch(target.dataset.action){
    case 'new':resetChat();break;
    case 'advanced':openRule({...defaults,channel:state.channel},null,true);break;
    case 'sample-rule':openRule({...defaults,channel:state.channel});break;
    case 'history':go('history');break;
    case 'sample-history':sampleHistory();break;
    case 'about':$('#about-dialog').showModal();break;
    case 'menu':$('#sidebar').classList.toggle('is-open');break;
  }
});
document.addEventListener('click',e=>{if(matchMedia('(max-width: 760px)').matches&&!e.target.closest('#sidebar')&&!e.target.closest('[data-action="menu"]'))$('#sidebar').classList.remove('is-open');});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#sidebar').classList.remove('is-open');});
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
window.addEventListener('snaap:navigate',()=>navigate(window.SnaapRouter.current()));
navigate(window.SnaapRouter.current());renderWatch();
// Optional browser-native agent access uses exactly the same navigation as the UI.
const context=document.modelContext;
if(context?.registerTool){
  const lifecycle=new AbortController();
  try{Promise.resolve(context.registerTool({name:'navigate_snaap_prototype',title:'Open a Snaap prototype screen',description:'Navigate this design prototype. Does not connect an exchange, monitor markets, or send notifications.',inputSchema:{type:'object',properties:{view:{type:'string',enum:Object.keys(pageNames)}},required:['view'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||!Object.hasOwn(pageNames,input.view)||Object.keys(input).some(k=>k!=='view'))throw new Error('Invalid view');window.SnaapRouter.replace(input.view);navigate(input.view);return {view:state.view,prototype:true};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
