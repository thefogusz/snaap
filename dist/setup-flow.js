'use strict';
// Guided prototype: explicit choices configure a draft. No LLM or market calls.
const setupPresets = {
  pullback: {title:'ราคาย่อตัวในขาขึ้น',description:'ราคายืนเหนือ EMA และ RSI ฟื้นตัว',detail:'EMA 200 · RSI ตัดขึ้นเหนือ 30 · วอลุ่ม 1.5×',rule:{...defaults}},
  momentum: {title:'โมเมนตัมขาขึ้น',description:'RSI และวอลุ่มเพิ่มขึ้นในแนวโน้มขาขึ้น',detail:'EMA 50 · RSI ตัดขึ้นเหนือ 50 · วอลุ่ม 2×',rule:{...defaults,name:'โมเมนตัมขาขึ้น',ema:50,rsi:50,volume:2,timeframe:'15m'}}
};
const flow = {step:0,preset:null,draft:null,savedId:null};
const guide = document.createElement('section');
guide.id='setup-guide';guide.className='setup-guide';guide.hidden=true;guide.setAttribute('aria-label','ตั้งเงื่อนไขแจ้งเตือน');
$('#followup-form').before(guide);
const conversationTitle=document.createElement('div');
conversationTitle.className='conversation-heading';
conversationTitle.innerHTML='<div><h1>คุยกับ snaap</h1></div><button class="text-button" data-action="new">เริ่มใหม่</button>';
$('#conversation').prepend(conversationTitle);
const previewDialog=document.createElement('dialog');
previewDialog.id='alert-preview-dialog';previewDialog.className='alert-preview-dialog';previewDialog.setAttribute('aria-labelledby','alert-preview-title');
document.body.append(previewDialog);

function resetSetupFlow(){Object.assign(flow,{step:0,preset:null,draft:null,savedId:null});guide.hidden=true;guide.replaceChildren();}
function setupFlowOwns(id){return flow.savedId===id;}
function focusSetupFlow(){const heading=guide.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});guide.scrollIntoView({block:'start',behavior:'instant'});}}
function startSetupFlow(text){
  if(flow.savedId){
    addMessage('<p>บันทึกแล้ว เลือกแก้ไขรายการหรือเริ่มใหม่</p>');
    renderSetupFlow();return;
  }
  if(flow.step){
    addMessage('<p>ต้นแบบยังไม่รองรับคำสั่ง AI ใช้ตัวเลือกด้านล่างเพื่อตั้งค่า</p>');
    renderSetupFlow();return;
  }
  flow.step=1;
  addMessage('<p>เลือกรูปแบบเงื่อนไขด้านล่าง</p>');
  renderSetupFlow();
}
function flowSteps(){
  return `<ol class="flow-steps" aria-label="ขั้นตอนตั้งเงื่อนไข">${['รูปแบบเงื่อนไข','เลือกตลาด','ตรวจและยืนยัน'].map((label,index)=>`<li class="${flow.savedId?'done':flow.step===index+1?'current':flow.step>index+1?'done':''}" ${!flow.savedId&&flow.step===index+1?'aria-current="step"':''}><span>${flow.savedId||flow.step>index+1?icon('check'):index+1}</span>${label}</li>`).join('')}</ol>`;
}
function marketFields(){
  const d=flow.draft;
  return `<form id="flow-market-form"><h2>เลือกตลาด</h2><p class="flow-description">เลือกแหล่งราคาให้ตรงกับที่คุณเทรด</p><div class="field-grid"><div><label class="field-label" for="flow-exchange">กระดานเทรด</label><select id="flow-exchange" required><option value="">เลือกกระดาน</option>${['Binance','MEXC','Bybit','OKX','Bitget'].map(x=>`<option ${d.exchange===x?'selected':''}>${x}</option>`).join('')}</select></div><div><label class="field-label" for="flow-market">ประเภทตลาด</label><select id="flow-market" required><option value="">เลือกตลาด</option><option value="Spot" ${d.market==='Spot'?'selected':''}>Spot — ซื้อขายสินทรัพย์</option><option value="Perpetual Futures" ${d.market==='Perpetual Futures'?'selected':''}>Perpetual Futures</option></select></div></div><label class="field-label" for="flow-pairs">คู่เทรดที่สนใจ</label><input id="flow-pairs" required maxlength="200" value="${escapeHTML(d.pairs)}" placeholder="เช่น BTC/USDT, ETH/USDT"><p class="field-note">คั่นแต่ละคู่ด้วยจุลภาค · ตัวเลือกกระดานเป็นตัวอย่าง ยังไม่ตรวจว่ามีคู่นี้จริง</p><label class="field-label" for="flow-timeframe">กรอบเวลา</label><select id="flow-timeframe">${[['5m','5 นาที'],['15m','15 นาที'],['1h','1 ชั่วโมง'],['4h','4 ชั่วโมง'],['1d','1 วัน']].map(([value,label])=>`<option value="${value}" ${d.timeframe===value?'selected':''}>${label}</option>`).join('')}</select><div class="flow-context">${icon('link')}ราคาและอินดิเคเตอร์จะอิงกระดานกับตลาดที่คุณเลือก</div><div class="flow-actions"><button type="button" class="text-button" data-flow-back="1">ย้อนกลับ</button><button class="primary" type="submit">ตรวจเงื่อนไข</button></div></form>`;
}
function reviewCard(){
  const d=flow.draft;const saved=!!flow.savedId;
  return `<div class="flow-review"><span class="review-kicker">${saved?'บันทึกรายการทดลองแล้ว':'ร่างรายการ'}</span><h2>${escapeHTML(d.name)}</h2><p class="review-source">${escapeHTML(d.exchange)} · ${escapeHTML(d.market)} · ${escapeHTML(d.timeframe)}</p><div class="pair-list">${d.pairs.split(',').map(p=>`<span>${escapeHTML(p.trim())}</span>`).join('')}</div><div class="rule-lines"><p><span>01</span>ราคาอยู่เหนือ EMA <strong>${d.ema}</strong></p><p><span>02</span>RSI (14) ตัดขึ้นเหนือ <strong>${d.rsi}</strong></p><p><span>03</span>วอลุ่มมากกว่า <strong>${d.volume} เท่า</strong> ของค่าเฉลี่ย 20 แท่ง</p></div><p class="flow-description">ต้องเข้าเงื่อนไขครบทุกข้อ · ${d.close?'ยืนยันเมื่อแท่งปิด':'ตรวจระหว่างแท่ง'}</p>${saved?`<div class="review-destination">ปลายทาง <strong>${escapeHTML(d.channel)}</strong> · ยังไม่ส่งจริง</div><div class="flow-actions"><button class="secondary" data-preview="${flow.savedId}">ดูข้อความแจ้งเตือน</button><button class="primary" data-flow-watch>ดูรายการแจ้งเตือน</button></div>`:`<label class="field-label" for="flow-channel">ช่องทางแจ้งเตือน</label><select id="flow-channel">${['Telegram','LINE','Webhook'].map(c=>`<option ${c===d.channel?'selected':''}>${c}</option>`).join('')}</select><div class="flow-actions"><button class="text-button" data-flow-back="2">แก้ตลาด / คู่เทรด</button><button class="primary" data-flow-review>ตรวจและแก้กฎ</button></div>`}</div>`;
}
function renderSetupFlow(){
  guide.hidden=false;
  let content='';
  if(flow.step===1){
    content=`<h2>เลือกรูปแบบเงื่อนไข</h2><p class="flow-description">แก้ไขค่าอินดิเคเตอร์ได้ในขั้นตอนถัดไป</p><div class="preset-list">${Object.entries(setupPresets).map(([key,p])=>`<button class="preset-choice ${flow.preset===key?'selected':''}" data-preset="${key}"><span class="setup-icon">${icon(key==='pullback'?'leaf':'sliders')}</span><span><strong>${p.title}</strong><span>${p.description}</span><small>${p.detail}</small></span>${icon('chevron')}</button>`).join('')}</div><button class="text-button flow-own-rule" data-action="advanced">${icon('sliders')}กำหนดค่าเอง</button>`;
  }else if(flow.step===2){content=marketFields();}else{content=reviewCard();}
  guide.innerHTML=`${flowSteps()}<div class="flow-content">${content}</div><p class="flow-prototype-note">ต้นแบบ · ยังไม่เชื่อม AI หรือข้อมูลตลาด</p>`;
  $('#page-detail').textContent=flow.savedId?'บันทึกแล้ว':`ขั้นตอน ${flow.step} จาก 3`;
}
function readFlowMarket(){
  const form=$('#flow-market-form');if(!form)return true;
  const pairs=$('#flow-pairs');pairs.setCustomValidity('');
  if(!form.reportValidity())return false;
  const list=pairs.value.toUpperCase().split(',').map(p=>p.trim());
  if(list.some(p=>!/^([A-Z0-9]{2,20})\/([A-Z0-9]{2,12})$/.test(p))){pairs.setCustomValidity('ใช้รูปแบบ BTC/USDT, ETH/USDT');pairs.reportValidity();return false;}
  Object.assign(flow.draft,{exchange:$('#flow-exchange').value,market:$('#flow-market').value,pairs:[...new Set(list)].join(', '),timeframe:$('#flow-timeframe').value});
  return true;
}
function completeSetupFlow(rule){
  flow.savedId=rule.id;flow.draft={...rule};flow.step=3;renderSetupFlow();
  addMessage(`<p>บันทึก “${escapeHTML(rule.name)}” แล้ว · ${escapeHTML(rule.exchange)} ${escapeHTML(rule.market)} · ${escapeHTML(rule.channel)}</p>`);
}
function showAlertPreview(rule){
  const pair=rule.pairs.split(',')[0].trim();
  previewDialog.innerHTML=`<div class="dialog-heading"><div><h2 id="alert-preview-title">ตัวอย่างแจ้งเตือน</h2></div><button class="icon-button" data-close="alert-preview-dialog" aria-label="ปิดตัวอย่างแจ้งเตือน">${icon('close')}</button></div><p class="field-note">ข้อมูลสมมติ ไม่ใช่สัญญาณตลาด</p><div class="message-phone"><div class="phone-heading"><span class="mini-brand"><img class="brand-badge-symbol" src="/assets/snaap-favicon.svg?v=2" alt="" aria-hidden="true"></span><span>snaap<small>${escapeHTML(rule.channel)} · ข้อความตัวอย่าง</small></span></div><h3>${escapeHTML(rule.name)}</h3><p><strong>${escapeHTML(pair)}</strong> · ${escapeHTML(rule.exchange)} ${escapeHTML(rule.market)} · ${escapeHTML(rule.timeframe)}</p><div class="matched">${icon('check')}ราคาอยู่เหนือ EMA ${rule.ema}</div><div class="matched">${icon('check')}RSI (14) ตัดขึ้นเหนือ ${rule.rsi}</div><div class="matched">${icon('check')}วอลุ่มมากกว่า ${rule.volume}× ค่าเฉลี่ย 20 แท่ง</div><div class="message-bottom">${rule.close?'ตรวจยืนยันเมื่อแท่งปิด':'ตรวจระหว่างแท่ง — เงื่อนไขอาจเปลี่ยนก่อนแท่งปิด'}<small>การเข้าเงื่อนไขไม่ใช่การรับประกันผลตอบแทน</small></div></div><button class="primary preview-done" data-close="alert-preview-dialog">ปิด</button>`;
  previewDialog.showModal();
}
guide.addEventListener('submit',e=>{if(e.target.id!=='flow-market-form')return;e.preventDefault();if(readFlowMarket()){flow.step=3;renderSetupFlow();guide.scrollIntoView({block:'start',behavior:'instant'});}});
guide.addEventListener('input',e=>{if(e.target.id==='flow-pairs')e.target.setCustomValidity('');});
guide.addEventListener('change',e=>{if(e.target.id==='flow-channel')flow.draft.channel=e.target.value;});
document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.preset){
    const preset=setupPresets[button.dataset.preset];if(!preset)return;
    const prior=flow.draft;flow.preset=button.dataset.preset;
    flow.draft={...preset.rule,exchange:prior?.exchange??'',market:prior?.market??'',pairs:prior?.pairs??defaults.pairs,timeframe:prior?.timeframe??preset.rule.timeframe,channel:prior?.channel??state.channel};
    flow.step=2;renderSetupFlow();return;
  }
  if(button.dataset.flowBack){
    if(flow.step===2){Object.assign(flow.draft,{exchange:$('#flow-exchange').value,market:$('#flow-market').value,pairs:$('#flow-pairs').value,timeframe:$('#flow-timeframe').value});}
    flow.step=Number(button.dataset.flowBack);renderSetupFlow();return;
  }
  if(button.hasAttribute('data-flow-review')){openRule(flow.draft);state.flowReview=true;return;}
  if(button.hasAttribute('data-flow-watch')){go('watch');return;}
  if(button.dataset.preview){const rule=state.rules.find(r=>r.id===Number(button.dataset.preview));if(rule)showAlertPreview(rule);}
});
