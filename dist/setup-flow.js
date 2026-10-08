'use strict';
// Guided prototype: explicit choices configure a draft. No LLM or market calls.
const setupPresets = {
  pullback: {title:(globalThis.SnaapI18n?.text("ราคาย่อตัวในขาขึ้น") ?? "ราคาย่อตัวในขาขึ้น"),description:(globalThis.SnaapI18n?.text("ราคายืนเหนือ EMA และ RSI ฟื้นตัว") ?? "ราคายืนเหนือ EMA และ RSI ฟื้นตัว"),detail:(globalThis.SnaapI18n?.text("EMA 200 · RSI ตัดขึ้นเหนือ 30 · วอลุ่ม 1.5×") ?? "EMA 200 · RSI ตัดขึ้นเหนือ 30 · วอลุ่ม 1.5×"),rule:{...defaults}},
  momentum: {title:(globalThis.SnaapI18n?.text("โมเมนตัมขาขึ้น") ?? "โมเมนตัมขาขึ้น"),description:(globalThis.SnaapI18n?.text("RSI และวอลุ่มเพิ่มขึ้นในแนวโน้มขาขึ้น") ?? "RSI และวอลุ่มเพิ่มขึ้นในแนวโน้มขาขึ้น"),detail:(globalThis.SnaapI18n?.text("EMA 50 · RSI ตัดขึ้นเหนือ 50 · วอลุ่ม 2×") ?? "EMA 50 · RSI ตัดขึ้นเหนือ 50 · วอลุ่ม 2×"),rule:{...defaults,name:(globalThis.SnaapI18n?.text("โมเมนตัมขาขึ้น") ?? "โมเมนตัมขาขึ้น"),ema:50,rsi:50,volume:2,timeframe:'15m'}}
};
const flow = {step:0,preset:null,draft:null,savedId:null};
const guide = document.createElement('section');
guide.id='setup-guide';guide.className='setup-guide';guide.hidden=true;guide.setAttribute('aria-label',(globalThis.SnaapI18n?.text("ตั้งเงื่อนไขแจ้งเตือน") ?? "ตั้งเงื่อนไขแจ้งเตือน"));
$('#followup-form').before(guide);
const conversationTitle=document.createElement('div');
conversationTitle.className='conversation-heading';
conversationTitle.innerHTML=(globalThis.SnaapI18n?.text("<div><h1>คุยกับ snaap</h1></div><button class=\"text-button\" data-action=\"new\">เริ่มใหม่</button>") ?? "<div><h1>คุยกับ snaap</h1></div><button class=\"text-button\" data-action=\"new\">เริ่มใหม่</button>");
$('#conversation').prepend(conversationTitle);
const previewDialog=document.createElement('dialog');
previewDialog.id='alert-preview-dialog';previewDialog.className='alert-preview-dialog';previewDialog.setAttribute('aria-labelledby','alert-preview-title');
document.body.append(previewDialog);

function resetSetupFlow(){Object.assign(flow,{step:0,preset:null,draft:null,savedId:null});guide.hidden=true;guide.replaceChildren();}
function setupFlowOwns(id){return flow.savedId===id;}
function focusSetupFlow(){const heading=guide.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});guide.scrollIntoView({block:'start',behavior:'instant'});}}
function startSetupFlow(text){
  if(flow.savedId){
    addMessage((globalThis.SnaapI18n?.text("<p>บันทึกแล้ว เลือกแก้ไขรายการหรือเริ่มใหม่</p>") ?? "<p>บันทึกแล้ว เลือกแก้ไขรายการหรือเริ่มใหม่</p>"));
    renderSetupFlow();return;
  }
  if(flow.step){
    addMessage((globalThis.SnaapI18n?.text("<p>ต้นแบบยังไม่รองรับคำสั่ง AI ใช้ตัวเลือกด้านล่างเพื่อตั้งค่า</p>") ?? "<p>ต้นแบบยังไม่รองรับคำสั่ง AI ใช้ตัวเลือกด้านล่างเพื่อตั้งค่า</p>"));
    renderSetupFlow();return;
  }
  flow.step=1;
  addMessage((globalThis.SnaapI18n?.text("<p>เลือกรูปแบบเงื่อนไขด้านล่าง</p>") ?? "<p>เลือกรูปแบบเงื่อนไขด้านล่าง</p>"));
  renderSetupFlow();
}
function flowSteps(){
  return `${(globalThis.SnaapI18n?.text("<ol class=\"flow-steps\" aria-label=\"ขั้นตอนตั้งเงื่อนไข\">") ?? "<ol class=\"flow-steps\" aria-label=\"ขั้นตอนตั้งเงื่อนไข\">")}${[(globalThis.SnaapI18n?.text("รูปแบบเงื่อนไข") ?? "รูปแบบเงื่อนไข"),(globalThis.SnaapI18n?.text("เลือกตลาด") ?? "เลือกตลาด"),(globalThis.SnaapI18n?.text("ตรวจและยืนยัน") ?? "ตรวจและยืนยัน")].map((label,index)=>`<li class="${flow.savedId?'done':flow.step===index+1?'current':flow.step>index+1?'done':''}" ${!flow.savedId&&flow.step===index+1?'aria-current="step"':''}><span>${flow.savedId||flow.step>index+1?icon('check'):index+1}</span>${label}</li>`).join('')}</ol>`;
}
function marketFields(){
  const d=flow.draft;
  return `${(globalThis.SnaapI18n?.text("<form id=\"flow-market-form\"><h2>เลือกตลาด</h2><p class=\"flow-description\">เลือกแหล่งราคาให้ตรงกับที่คุณเทรด</p><div class=\"field-grid\"><div><label class=\"field-label\" for=\"flow-exchange\">กระดานเทรด</label><select id=\"flow-exchange\" required><option value=\"\">เลือกกระดาน</option>") ?? "<form id=\"flow-market-form\"><h2>เลือกตลาด</h2><p class=\"flow-description\">เลือกแหล่งราคาให้ตรงกับที่คุณเทรด</p><div class=\"field-grid\"><div><label class=\"field-label\" for=\"flow-exchange\">กระดานเทรด</label><select id=\"flow-exchange\" required><option value=\"\">เลือกกระดาน</option>")}${['Binance','MEXC','Bybit','OKX','Bitget'].map(x=>`<option ${d.exchange===x?'selected':''}>${x}</option>`).join('')}${(globalThis.SnaapI18n?.text("</select></div><div><label class=\"field-label\" for=\"flow-market\">ประเภทตลาด</label><select id=\"flow-market\" required><option value=\"\">เลือกตลาด</option><option value=\"Spot\" ") ?? "</select></div><div><label class=\"field-label\" for=\"flow-market\">ประเภทตลาด</label><select id=\"flow-market\" required><option value=\"\">เลือกตลาด</option><option value=\"Spot\" ")}${d.market==='Spot'?'selected':''}${(globalThis.SnaapI18n?.text(">Spot — ซื้อขายสินทรัพย์</option><option value=\"Perpetual Futures\" ") ?? ">Spot — ซื้อขายสินทรัพย์</option><option value=\"Perpetual Futures\" ")}${d.market==='Perpetual Futures'?'selected':''}${(globalThis.SnaapI18n?.text(">Perpetual Futures</option></select></div></div><label class=\"field-label\" for=\"flow-pairs\">คู่เทรดที่สนใจ</label><input id=\"flow-pairs\" required maxlength=\"200\" value=\"") ?? ">Perpetual Futures</option></select></div></div><label class=\"field-label\" for=\"flow-pairs\">คู่เทรดที่สนใจ</label><input id=\"flow-pairs\" required maxlength=\"200\" value=\"")}${escapeHTML(d.pairs)}${(globalThis.SnaapI18n?.text("\" placeholder=\"เช่น BTC/USDT, ETH/USDT\"><p class=\"field-note\">คั่นแต่ละคู่ด้วยจุลภาค · ตัวเลือกกระดานเป็นตัวอย่าง ยังไม่ตรวจว่ามีคู่นี้จริง</p><label class=\"field-label\" for=\"flow-timeframe\">กรอบเวลา</label><select id=\"flow-timeframe\">") ?? "\" placeholder=\"เช่น BTC/USDT, ETH/USDT\"><p class=\"field-note\">คั่นแต่ละคู่ด้วยจุลภาค · ตัวเลือกกระดานเป็นตัวอย่าง ยังไม่ตรวจว่ามีคู่นี้จริง</p><label class=\"field-label\" for=\"flow-timeframe\">กรอบเวลา</label><select id=\"flow-timeframe\">")}${[['5m',(globalThis.SnaapI18n?.text("5 นาที") ?? "5 นาที")],['15m',(globalThis.SnaapI18n?.text("15 นาที") ?? "15 นาที")],['1h',(globalThis.SnaapI18n?.text("1 ชั่วโมง") ?? "1 ชั่วโมง")],['4h',(globalThis.SnaapI18n?.text("4 ชั่วโมง") ?? "4 ชั่วโมง")],['1d',(globalThis.SnaapI18n?.text("1 วัน") ?? "1 วัน")]].map(([value,label])=>`<option value="${value}" ${d.timeframe===value?'selected':''}>${label}</option>`).join('')}</select><div class="flow-context">${icon('link')}${(globalThis.SnaapI18n?.text("ราคาและอินดิเคเตอร์จะอิงกระดานกับตลาดที่คุณเลือก</div><div class=\"flow-actions\"><button type=\"button\" class=\"text-button\" data-flow-back=\"1\">ย้อนกลับ</button><button class=\"primary\" type=\"submit\">ตรวจเงื่อนไข</button></div></form>") ?? "ราคาและอินดิเคเตอร์จะอิงกระดานกับตลาดที่คุณเลือก</div><div class=\"flow-actions\"><button type=\"button\" class=\"text-button\" data-flow-back=\"1\">ย้อนกลับ</button><button class=\"primary\" type=\"submit\">ตรวจเงื่อนไข</button></div></form>")}`;
}
function reviewCard(){
  const d=flow.draft;const saved=!!flow.savedId;
  return `<div class="flow-review"><span class="review-kicker">${saved?(globalThis.SnaapI18n?.text("บันทึกรายการทดลองแล้ว") ?? "บันทึกรายการทดลองแล้ว"):(globalThis.SnaapI18n?.text("ร่างรายการ") ?? "ร่างรายการ")}</span><h2>${escapeHTML(d.name)}</h2><p class="review-source">${escapeHTML(d.exchange)} · ${escapeHTML(d.market)} · ${escapeHTML(d.timeframe)}</p><div class="pair-list">${d.pairs.split(',').map(p=>`<span>${escapeHTML(p.trim())}</span>`).join('')}${(globalThis.SnaapI18n?.text("</div><div class=\"rule-lines\"><p><span>01</span>ราคาอยู่เหนือ EMA <strong>") ?? "</div><div class=\"rule-lines\"><p><span>01</span>ราคาอยู่เหนือ EMA <strong>")}${d.ema}${(globalThis.SnaapI18n?.text("</strong></p><p><span>02</span>RSI (14) ตัดขึ้นเหนือ <strong>") ?? "</strong></p><p><span>02</span>RSI (14) ตัดขึ้นเหนือ <strong>")}${d.rsi}${(globalThis.SnaapI18n?.text("</strong></p><p><span>03</span>วอลุ่มมากกว่า <strong>") ?? "</strong></p><p><span>03</span>วอลุ่มมากกว่า <strong>")}${d.volume}${(globalThis.SnaapI18n?.text(" เท่า</strong> ของค่าเฉลี่ย 20 แท่ง</p></div><p class=\"flow-description\">ต้องเข้าเงื่อนไขครบทุกข้อ · ") ?? " เท่า</strong> ของค่าเฉลี่ย 20 แท่ง</p></div><p class=\"flow-description\">ต้องเข้าเงื่อนไขครบทุกข้อ · ")}${d.close?(globalThis.SnaapI18n?.text("ยืนยันเมื่อแท่งปิด") ?? "ยืนยันเมื่อแท่งปิด"):(globalThis.SnaapI18n?.text("ตรวจระหว่างแท่ง") ?? "ตรวจระหว่างแท่ง")}</p>${saved?`${(globalThis.SnaapI18n?.text("<div class=\"review-destination\">ปลายทาง <strong>") ?? "<div class=\"review-destination\">ปลายทาง <strong>")}${escapeHTML(d.channel)}${(globalThis.SnaapI18n?.text("</strong> · ยังไม่ส่งจริง</div><div class=\"flow-actions\"><button class=\"secondary\" data-preview=\"") ?? "</strong> · ยังไม่ส่งจริง</div><div class=\"flow-actions\"><button class=\"secondary\" data-preview=\"")}${flow.savedId}${(globalThis.SnaapI18n?.text("\">ดูข้อความแจ้งเตือน</button><button class=\"primary\" data-flow-watch>ดูรายการแจ้งเตือน</button></div>") ?? "\">ดูข้อความแจ้งเตือน</button><button class=\"primary\" data-flow-watch>ดูรายการแจ้งเตือน</button></div>")}`:`${(globalThis.SnaapI18n?.text("<label class=\"field-label\" for=\"flow-channel\">ช่องทางแจ้งเตือน</label><select id=\"flow-channel\">") ?? "<label class=\"field-label\" for=\"flow-channel\">ช่องทางแจ้งเตือน</label><select id=\"flow-channel\">")}${['Telegram','LINE','Webhook'].map(c=>`<option ${c===d.channel?'selected':''}>${c}</option>`).join('')}${(globalThis.SnaapI18n?.text("</select><div class=\"flow-actions\"><button class=\"text-button\" data-flow-back=\"2\">แก้ตลาด / คู่เทรด</button><button class=\"primary\" data-flow-review>ตรวจและแก้กฎ</button></div>") ?? "</select><div class=\"flow-actions\"><button class=\"text-button\" data-flow-back=\"2\">แก้ตลาด / คู่เทรด</button><button class=\"primary\" data-flow-review>ตรวจและแก้กฎ</button></div>")}`}</div>`;
}
function renderSetupFlow(){
  guide.hidden=false;
  let content='';
  if(flow.step===1){
    content=`${(globalThis.SnaapI18n?.text("<h2>เลือกรูปแบบเงื่อนไข</h2><p class=\"flow-description\">แก้ไขค่าอินดิเคเตอร์ได้ในขั้นตอนถัดไป</p><div class=\"preset-list\">") ?? "<h2>เลือกรูปแบบเงื่อนไข</h2><p class=\"flow-description\">แก้ไขค่าอินดิเคเตอร์ได้ในขั้นตอนถัดไป</p><div class=\"preset-list\">")}${Object.entries(setupPresets).map(([key,p])=>`<button class="preset-choice ${flow.preset===key?'selected':''}" data-preset="${key}"><span class="setup-icon">${icon(key==='pullback'?'leaf':'sliders')}</span><span><strong>${p.title}</strong><span>${p.description}</span><small>${p.detail}</small></span>${icon('chevron')}</button>`).join('')}</div><button class="text-button flow-own-rule" data-action="advanced">${icon('sliders')}${(globalThis.SnaapI18n?.text("กำหนดค่าเอง</button>") ?? "กำหนดค่าเอง</button>")}`;
  }else if(flow.step===2){content=marketFields();}else{content=reviewCard();}
  guide.innerHTML=`${flowSteps()}<div class="flow-content">${content}${(globalThis.SnaapI18n?.text("</div><p class=\"flow-prototype-note\">ต้นแบบ · ยังไม่เชื่อม AI หรือข้อมูลตลาด</p>") ?? "</div><p class=\"flow-prototype-note\">ต้นแบบ · ยังไม่เชื่อม AI หรือข้อมูลตลาด</p>")}`;
  $('#page-detail').textContent=flow.savedId?(globalThis.SnaapI18n?.text("บันทึกแล้ว") ?? "บันทึกแล้ว"):`${(globalThis.SnaapI18n?.text("ขั้นตอน ") ?? "ขั้นตอน ")}${flow.step}${(globalThis.SnaapI18n?.text(" จาก 3") ?? " จาก 3")}`;
}
function readFlowMarket(){
  const form=$('#flow-market-form');if(!form)return true;
  const pairs=$('#flow-pairs');pairs.setCustomValidity('');
  if(!form.reportValidity())return false;
  const list=pairs.value.toUpperCase().split(',').map(p=>p.trim());
  if(list.some(p=>!/^([A-Z0-9]{2,20})\/([A-Z0-9]{2,12})$/.test(p))){pairs.setCustomValidity((globalThis.SnaapI18n?.text("ใช้รูปแบบ BTC/USDT, ETH/USDT") ?? "ใช้รูปแบบ BTC/USDT, ETH/USDT"));pairs.reportValidity();return false;}
  Object.assign(flow.draft,{exchange:$('#flow-exchange').value,market:$('#flow-market').value,pairs:[...new Set(list)].join(', '),timeframe:$('#flow-timeframe').value});
  return true;
}
function completeSetupFlow(rule){
  flow.savedId=rule.id;flow.draft={...rule};flow.step=3;renderSetupFlow();
  addMessage(`${(globalThis.SnaapI18n?.text("<p>บันทึก “") ?? "<p>บันทึก “")}${escapeHTML(rule.name)}${(globalThis.SnaapI18n?.text("” แล้ว · ") ?? "” แล้ว · ")}${escapeHTML(rule.exchange)} ${escapeHTML(rule.market)} · ${escapeHTML(rule.channel)}</p>`);
}
function showAlertPreview(rule){
  const pair=rule.pairs.split(',')[0].trim();
  previewDialog.innerHTML=`${(globalThis.SnaapI18n?.text("<div class=\"dialog-heading\"><div><h2 id=\"alert-preview-title\">ตัวอย่างแจ้งเตือน</h2></div><button class=\"icon-button\" data-close=\"alert-preview-dialog\" aria-label=\"ปิดตัวอย่างแจ้งเตือน\">") ?? "<div class=\"dialog-heading\"><div><h2 id=\"alert-preview-title\">ตัวอย่างแจ้งเตือน</h2></div><button class=\"icon-button\" data-close=\"alert-preview-dialog\" aria-label=\"ปิดตัวอย่างแจ้งเตือน\">")}${icon('close')}${(globalThis.SnaapI18n?.text("</button></div><p class=\"field-note\">ข้อมูลสมมติ ไม่ใช่สัญญาณตลาด</p><div class=\"message-phone\"><div class=\"phone-heading\"><span class=\"mini-brand\"><img class=\"brand-badge-symbol\" src=\"/assets/snaap-favicon.svg?v=2\" alt=\"\" aria-hidden=\"true\"></span><span>snaap<small>") ?? "</button></div><p class=\"field-note\">ข้อมูลสมมติ ไม่ใช่สัญญาณตลาด</p><div class=\"message-phone\"><div class=\"phone-heading\"><span class=\"mini-brand\"><img class=\"brand-badge-symbol\" src=\"/assets/snaap-favicon.svg?v=2\" alt=\"\" aria-hidden=\"true\"></span><span>snaap<small>")}${escapeHTML(rule.channel)}${(globalThis.SnaapI18n?.text(" · ข้อความตัวอย่าง</small></span></div><h3>") ?? " · ข้อความตัวอย่าง</small></span></div><h3>")}${escapeHTML(rule.name)}</h3><p><strong>${escapeHTML(pair)}</strong> · ${escapeHTML(rule.exchange)} ${escapeHTML(rule.market)} · ${escapeHTML(rule.timeframe)}</p><div class="matched">${icon('check')}${(globalThis.SnaapI18n?.text("ราคาอยู่เหนือ EMA ") ?? "ราคาอยู่เหนือ EMA ")}${rule.ema}</div><div class="matched">${icon('check')}${(globalThis.SnaapI18n?.text("RSI (14) ตัดขึ้นเหนือ ") ?? "RSI (14) ตัดขึ้นเหนือ ")}${rule.rsi}</div><div class="matched">${icon('check')}${(globalThis.SnaapI18n?.text("วอลุ่มมากกว่า ") ?? "วอลุ่มมากกว่า ")}${rule.volume}${(globalThis.SnaapI18n?.text("× ค่าเฉลี่ย 20 แท่ง</div><div class=\"message-bottom\">") ?? "× ค่าเฉลี่ย 20 แท่ง</div><div class=\"message-bottom\">")}${rule.close?(globalThis.SnaapI18n?.text("ตรวจยืนยันเมื่อแท่งปิด") ?? "ตรวจยืนยันเมื่อแท่งปิด"):(globalThis.SnaapI18n?.text("ตรวจระหว่างแท่ง — เงื่อนไขอาจเปลี่ยนก่อนแท่งปิด") ?? "ตรวจระหว่างแท่ง — เงื่อนไขอาจเปลี่ยนก่อนแท่งปิด")}${(globalThis.SnaapI18n?.text("<small>การเข้าเงื่อนไขไม่ใช่การรับประกันผลตอบแทน</small></div></div><button class=\"primary preview-done\" data-close=\"alert-preview-dialog\">ปิด</button>") ?? "<small>การเข้าเงื่อนไขไม่ใช่การรับประกันผลตอบแทน</small></div></div><button class=\"primary preview-done\" data-close=\"alert-preview-dialog\">ปิด</button>")}`;
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
