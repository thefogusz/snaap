import {initBrief,refreshBrief,setBriefActive} from './sentiment-brief.js';
import {initDaily,refreshDaily,setDailyActive,selectDailyAsset} from './sentiment-daily.js';
const root = document.querySelector('#view-sentiment');
const names = { equity:['หุ้น','Equities'], bond:['ตราสารหนี้','Bonds'], mixed:['สินทรัพย์ผสม','Multi-asset'], cash:['ตลาดเงิน','Money market'], property:['อสังหาริมทรัพย์','Real estate'], other:['สินทรัพย์อื่น','Other funds'], guaranteed:['กองทุนรับประกัน','Guaranteed'], commodity:['สินค้าโภคภัณฑ์','Commodities'] };
const positions = { equity:[21,24], bond:[78,27], mixed:[48,85], cash:[81,70], property:[21,74], other:[50,11], guaranteed:[12,49], commodity:[78,73] };
const symbols = {equity:'M4 16l5-5 4 3 7-9M15 5h5v5',bond:'M5 5h14v14H5zM8 9h8M8 13h5',mixed:'M5 5h6v6H5zM14 5h5v6h-5zM5 14h6v5H5zM14 14h5v5h-5z',cash:'M4 7h16v11H4zM7 4h10M10 11h4v3h-4',property:'M4 20V9l8-5 8 5v11M9 20v-7h6v7',other:'M5 7h14M5 12h10M5 17h14',guaranteed:'M12 3l8 3v6c0 4-8 9-8 9s-8-5-8-9V6zM8 12l3 3 5-6',commodity:'M5 17l3-10h8l3 10zM8 7l4 10 4-10'};
const icon = (path, cls='') => `<svg class="sf-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const refreshIcon = 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1';
let data, specialists, universe='global', period=0, selected='bond', scene, visible=false, busy=false, initialized=false, specialistBusy=false, poll;
let view='brief',dailyInitialized=false;
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const money = (n, sign=true) => n===null ? '< $0.5B*' : n===0 ? '$0' : `${sign&&n>0?'+':n<0?'−':''}$${(Math.abs(n)/(Math.abs(n)>=1e12?1e12:Math.abs(n)>=1e9?1e9:1e6)).toLocaleString('en-US',{maximumFractionDigits:2})}${Math.abs(n)>=1e12?'T':Math.abs(n)>=1e9?'B':'M'}`;
const date = value => new Date(value).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric',calendar:'gregory',timeZone:'UTC'});
const checkedTime = value => new Date(value).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',calendar:'gregory'});
const periodLabel = value => value.includes('Q') ? value.replace(/(\d+) Q(\d)/,'Q$2 $1') : date(value);
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const q = selector => root.querySelector(selector);
const direction = value => value===null?'sf-unknown':value<0?'sf-out':'sf-in';
const arrow = value => value===null?'·':value<0?'↙':'↗';
function shell(){
  root.innerHTML=`<header class="sf-heading"><div><h1>Sentiment</h1></div><div class="sf-head-actions"><button class="sf-icon-button" id="sf-refresh" type="button" aria-label="ตรวจสอบข้อมูลล่าสุด">${icon(refreshIcon)}</button></div></header>
  <div class="sf-view-tabs" role="group" aria-label="มุมมองตลาด"><button type="button" data-sentiment-view="brief" aria-pressed="true">สรุปตลาด</button><button type="button" data-sentiment-view="daily" aria-pressed="false">ย้อนหลัง 7 วัน</button><button type="button" data-sentiment-view="flows" aria-pressed="false">กระแสเงินกองทุน</button></div><div id="sf-brief"></div><div id="sf-daily" hidden></div><div id="sf-flow-view" hidden>
  <div class="sf-toolbar"><div class="sf-universes" role="group" aria-label="ขอบเขตข้อมูล"><button type="button" data-universe="global" aria-pressed="true">${icon('M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18')}ทั่วโลก <small>ไตรมาส</small></button><button type="button" data-universe="us" aria-pressed="false">กองทุนสหรัฐ <small>สัปดาห์</small></button></div><label class="sf-period-label">ช่วงข้อมูล<select id="sf-period" aria-label="ช่วงข้อมูล" disabled></select></label></div>
  <p id="sf-status" class="sf-status" role="status">กำลังอ่านข้อมูลจาก ICI…</p><div id="sf-content" hidden></div></div>
  <section class="sf-specialists" hidden aria-label="ข้อมูลทองและคริปโต"><div class="sf-section-title"><h2>ทอง & คริปโต</h2><span>ข้อมูลเฉพาะตลาด</span></div><div id="sf-specialist-data" class="sf-specialist-grid" aria-live="polite"><p>กำลังอ่านข้อมูลเฉพาะตลาด…</p></div></section>
  <footer class="sf-method" id="sf-method"><details><summary>แหล่งข้อมูลและวิธีอ่านกราฟ <span>＋</span></summary><div><p>ภาพรายวันใช้ราคา ETF เป็นสินทรัพย์อ้างอิง ไม่ใช่ราคาทั้งตลาด: SPY หุ้นสหรัฐ, EFA หุ้นพัฒนาแล้วนอกสหรัฐ, EEM หุ้นเกิดใหม่, TLT พันธบัตรระยะยาว, GLD ทอง, USO น้ำมันล่วงหน้า, VNQ อสังหาริมทรัพย์สหรัฐ, UUP ดอลลาร์ล่วงหน้า ราคา ETF จากช่องทางสาธารณะของ Yahoo Finance อาจล่าช้าและไม่มี API ที่รับประกันความต่อเนื่อง ตรวจต้นทางราคาทุก 5 นาที ส่วน BTC/ETH จาก Coinbase เป็นแท่งวัน UTC ที่ยังเปลี่ยนได้ระหว่างวัน ตารางใช้ 7 วันปฏิทินตาม UTC ไม่เติมราคาในวันหยุด ช่องรายวันเทียบราคาวันซื้อขายก่อน รวม 7 วันเทียบราคาก่อนเริ่มช่วง ไม่รวมเงินปันผล</p><p>ICI ทั่วโลก: เงินไหลสุทธิของกองทุนเปิดรายไตรมาส รวมเงินปันผลที่นำกลับมาลงทุน และตัดกองทุนซ้อนกองทุนออกเท่าที่ทำได้ สหรัฐ: ประมาณการเงินไหลกองทุนระยะยาวและ ETF net issuance รายสัปดาห์ ไม่รวมกองทุนตลาดเงิน ทั้งสองชุดไม่บวกเข้าด้วยกัน</p><p>ภาพรวมแสดงหมวดกองทุนรอบจุดอ้างอิง ไม่ใช่พิกัดทางภูมิศาสตร์ เส้นแต่ละเส้นบอกเงินเข้า–ออกของหมวดนั้น ไม่ได้ระบุว่าเงินโอนจากตลาดใดไปตลาดใด ขนาดจุดและความหนาเส้นเป็นระดับสัมพัทธ์ ใช้แถบเปรียบเทียบเมื่อต้องการเทียบสัดส่วนจริง</p><p>การเคลื่อนไหวบอกทิศทาง ไม่ใช่ธุรกรรมสด เงินออกไม่สามารถบอกปลายทาง เงินตลาดเงินไม่ใช่เงินสดทั้งหมด ราคาหรือ AUM ที่เปลี่ยนไม่ถูกแทนด้วยเงินไหล ผลรวมอาจคลาดเคลื่อนจากการปัดเศษหรือหมวดที่ไม่จัดประเภท</p><p>ทองเป็นกระแสเงิน ETF ที่มีทองจริงหนุนหลังทั่วโลก คริปโตแสดงการเปลี่ยนปริมาณ Stablecoin ที่ผูก USD จาก DefiLlama ไม่ใช่เงินไหลเข้า BTC/ETH หรือ ETF และไม่ยืนยันว่าเป็นเงินใหม่จากนอกตลาด ส่วน Fear & Greed เป็นดัชนีความเชื่อมั่น Bitcoin รายวันจาก Alternative.me แยกจากกระแสเงิน</p></div></details></footer>`;
  initBrief(q('#sf-brief'),showView);
  root.addEventListener('click',event=>{
    const tab=event.target.closest('[data-sentiment-view]');
    if(tab)showView(tab.dataset.sentimentView);
    const scope=event.target.closest('[data-universe]');
    if(scope&&!busy&&universe!==scope.dataset.universe){universe=scope.dataset.universe;load();}
    const market=event.target.closest('[data-market]');
    if(market){selected=market.dataset.market;renderSelection();}
    const history=event.target.closest('[data-history]');
    if(history){period=Number(history.dataset.history);render();q('.sf-period-label [role=combobox]')?.focus();}
    if(event.target.closest('#sf-refresh')&&!busy){if(view==='brief')refreshBrief();else if(view==='daily')refreshDaily();else load(true);if(view!=='brief')loadSpecialists();}
    if(event.target.closest('#sf-pause')){paused=!paused;scene?.setPaused(paused);updatePause();}
  });
  q('#sf-period').addEventListener('change',event=>{period=Number(event.target.value);render();});
}
function showView(next,selection,market){
  view=next;q('#sf-brief').hidden=view!=='brief';q('#sf-daily').hidden=view!=='daily';q('#sf-flow-view').hidden=view!=='flows';q('.sf-specialists').hidden=view==='brief';
  root.querySelectorAll('[data-sentiment-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sentimentView===view)));
  if(view==='daily'){if(!dailyInitialized){dailyInitialized=true;initDaily(q('#sf-daily'));}if(selection)selectDailyAsset(selection);}
  if(view==='flows'){if(selection)universe=selection;if(market)selected=market;if((!data||data.universe!==universe)&&!busy)load();else if(data&&data.universe===universe&&market)renderSelection();}
  if(view!=='brief'&&!specialists)loadSpecialists();
  q('.sf-view-tabs').scrollIntoView({block:'nearest'});sync();
}
async function load(keepPeriod=false,quiet=false){
  if(busy)return;
  const oldPeriod=data?.periods[period],wasLatest=period===data?.periods.length-1,requestedUniverse=universe;let retryScope=false;
  busy=true;if(!quiet){scene?.dispose();scene=undefined;q('#sf-content').hidden=true;}
  if(!quiet){q('#sf-status').textContent='กำลังอ่านรายงานจาก ICI…';q('#sf-status').classList.remove('sf-warning');}
  root.querySelectorAll('[data-universe]').forEach(b=>{b.disabled=true;b.setAttribute('aria-pressed',String(b.dataset.universe===universe));});
  q('#sf-refresh').disabled=true;q('#sf-period').disabled=true;
  try{
    const response=await fetch(`/api/v1/sentiment?universe=${requestedUniverse}`,{signal:AbortSignal.timeout(35000)});
    if(!response.ok)throw new Error(response.status===401?'กรุณาเข้าสู่ระบบอีกครั้ง':'ยังอ่านข้อมูลต้นทางไม่ได้ กดตรวจสอบข้อมูลเพื่อลองอีกครั้ง');
    const next=await response.json();if(universe!==requestedUniverse){retryScope=true;return;}
    const changed=!data||JSON.stringify([data.periods,data.markets,data.total,data.stale,data.publishedAt])!==JSON.stringify([next.periods,next.markets,next.total,next.stale,next.publishedAt]);
    data=next;period=keepPeriod&&!wasLatest&&data.periods.includes(oldPeriod)?data.periods.indexOf(oldPeriod):data.periods.length-1;
    if(!data.markets.some(m=>m.id===selected))selected='bond';
    if(!quiet||changed)q('#sf-period').innerHTML=data.periods.map((p,i)=>`<option value="${i}">${escape(periodLabel(p))}${i===data.periods.length-1?' · ล่าสุด':''}</option>`).join('');
    q('#sf-period').value=String(period);q('#sf-period').disabled=false;if(!quiet||changed)render();else renderStatus();
  }catch(error){q('#sf-status').textContent=error.name==='TimeoutError'?'ต้นทางตอบกลับช้า กรุณาลองอีกครั้ง':error.message;q('#sf-status').classList.add('sf-warning');}
  finally{busy=false;q('#sf-refresh').disabled=false;root.querySelectorAll('[data-universe]').forEach(b=>b.disabled=false);if(retryScope)load();}
}
function marketValues(){return data.markets.map(m=>({...m,value:m.values[period],position:positions[m.id]}));}
function renderStatus(){
  q('#sf-status').classList.toggle('sf-warning',data.stale);
  q('#sf-status').textContent=`${data.stale?'ตรวจต้นทางไม่สำเร็จ · ข้อมูลที่เก็บไว้ · ':''}${data.quality==='reported'?'รายงานจริง':'ประมาณการ'} · เผยแพร่ ${date(data.publishedAt)} · ตรวจต้นทาง ${checkedTime(data.checkedAt)}`;
}
function render(){
  scene?.dispose();scene=undefined;const values=marketValues();
  const incoming=values.filter(m=>m.value>0).reduce((n,m)=>n+m.value,0),outgoing=values.filter(m=>m.value<0).reduce((n,m)=>n-m.value,0);
  const known=values.some(m=>m.value===null)?' · เฉพาะค่าที่ทราบ':'';
  const max=Math.max(1,...values.map(m=>Math.abs(m.value??0)));
  q('#sf-period').value=String(period);q('#sf-period').dispatchEvent(new Event('snaap-select-sync'));renderStatus();
  q('#sf-content').hidden=false;
  q('#sf-content').innerHTML=`<div class="sf-summary"><div class="sf-total"><span>เงินไหลสุทธิ <small>USD</small></span><strong class="${data.total[period]<0?'sf-negative':''}">${money(data.total[period])}</strong><p>${universe==='global'?'กองทุนเปิดทั่วโลก':'กองทุนระยะยาวและ ETF สหรัฐ'}</p></div><div class="sf-stat"><span><i class="sf-dot sf-positive-bg"></i>หมวดที่เงินเข้า${known}</span><strong class="sf-positive">${money(incoming)}</strong><small>${values.filter(m=>m.value>0).length} หมวดรับเงินสุทธิ</small></div><div class="sf-stat"><span><i class="sf-dot sf-negative-bg"></i>หมวดที่เงินออก${known}</span><strong class="${outgoing?'sf-negative':''}">${money(-outgoing)}</strong><small>${values.filter(m=>m.value<0).length} หมวดมีเงินออกสุทธิ</small></div></div>
  <div class="sf-workspace"><section class="sf-map" aria-label="แผนภาพเงินไหล"><div class="sf-panel-heading"><div><h2>ภาพรวมกระแสเงิน</h2><p>${values.length} หมวดกองทุน · ${escape(periodLabel(data.periods[period]))}</p></div><div class="sf-map-controls"><span><i class="sf-dot sf-positive-bg"></i>เข้า</span><span><i class="sf-dot sf-negative-bg"></i>ออก</span><button id="sf-pause" class="sf-icon-button" type="button"></button></div></div>
  <div class="sf-orbit"><div class="sf-canvas"></div><div class="sf-center"><span>FUND FLOWS</span><b>${values.length}<small>หมวด</small></b><em>เงินเข้า / ออกสุทธิ</em></div><div class="sf-orbit-labels">${values.map(m=>`<button type="button" data-market="${m.id}" class="sf-node ${direction(m.value)}" aria-pressed="${m.id===selected}" style="--x:${m.position[0]}%;--y:${m.position[1]}%"><span>${icon(symbols[m.id])}${names[m.id][0]}</span><b>${arrow(m.value)} ${money(m.value)}</b><small>${m.value===null?'ไม่ทราบทิศทาง':names[m.id][1]}</small></button>`).join('')}</div></div>
  <div class="sf-map-foot"><span>เงินไหลสุทธิแต่ละหมวด · ไม่ระบุปลายทางเงิน</span></div></section>
  <aside class="sf-ranking" aria-label="เปรียบเทียบกระแสเงิน"><div class="sf-panel-heading"><div><h2>เงินไหลสุทธิ</h2><p>เรียงตามเงินไหลสุทธิ · USD</p></div></div><div class="sf-rank-axis"><span>← ออก</span><span>0</span><span>เข้า →</span></div><div class="sf-rank-list">${[...values].sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity)).map(m=>`<button type="button" data-market="${m.id}" class="sf-rank-row ${direction(m.value)}" aria-pressed="${m.id===selected}"><span class="sf-rank-name">${names[m.id][0]}<b>${money(m.value)}</b></span><span class="sf-rank-track"><i style="--extent:${Math.abs(m.value??0)/max*50}%"></i></span></button>`).join('')}</div></aside></div>
  <section class="sf-detail" aria-label="รายละเอียดตลาด"></section>`;
  renderSelection();updatePause();const canvas=q('.sf-canvas');
  import('./sentiment-scene.js').then(({createFlowScene})=>{
    if(!canvas.isConnected)return;
    try{scene=createFlowScene(canvas,()=>{canvas.classList.add('sf-no-webgl');q('#sf-pause').disabled=true;});scene.update(marketValues(),selected);scene.setPaused(paused);scene.setActive(visible&&view==='flows');}
    catch{canvas.classList.add('sf-no-webgl');q('#sf-pause').disabled=true;}
  }).catch(()=>{if(canvas.isConnected)q('#sf-pause').disabled=true;});
}
function updatePause(){const b=q('#sf-pause');if(!b)return;b.innerHTML=icon(paused?'M8 5l11 7-11 7z':'M9 5v14M15 5v14');b.setAttribute('aria-label',paused?'เล่นภาพเคลื่อนไหว':'หยุดภาพเคลื่อนไหว');b.setAttribute('aria-pressed',String(paused));}
function bars(history,interactive=false){
  const max=Math.max(1,...history.map(h=>Math.abs(h.value??0)));
  return `<div class="sf-history" ${interactive?'':'tabindex="0" aria-label="กราฟย้อนหลัง เลื่อนแนวนอนเพื่อดูทั้งหมด"'}>${history.map((h,i)=>`<${interactive?'button type="button"':'div'} class="sf-history-column ${direction(h.value)}" ${interactive?`data-history="${i}" aria-pressed="${i===period}" aria-label="${escape(periodLabel(h.period))} ${money(h.value)}"`:''}><span class="sf-history-number">${money(h.value)}</span><span class="sf-history-track"><i style="--extent:${Math.abs(h.value??0)/max*46}%"></i></span><span class="sf-history-label">${h.period.includes('Q')?h.period.slice(-2):h.period.slice(5).split('-').reverse().join('/')}</span></${interactive?'button':'div'}>`).join('')}</div>`;
}
function renderSelection(){
  const market=data.markets.find(m=>m.id===selected),value=market.values[period],previous=period>0?market.values[period-1]:null;
  root.querySelectorAll('[data-market]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.market===selected)));
  q('.sf-detail').innerHTML=`<div class="sf-detail-overview"><div class="sf-detail-heading"><span class="sf-market-icon">${icon(symbols[selected])}</span><div><h2>${names[selected][0]}</h2><span>${names[selected][1]}</span></div></div><strong class="sf-detail-value ${value<0?'sf-negative':''}">${money(value)}</strong><p>${value===null?'* ต่ำกว่า $0.5B ไม่ทราบเครื่องหมาย':value<0?'เงินไหลออกสุทธิ':'เงินไหลเข้าสุทธิ'}</p><div class="sf-change">เทียบช่วงก่อน <b>${previous!==null&&value!==null?money(value-previous):'—'}</b></div></div><div class="sf-detail-history"><div class="sf-section-title"><h3>กระแสเงินย้อนหลัง</h3><span>${data.quality==='reported'?'รายไตรมาส':'รายสัปดาห์'} · USD</span></div>${bars(market.values.map((v,i)=>({period:data.periods[i],value:v})),true)}<p class="sf-history-range">${periodLabel(data.periods[0])} — ${periodLabel(data.periods.at(-1))}</p></div><div class="sf-evidence"><span class="sf-eyebrow">แหล่งข้อมูล</span><a href="${escape(data.source)}" target="_blank" rel="noopener noreferrer">ICI / IIFA ${icon('M7 17L17 7M7 7h10v10')}</a><p>${universe==='global'?'กองทุนเปิดทั่วโลก รวมเงินปันผลที่นำกลับมาลงทุน':'กองทุนที่จดทะเบียนในสหรัฐ รวมการลงทุนต่างประเทศ'}</p><span class="sf-source-tag">${data.quality==='reported'?'รายงานจริง':'ประมาณการ'}</span><small>เผยแพร่ ${date(data.publishedAt)}</small></div>`;
  scene?.update(marketValues(),selected);
}
async function loadSpecialists(){
  if(specialistBusy)return;specialistBusy=true;
  try{const r=await fetch('/api/v1/sentiment/specialists',{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('source');const next=await r.json(),changed=JSON.stringify(specialists)!==JSON.stringify(next);specialists=next;if(changed)renderSpecialists();}
  catch{if(specialists){for(const item of Object.values(specialists))item.stale=true;renderSpecialists();}else q('#sf-specialist-data').innerHTML='<p class="sf-warning">อ่านข้อมูลทองและคริปโตไม่สำเร็จ กดตรวจสอบข้อมูลเพื่อลองอีกครั้ง</p>';}
  finally{specialistBusy=false;}
}
function renderSpecialists(){
  q('#sf-specialist-data').innerHTML=['gold','crypto'].map(id=>{
    const item=specialists[id],isGold=id==='gold';
    if(item.error)return `<article class="sf-specialist"><h3>${isGold?'ทอง · Gold ETFs':'คริปโต · Stablecoin'}</h3><p>${escape(item.error)}</p><a href="${escape(item.source)}" target="_blank" rel="noopener noreferrer">เปิดแหล่งข้อมูล ↗</a></article>`;
    const latest=item.history.at(-1),weekly=item.cadence==='weekly',aged=Date.now()-Date.parse(latest.period)>(isGold?(weekly?14:45):2)*86400000;
    return `<article class="sf-specialist" data-specialist="${id}"><div class="sf-specialist-head"><div><span class="sf-asset-symbol ${isGold?'sf-gold':'sf-crypto'}">${isGold?'Au':'$'}</span><div><h3>${isGold?'ทอง':'คริปโต'}</h3><p>${isGold?'เงินไหล · Gold ETFs ทั่วโลก':'สภาพคล่อง · Stablecoin ที่ผูก USD'}</p></div></div><span class="sf-source-tag ${item.stale||aged?'sf-snapshot':''}">${item.stale?'ตรวจต้นทางไม่สำเร็จ':aged?'ต้นทางยังไม่มีรอบใหม่':'อัปเดตอัตโนมัติ'}</span></div><div class="sf-specialist-body"><div><strong class="${latest.value<0?'sf-negative':'sf-positive'}">${money(latest.value)}</strong><p>${isGold?(weekly?'เงินไหลสุทธิรายสัปดาห์':'เงินไหลสุทธิรายเดือน'):'ปริมาณหมุนเวียนเปลี่ยนใน 1 วัน'}<br>${date(latest.period)}</p>${!isGold?`<small>ปริมาณรวม ${money(item.supply,false)}</small>`:''}</div>${bars(item.history)}</div><div class="sf-specialist-foot"><a href="${escape(item.source)}" target="_blank" rel="noopener noreferrer">${escape(item.sourceName)} ↗</a><span>${isGold?(weekly?'รายสัปดาห์ · USD':'รายเดือน · USD'):'รายวัน · หน่วย USD ที่ตรึงมูลค่า'}</span></div><p class="sf-source-note">${isGold?'เฉพาะ ETF ที่มีทองจริงหนุนหลัง':'ปริมาณเหรียญเพิ่ม–ลด ไม่ใช่เงินไหลเข้า BTC/ETH หรือ ETF'}<br>ตรวจต้นทาง ${checkedTime(item.checkedAt)}</p></article>`;
  }).join('');
  const fear=specialists.fear;
  if(fear&&!fear.error){
    const label={'Extreme Fear':'กลัวมาก',Fear:'กลัว',Neutral:'เป็นกลาง',Greed:'โลภ','Extreme Greed':'โลภมาก'}[fear.classification];
    q('#sf-specialist-data').insertAdjacentHTML('beforeend',`<section class="sf-signal" data-mood="${label}" aria-label="ความเชื่อมั่น Bitcoin"><div class="sf-signal-heading"><span class="sf-bitcoin-mark" aria-hidden="true">₿</span><div><h3>ความเชื่อมั่น Bitcoin</h3><p>Fear & Greed · ดัชนีรายวัน</p></div></div><div class="sf-signal-score"><strong>${fear.value}<small>/100</small></strong><span class="sf-mood-label">${label}</span></div><div class="sf-signal-scale"><div class="sf-signal-meter" role="meter" aria-label="Fear & Greed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fear.value}" aria-valuetext="${fear.value} จาก 100 · ${label}" style="--value:${fear.value}%"><span class="sf-mood-band" title="0–24 กลัวมาก"></span><span class="sf-mood-band" title="25–44 กลัว"></span><span class="sf-mood-band" title="45–55 เป็นกลาง"></span><span class="sf-mood-band" title="56–74 โลภ"></span><span class="sf-mood-band" title="75–100 โลภมาก"></span><i aria-hidden="true"></i></div><div class="sf-signal-labels" aria-hidden="true"><span>0 · กลัวมาก</span><span>50 · เป็นกลาง</span><span>100 · โลภมาก</span></div></div><div class="sf-signal-meta"><span><a href="${escape(fear.source)}" target="_blank" rel="noopener noreferrer">Alternative.me ↗</a> · ${date(fear.period)}${fear.stale?' · ตรวจต้นทางไม่สำเร็จ':Date.now()-Date.parse(fear.period)>2*86400000?' · รอข้อมูลใหม่':''}</span></div></section>`);
  }
}
function sync(){visible=!root.hidden&&!document.hidden&&!document.documentElement.hasAttribute('data-boot');if(visible&&!initialized){initialized=true;shell();}scene?.setActive(visible&&view==='flows');setDailyActive(visible&&view==='daily');setBriefActive(visible&&view==='brief');clearInterval(poll);if(visible)poll=setInterval(()=>{if(view==='flows')load(true,true);if(view!=='brief')loadSpecialists();},60000);}
new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['hidden']});
new MutationObserver(()=>{if(scene&&data)scene.update(marketValues(),selected);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-boot']});
document.addEventListener('visibilitychange',sync);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{paused=event.matches;scene?.setPaused(paused);updatePause();});
window.addEventListener('pagehide',()=>{clearInterval(poll);setDailyActive(false);setBriefActive(false);scene?.setActive(false);});window.addEventListener('pageshow',sync);sync();
