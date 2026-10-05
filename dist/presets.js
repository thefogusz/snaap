import {setupCardMarkup,setupCardError} from './setup-card.js';
import {presets,buildPreset,describePreset} from './preset-catalog.js';
export function initPresets(ctx){
 const {state,api,esc,toast,chatComposer,showDesigner,setWorkbenchTab,ensureConversation,saveDraft,renderDesigner,refresh,fullSummary,message,scrollChatToLatest,persistRecovery,chatEmpty}=ctx;
 const footer=document.createElement('div');footer.className='preset-composer-footer';
 footer.innerHTML='<button type="button" class="preset-launch"><span aria-hidden="true">✦</span> Preset</button>';
 chatComposer.after(footer);
 let working=false;
 const cards=new Map();
 const canonical=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
 function chart(type){
  const dot=(x,y)=>`<circle class="preset-halo" cx="${x}" cy="${y}" r="9"/><circle class="preset-dot" cx="${x}" cy="${y}" r="3"/>`;
  const drawings={
   'break-retest':`<path class="preset-threshold" d="M14 43 H246"/><path class="preset-main-line" d="M14 64 L45 58 L73 62 L104 30 L132 21 L159 43 L182 31 L212 23 L246 12"/>${dot(159,43)}`,
   trend:`<path class="preset-secondary-line" d="M14 68 Q110 67 246 45"/><path class="preset-accent-line" d="M14 66 Q95 60 130 47 T246 26"/><path class="preset-main-line" d="M14 59 L40 64 L65 47 L90 54 L118 36 L143 43 L169 25 L194 30 L220 14 L246 18"/>${dot(169,25)}`,
   cross:`<path class="preset-secondary-line" d="M14 23 C96 23 118 44 246 54"/><path class="preset-main-line" d="M14 63 C110 69 121 34 246 13"/>${dot(142,40)}`,
   momentum:`<path class="preset-threshold" d="M14 43 H246"/><path class="preset-main-line" d="M14 64 L37 52 L57 61 L79 45 L103 53 L127 31 L150 38 L173 17 L197 28 L221 12 L246 22"/>${dot(127,31)}`,
   rebound:`<path class="preset-threshold" d="M14 54 H246"/><path class="preset-main-line" d="M14 17 C42 19 48 49 82 62 S127 67 146 48 S189 22 246 27"/>${dot(146,48)}`,
   bands:`<path class="preset-band-fill" d="M14 28 Q117 16 246 26 L246 64 Q117 72 14 62 Z"/><path class="preset-secondary-line" d="M14 28 Q117 16 246 26 M14 62 Q117 72 246 64"/><path class="preset-threshold" d="M14 45 H246"/><path class="preset-main-line" d="M14 49 L43 39 L70 53 L98 39 L125 44 L152 32 L180 36 L209 14 L246 9"/>${dot(209,14)}`,
   supertrend:`<path class="preset-accent-line" d="M14 69 H70 V54 H128 V40 H189 V25 H246"/><path class="preset-main-line" d="M14 53 L43 38 L70 45 L98 25 L128 34 L158 15 L189 20 L217 9 L246 13"/>${dot(189,20)}`,
  };
  return `<svg viewBox="0 0 260 82" aria-hidden="true"><path class="preset-grid" d="M14 22H246 M14 45H246 M14 68H246"/>${drawings[type]}</svg>`;
 }
 function openPicker(){
  if(state.busy||working){toast('รอขั้นตอนปัจจุบันเสร็จก่อน');return;}
  const dialog=document.createElement('dialog');dialog.className='preset-picker';dialog.setAttribute('aria-label','เลือกพรีเซ็ต Snaap');
  const captions={'break-retest':'มีระดับราคา · รอทะลุและกลับทดสอบ',trend:'มือใหม่ · เช็กกราฟเป็นช่วง ๆ',cross:'ถือเป็นรอบ · ไม่เฝ้าทั้งวัน',momentum:'เล่นสั้น · มีเวลาเฝ้าตลาด',rebound:'รอเด้งหรือย่อ · มีประสบการณ์',bands:'ตามจังหวะทะลุกรอบ · มีประสบการณ์',supertrend:'ตามทิศทาง · อยากตั้งค่าง่าย'};
  dialog.innerHTML=`<header><div><small>SNAAP PRESETS</small><h2>เลือกจังหวะที่เป็นคุณ</h2><p>เริ่มจากสไตล์ แล้วตั้งค่าต่อในแชท</p></div><button type="button" class="icon-button" aria-label="ปิดพรีเซ็ต">×</button></header><nav class="preset-filters" aria-label="กรองสไตล์พรีเซ็ต">${['ทั้งหมด','เริ่มต้น','เล่นสั้น','ถือเป็นรอบ'].map((v,i)=>`<button type="button" data-preset-filter="${v}" aria-pressed="${i===0}">${v}</button>`).join('')}</nav><div class="preset-grid-cards">${presets.map(p=>`<article class="preset-tile" data-preset-tile="${p.id}"><button type="button" class="preset-option" data-preset="${p.id}"><span class="preset-tag">${esc(p.horizon)}</span><div class="preset-art">${chart(p.chart)}</div><strong>${esc(p.title)}</strong><span class="preset-caption">${esc(captions[p.id])}</span><span class="preset-card-bottom"><span>${p.frame} <span class="preset-time-label">/ แท่ง</span></span><span class="preset-card-arrow" aria-hidden="true">→</span></span></button><button type="button" class="preset-info" data-preset-info="${p.id}" aria-label="รายละเอียด ${esc(p.title)}">i</button></article>`).join('')}</div><footer class="preset-picker-footer"><span>เลือกตลาดและ Long / Short ต่อในแชท</span><button type="button" data-leverage-info>คำแนะนำ leverage <span aria-hidden="true">ⓘ</span></button></footer>`;
  document.body.append(dialog);dialog.showModal();
  dialog.querySelector('[aria-label="ปิดพรีเซ็ต"]').onclick=()=>dialog.close();
  dialog.onclose=()=>{dialog.remove();footer.querySelector('button').focus();};
  dialog.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{dialog.close();start(b.dataset.preset);});
  function info(p,trigger){
   const detail=document.createElement('dialog');detail.className='preset-detail-dialog';detail.setAttribute('aria-label',p?'รายละเอียด '+p.title:'การใช้ leverage');
   detail.innerHTML=`<header><span class="preset-tag">${p?esc(p.horizon):'FUTURES'}</span><button class="icon-button" type="button" aria-label="ปิดรายละเอียด">×</button></header>${p?`<div class="preset-detail-art">${chart(p.chart)}</div><h2>${esc(p.title)}</h2><p class="preset-detail-audience">เหมาะกับ${esc(p.audience)}</p><dl><div><dt>จังหวะการใช้งาน</dt><dd>${esc(p.pace)}</dd></div><div><dt>วิธีจับสัญญาณ</dt><dd>${esc(p.description)}</dd></div><div><dt>ควรรู้ก่อนเริ่ม</dt><dd>${esc(p.caution)}</dd></div></dl><small>รอบเริ่มต้น ${p.frame} · เปลี่ยนได้ · ยังไม่มีผลทดสอบกำไรของคู่เทรดคุณ</small><button type="button" class="primary" data-use>ใช้พรีเซ็ตนี้ <span aria-hidden="true">→</span></button>`:`<h2>ก่อนใช้ leverage</h2><p>พรีเซ็ตส่งสัญญาณจากแท่งปิด ไม่รู้ราคา liquidation ของคุณ และไม่ได้วาง Stop loss ที่กระดาน</p><p>แม้ใช้รอบสั้น ก็อาจถูกบังคับปิดสถานะก่อนแจ้งเตือน ควรกำหนด leverage และ Stop loss ที่กระดานเอง</p>`}`;
   document.body.append(detail);detail.showModal();detail.querySelector('[aria-label="ปิดรายละเอียด"]').onclick=()=>detail.close();
   detail.onclose=()=>{detail.remove();if(trigger.isConnected)trigger.focus();};
   detail.querySelector('[data-use]')?.addEventListener('click',()=>{detail.close();dialog.close();start(p.id);});
  }
  dialog.querySelectorAll('[data-preset-info]').forEach(b=>b.onclick=()=>info(presets.find(p=>p.id===b.dataset.presetInfo),b));
  dialog.querySelector('[data-leverage-info]').onclick=e=>info(null,e.currentTarget);
  dialog.querySelectorAll('[data-preset-filter]').forEach(b=>b.onclick=()=>{
   const value=b.dataset.presetFilter;
   dialog.querySelectorAll('[data-preset-filter]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));
   dialog.querySelectorAll('[data-preset-tile]').forEach(n=>{const p=presets.find(p=>p.id===n.dataset.presetTile);n.hidden=value!=='ทั้งหมด'&&(value==='เริ่มต้น'?!['มือใหม่','เริ่มต้นได้'].includes(p.level):p.horizon!==value);});
  });
 }
 footer.querySelector('button').onclick=openPicker;
 function start(id){
  showDesigner();setWorkbenchTab('chat');
  document.querySelector('#messages .chat-empty')?.remove();
  document.querySelectorAll('.preset-wizard').forEach(n=>n.remove());
  const p=presets.find(p=>p.id===id),origin={conversation:state.conversation,workspace:state.workspaceId};
  const node=document.createElement('section');node.className='preset-chat-card preset-wizard';
  document.querySelector('#messages').append(node);
  const config={exchange:state.draft?.exchange?.[0]??'Binance',market:'Spot',side:'SPOT',pairs:[],timeframe:p.frame};
  let step=1,items=[],loading=false,request=0,visiblePairs=100,catalogAt=0;
  const maxPairs=10;
  const current=()=>state.conversation===origin.conversation&&state.workspaceId===origin.workspace&&node.isConnected;
  const stale=()=>{if(!current()){toast('บทสนทนาเปลี่ยนแล้ว กรุณาเลือกพรีเซ็ตอีกครั้ง');return true;}return false;};
  const option=(v,label=v)=>`<option value="${esc(v)}">${esc(label)}</option>`;
  function paint(){
   if(!current())return;
   node.innerHTML=`<header><span class="preset-tag">PRESET · ${step}/3</span><button class="text-button" data-cancel type="button">ยกเลิก</button></header><h3>${esc(p.title)}</h3>${step===1?`<p class="preset-profile-intro">เหมาะกับ${esc(p.audience)}</p><div class="preset-fields"><label>ราคาจากกระดาน<select data-field="exchange">${['Binance','Bybit','OKX','Bitget','MEXC'].map(v=>option(v)).join('')}</select></label><label>ตลาดที่เล่น<select data-field="market">${option('Spot','Spot · ซื้อ')}${option('Perpetual Futures','Futures · Long / Short')}</select></label></div>${config.market==='Spot'?'<p class="preset-inline-note">Spot · ซื้อเมื่อเข้าเงื่อนไข แล้วรอสัญญาณออกจากรอบ</p>':`<fieldset class="preset-side"><legend>ฝั่งสัญญาณ</legend>${(id==='break-retest'?['LONG','SHORT']:['LONG','SHORT','BOTH']).map(v=>`<label><input type="radio" name="preset-side" value="${v}" ${config.side===v?'checked':''}>${v==='BOTH'?'ทั้งสองฝั่ง':v==='LONG'?'Long · มองขึ้น':'Short · มองลง'}</label>`).join('')}</fieldset><p class="preset-inline-note">Futures · leverage และ Stop loss ตั้งที่กระดาน สัญญาณไม่ป้องกัน liquidation</p>`}<details class="preset-method"><summary>พรีเซ็ตนี้จับจังหวะอย่างไร?</summary><p>${esc(p.description)}</p></details>`:step===2?`<p>${esc(config.exchange)} · ${config.market==='Spot'?'Spot':config.side==='BOTH'?'Futures · Long + Short':'Futures · '+esc(config.side)} — เลือกคู่ที่มีบนตลาดนี้</p><label>ค้นหาคู่เทรด<input type="search" data-search placeholder="เช่น BTC, ETH หรือ USDT" autocomplete="off"></label><div class="preset-pair-summary"><span data-pair-count role="status"></span><button type="button" class="text-button" data-clear-pairs>ล้างที่เลือก</button></div><div class="preset-selected-pairs" aria-label="คู่เทรดที่เลือก"></div><div class="preset-pairs" role="group" aria-label="คู่เทรด">${loading?'<p role="status">กำลังโหลดคู่เทรด…</p>':''}</div><div class="preset-catalog-footer"><small data-catalog-count></small><button type="button" class="text-button" data-more-pairs hidden>แสดงเพิ่มเติม</button></div>${id==='break-retest'?`<label>ระดับราคาที่รอทะลุ<input type="number" min="0.00000001" step="any" data-level value="${esc(config.level??'')}" required></label>`:''}<label>รอบตรวจแท่งปิด<select data-field="timeframe">${['5m','15m','1h','4h','1d'].map(v=>option(v)).join('')}</select></label>`:`<p class="preset-market-line">${esc(config.exchange)} · ${esc(config.pairs.join(', '))} · ${config.market==='Spot'?'Spot':config.side==='BOTH'?'Futures · Long + Short':'Futures · '+esc(config.side)} · ${config.timeframe}</p><div class="preset-review-text">${esc(describePreset(buildPreset(id,config)))}</div><p class="preset-inline-note">${esc(p.note)}</p>${config.market!=="Spot"?`<p class="preset-inline-note">รอแท่งปิด ${config.timeframe} · ${esc(p.leverageNote)}</p>`:""}<p class="preset-inline-note">ใช้แม่แบบนี้จะเปลี่ยนร่างในบทสนทนาปัจจุบัน</p>`}<p class="preset-error" role="alert" hidden></p><footer>${step>1?'<button type="button" class="secondary" data-back>ย้อนกลับ</button>':'<button type="button" class="text-button" data-other>เลือกสไตล์อื่น</button>'}<button type="button" class="primary" data-next ${loading||(step===2&&!config.pairs.length)?'disabled':''}>${step===3?'ใช้พรีเซ็ตนี้':'ถัดไป'}</button></footer>`;
   node.querySelector('[data-level]')?.addEventListener('input',e=>{config.level=Number(e.target.value);});
   const cancel=()=>{node.remove();chatEmpty();};
   node.querySelector('[data-cancel]').onclick=cancel;
   node.querySelector('[data-other]')?.addEventListener('click',()=>{cancel();openPicker();});
   node.querySelector('[data-back]')?.addEventListener('click',()=>{step--;paint();});
   node.querySelectorAll('[data-field]').forEach(s=>{s.value=config[s.dataset.field];s.onchange=()=>{config[s.dataset.field]=s.value;if(s.dataset.field==='market'){config.side=s.value==='Spot'?'SPOT':'LONG';config.pairs=[];paint();}if(s.dataset.field==='exchange')config.pairs=[];};});
   node.querySelectorAll('[name="preset-side"]').forEach(r=>r.onchange=()=>config.side=r.value);
   if(step===2){node.querySelector('[data-search]').oninput=e=>{visiblePairs=100;paintPairs(e.target.value);};node.querySelector('[data-clear-pairs]').onclick=()=>{config.pairs=[];syncSelection();};node.querySelector('[data-more-pairs]').onclick=()=>{visiblePairs+=100;paintPairs(node.querySelector('[data-search]').value);};paintPairs('');syncSelection();}
   node.querySelector('[data-next]').onclick=async()=>{
    if(stale()||working)return;
    if(step===1){step=2;config.pairs=[];loading=true;paint();const rev=++request;try{const catalog=await api('/instruments?'+new URLSearchParams({exchange:config.exchange,market:config.market,refresh:'true'}));if(stale()||rev!==request||step!==2)return;items=catalog.items.filter(p=>p.supported).map(p=>p.symbol);catalogAt=catalog.at;loading=false;paint();}catch(e){if(!current())return;loading=false;paint();error(e.message);node.querySelector('[data-next]').textContent='ลองโหลดอีกครั้ง';node.querySelector('[data-next]').disabled=false;node.querySelector('[data-next]').onclick=()=>{step=1;paint();};}return;}
    if(step===2){if(id==='break-retest'&&(!Number.isFinite(config.level)||config.level<=0)){error('ระบุระดับราคามากกว่า 0');return;}step=3;paint();return;}
    working=true;const b=node.querySelector('[data-next]');b.disabled=true;
    try{
     if(state.busy)throw new Error('รอ Snaap ตอบให้เสร็จก่อน');state.busy=true;document.querySelector('.setup-pane').inert=true;
     if(state.conversation)await saveDraft();
     if(stale())return;
     const conversation=await ensureConversation(p.title);origin.conversation=conversation;
     const result=await api(`/conversations/${conversation}/preset`,'POST',{presetId:id,...config,expectedRevision:state.draftRevision});
     if(stale())return;
     state.draft=result.spec;state.saved=null;state.undo=[];state.draftRevision=result.draft_revision;state.persistedDraft=JSON.stringify(result.spec);persistRecovery();renderDesigner();
     const row=state.conversationRows.find(r=>r.id===conversation);if(row)Object.assign(row,{draft:result.spec,draft_revision:result.draft_revision});
     node.remove();renderCard(result.message);scrollChatToLatest();
    }catch(e){error(e.message);}finally{working=false;state.busy=false;document.querySelector('.setup-pane').inert=false;if(b.isConnected)b.disabled=false;}
   };
   scrollChatToLatest();
  }
  function error(text){const el=node.querySelector('.preset-error');if(el){el.hidden=false;el.textContent=text;}}
  function syncSelection(){
   const count=node.querySelector('[data-pair-count]');if(!count)return;
   count.textContent=`เลือกแล้ว ${config.pairs.length}/${maxPairs} คู่`;
   node.querySelector('[data-clear-pairs]').disabled=!config.pairs.length;
   node.querySelector('[data-next]').disabled=loading||!config.pairs.length;
   node.querySelectorAll('[data-pair]').forEach(b=>b.setAttribute('aria-pressed',String(config.pairs.includes(b.dataset.pair))));
   const selected=node.querySelector('.preset-selected-pairs');
   selected.innerHTML=config.pairs.map(pair=>`<button type="button" class="preset-selected-pair" data-remove-pair="${esc(pair)}" aria-label="นำ ${esc(pair)} ออก">${esc(pair)} <span aria-hidden="true">×</span></button>`).join('');
   selected.querySelectorAll('[data-remove-pair]').forEach(b=>b.onclick=()=>{config.pairs=config.pairs.filter(pair=>pair!==b.dataset.removePair);syncSelection();});
  }
  function paintPairs(q){
   const box=node.querySelector('.preset-pairs');if(!box||loading)return;
   const filtered=items.filter(s=>s.toLowerCase().includes(q.trim().toLowerCase()));
   filtered.sort((a,b)=>Number(['BTC/USDT','ETH/USDT','SOL/USDT'].includes(b))-Number(['BTC/USDT','ETH/USDT','SOL/USDT'].includes(a)));
   box.innerHTML=filtered.slice(0,visiblePairs).map(s=>`<button type="button" class="preset-pair" aria-pressed="${config.pairs.includes(s)}" data-pair="${esc(s)}">${esc(s)}</button>`).join('')||'<p>ไม่พบคู่เทรด ลองค้นหาใหม่</p>';
   node.querySelector('[data-catalog-count]').textContent=`แสดง ${Math.min(visiblePairs,filtered.length)} จาก ${filtered.length} คู่${catalogAt?' · อัปเดต '+new Date(catalogAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):''}`;
   node.querySelector('[data-more-pairs]').hidden=visiblePairs>=filtered.length;
   box.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const pair=b.dataset.pair;
    if(config.pairs.includes(pair))config.pairs=config.pairs.filter(p=>p!==pair);
    else {if(config.pairs.length>=maxPairs){toast(`เลือกได้สูงสุด ${maxPairs} คู่`);return;}config.pairs.push(pair);}
    syncSelection();
   });
  }
  paint();
 }
 function renderCard(m){
  if(!['preset','setup'].includes(m.ui_card?.type))return;
  if(cards.get(m.id)?.node.isConnected){cards.get(m.id).m.ui_card=m.ui_card;cards.get(m.id).paint();return;}
  document.querySelector('#messages .chat-empty')?.remove();
  const conversation=state.conversation,workspace=state.workspaceId;
  const node=document.createElement('section');node.className='preset-chat-card preset-saved-card';node.dataset.presetMessage=m.id;document.querySelector('#messages').append(node);
  for(const [id,r] of cards)if(r.conversation!==conversation||r.workspace!==workspace)cards.delete(id);
  const record={m,node,conversation,workspace,paint:()=>{}};cards.set(m.id,record);
  let busy=false,chosenChannels=null;
  const current=()=>state.conversation===conversation&&state.workspaceId===workspace&&node.isConnected;
  function paint(){
   const latest=[...cards.values()].filter(r=>r.node.isConnected).sort((a,b)=>new Date(b.m.created_at)-new Date(a.m.created_at)||b.m.id.localeCompare(a.m.id))[0];
   if(latest!==record){node.innerHTML='<details><summary>เซตอัปก่อนหน้า</summary><div class="preset-review-text">'+esc(fullSummary(m.ui_card.spec))+'</div></details>';return;}
   const rule=state.rules.find(r=>r.id===m.ui_card.ruleId);
   if(rule)state.saved=rule;
   const p=presets.find(p=>p.id===m.ui_card.presetId);
   const channelsOpen=node.querySelector('.setup-card-channels')?.open??false;
   const spec=state.draft??rule?.spec??m.ui_card.spec;
   const selected=chosenChannels??spec.destinations??[];
   const dirty=!!rule&&(canonical(spec)!==canonical(rule.spec)||canonical([...selected].sort())!==canonical([...rule.spec.destinations].sort()));
   const status=dirty?(rule.active?'ร่างใหม่ยังไม่บันทึก · รุ่นเดิมยังแจ้งเตือน':'มีการปรับค่า · ยังไม่บันทึก'):rule?.active?'กำลังแจ้งเตือน':rule?'บันทึกแล้ว · ยังไม่เปิด':'ร่าง · ยังไม่บันทึก';
   const channels=`<details class="setup-card-channels"><summary><span>การแจ้งเตือน</span><span class="setup-card-channel-preview">ในเว็บ${selected.length?' + '+selected.length+' ช่องทาง':''}</span></summary><fieldset class="preset-destinations"><legend class="sr-only">เลือกช่องทางแจ้งเตือน</legend><span class="preset-inline-note">รับสัญญาณในเว็บเสมอ</span>${state.destinations.filter(d=>d.verified).map(d=>`<label><input type="checkbox" data-channel="${esc(d.id)}" ${selected.includes(d.id)?'checked':''}>${esc(d.name)}</label>`).join('')}<button class="text-button" type="button" data-channels>เพิ่มช่องทาง ↗</button></fieldset></details>`;
   const save=`<button class="primary" type="button" data-preset-save ${busy?'disabled':''}>${rule?'บันทึกการปรับค่า':'บันทึกเซตอัป'}</button>`;
   const activate=rule?`<button class="${rule.active?'secondary':'primary'}" type="button" data-activate ${busy?'disabled':''}>${rule.active?'หยุดแจ้งเตือน':'เปิดแจ้งเตือน'}</button>`:'';
   node.innerHTML=setupCardMarkup({spec,title:spec.name===`${p?.title} · ${spec.pairs.join(', ')} · ${spec.side}`?p.title:spec.name,status,version:rule?.revision,active:rule?.active,channels,actions:`<button class="secondary" type="button" data-edit>แก้ไขเซตอัป</button>${!rule||dirty?save:''}${rule&&(!dirty||rule.active)?activate:''}`,note:dirty?(rule.active?'ยังติดตามเงื่อนไขรุ่นที่บันทึก · บันทึกการปรับค่าแล้วจะพักแจ้งเตือน':'บันทึกการปรับค่าก่อนเปิดแจ้งเตือน'):rule?.active?'ตรวจแท่งปิด · ส่งสัญญาณเท่านั้น':rule?'เปิดเมื่อพร้อมให้ Snaap ติดตาม':'บันทึกก่อน แล้วค่อยเปิดแจ้งเตือน'},{esc,fullSummary});
   node.querySelectorAll('[data-channel]').forEach(input=>input.onchange=()=>{chosenChannels=[...node.querySelectorAll('[data-channel]:checked')].map(n=>n.dataset.channel);paint();});
   node.querySelector('.setup-card-channels').open=channelsOpen;
   node.querySelector('[data-edit]').onclick=()=>{if(!current())return;setWorkbenchTab('split');showDesigner();document.querySelector('#designer')?.scrollIntoView({block:'start',behavior:'smooth'});};
   node.querySelector('[data-channels]').onclick=()=>run(async()=>{
    const data=await api('/destinations');if(!current())return;
    const existing=node.querySelector('.preset-channel-connect');if(existing){existing.remove();return;}
    const box=document.createElement('div');box.className='preset-channel-connect';
    box.innerHTML=`<p>เลือกช่องทางเพื่อดูคู่มือและปรับหน้าตาสัญญาณ</p><div class="channel-row-actions">${Object.keys(data.available).map(kind=>`<button class="secondary" type="button" data-preset-channel-guide="${kind}">${kind==='TELEGRAM'?'Telegram':kind==='WEBHOOK'?'Webhook':kind==='DISCORD'?'Discord':'LINE'}</button>`).join('')}</div><button class="text-button" type="button" data-refresh-channel>ตรวจสถานะการเชื่อมต่อ</button>`;
    node.querySelector('.preset-destinations').append(box);
    box.querySelectorAll('[data-preset-channel-guide]').forEach(button=>button.onclick=()=>window.SnaapChannels.open(button.dataset.presetChannelGuide,undefined,data));
    box.querySelector('[data-refresh-channel]').onclick=()=>run(async()=>{await refresh();});
   },false);
   node.querySelector('[data-preset-save]')?.addEventListener('click',()=>run(async()=>{
    const destinations=[...node.querySelectorAll('[data-channel]:checked')].map(n=>n.dataset.channel);
    await saveDraft();if(!current())return;
    await api('/strategies/validate','POST',state.draft);if(!current())return;
    const result=await api(`/conversations/${conversation}/${m.ui_card.type==='preset'?'preset':'setup-card'}/${m.id}/save`,'POST',{expectedRevision:state.draftRevision,expectedRuleRevision:rule?.revision,destinations});
    if(!current())return;
    state.saved=result.rule;state.draft=result.spec;state.draftRevision=result.draft_revision;state.persistedDraft=JSON.stringify(result.spec);m.ui_card=result.card;persistRecovery();renderDesigner();await refresh();chosenChannels=null;toast('บันทึกเซตอัพเรียบร้อย');
   }));
   node.querySelector('[data-activate]')?.addEventListener('click',()=>run(async()=>{
    if(!rule)return;
    const chosen=[...node.querySelectorAll('[data-channel]:checked')].map(n=>n.dataset.channel).sort();
    if(!rule.active&&JSON.stringify(chosen)!==JSON.stringify([...rule.spec.destinations].sort()))throw new Error('บันทึกช่องทางที่เลือกก่อนเปิดแจ้งเตือน');
    if(!rule.active&&canonical(state.draft)!==canonical(rule.spec))throw new Error('ร่างมีการปรับค่า กรุณาตรวจและบันทึกก่อนเปิดแจ้งเตือน');
    await api(`/rules/${rule.id}/activation`,'POST',{active:!rule.active,expectedRevision:rule.revision,confirmation:rule.active?'PAUSE':'ACTIVATE'});
    if(!current())return;await refresh();toast(rule.active?'หยุดแจ้งเตือนแล้ว':'เปิดแจ้งเตือนแล้ว · เริ่มตรวจแท่งปิดถัดไป');
   }));
  }
  async function run(task,repaint=true){if(busy||working||state.busy||!current())return;busy=true;working=true;state.busy=true;document.querySelector('.setup-pane').inert=true;node.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();if(current()&&repaint)paint();}catch(e){if(current()){const el=node.querySelector('.preset-error');el.hidden=false;el.textContent=setupCardError(e.message);node.querySelectorAll('button').forEach(b=>b.disabled=false);}}finally{busy=false;working=false;state.busy=false;document.querySelector('.setup-pane').inert=false;if(current())node.querySelectorAll('button').forEach(b=>b.disabled=false);}}
  record.paint=paint;for(const r of cards.values())if(r.node.isConnected)r.paint();
 }
 document.addEventListener('setup-changed',()=>{for(const r of cards.values())if(r.node.isConnected)r.paint();});
 return {renderCard};
}
