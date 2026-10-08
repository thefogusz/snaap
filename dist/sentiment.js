import {initBrief,refreshBrief,setBriefActive} from './sentiment-brief.js';
import {initDaily,refreshDaily,setDailyActive,selectDailyAsset} from './sentiment-daily.js';
import {initPositioning,refreshPositioning,setPositioningActive,selectPositionMarket} from './sentiment-positioning.js';
const root=document.querySelector('#view-sentiment');
const icon=path=>`<svg class="sf-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const refreshIcon='M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1';
const money=(n,sign=true)=>n===null?'—':n===0?'$0':`${sign&&n>0?'+':n<0?'−':''}$${(Math.abs(n)/(Math.abs(n)>=1e12?1e12:Math.abs(n)>=1e9?1e9:1e6)).toLocaleString('en-US',{maximumFractionDigits:2})}${Math.abs(n)>=1e12?'T':Math.abs(n)>=1e9?'B':'M'}`;
const date=value=>new Date(value).toLocaleDateString((globalThis.SnaapI18n?.locale ?? "th-TH"),{day:'numeric',month:'short',year:'numeric',calendar:'gregory',timeZone:'UTC'});
const checkedTime=value=>new Date(value).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',calendar:'gregory'});
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const q=selector=>root.querySelector(selector);
let specialists,visible=false,initialized=false,specialistBusy=false,poll;
let view='brief',dailyInitialized=false,positionInitialized=false;
function shell(){
  root.innerHTML=`${(globalThis.SnaapI18n?.text("<header class=\"sf-heading\"><div><h1>Sentiment</h1></div><div class=\"sf-head-actions\"><button class=\"sf-icon-button\" id=\"sf-refresh\" type=\"button\" aria-label=\"ตรวจสอบข้อมูลล่าสุด\">") ?? "<header class=\"sf-heading\"><div><h1>Sentiment</h1></div><div class=\"sf-head-actions\"><button class=\"sf-icon-button\" id=\"sf-refresh\" type=\"button\" aria-label=\"ตรวจสอบข้อมูลล่าสุด\">")}${icon(refreshIcon)}${(globalThis.SnaapI18n?.text("</button></div></header>\n  <div class=\"sf-view-tabs\" role=\"group\" aria-label=\"มุมมองตลาด\"><button type=\"button\" data-sentiment-view=\"brief\" aria-pressed=\"true\">สรุปตลาด</button><button type=\"button\" data-sentiment-view=\"daily\" aria-pressed=\"false\">ย้อนหลัง 7 วัน</button><button type=\"button\" data-sentiment-view=\"positioning\" aria-pressed=\"false\">สถานะฟิวเจอร์ส</button></div>\n  <div id=\"sf-brief\"></div><div id=\"sf-daily\" hidden></div><div id=\"sf-positioning\" hidden></div>\n  <section class=\"sf-specialists\" aria-label=\"ข้อมูลทองและคริปโต\"><div class=\"sf-section-title\"><h2>ทอง & คริปโต</h2><span>ข้อมูลเฉพาะตลาด</span></div><div id=\"sf-specialist-data\" class=\"sf-specialist-grid\" aria-live=\"polite\">") ?? "</button></div></header>\n  <div class=\"sf-view-tabs\" role=\"group\" aria-label=\"มุมมองตลาด\"><button type=\"button\" data-sentiment-view=\"brief\" aria-pressed=\"true\">สรุปตลาด</button><button type=\"button\" data-sentiment-view=\"daily\" aria-pressed=\"false\">ย้อนหลัง 7 วัน</button><button type=\"button\" data-sentiment-view=\"positioning\" aria-pressed=\"false\">สถานะฟิวเจอร์ส</button></div>\n  <div id=\"sf-brief\"></div><div id=\"sf-daily\" hidden></div><div id=\"sf-positioning\" hidden></div>\n  <section class=\"sf-specialists\" aria-label=\"ข้อมูลทองและคริปโต\"><div class=\"sf-section-title\"><h2>ทอง & คริปโต</h2><span>ข้อมูลเฉพาะตลาด</span></div><div id=\"sf-specialist-data\" class=\"sf-specialist-grid\" aria-live=\"polite\">")}${skeletonUI('market-specialists',(globalThis.SnaapI18n?.text("กำลังอ่านข้อมูลเฉพาะตลาด…") ?? "กำลังอ่านข้อมูลเฉพาะตลาด…"))}${(globalThis.SnaapI18n?.text("</div></section>\n  <footer class=\"sf-method\" id=\"sf-method\"><details><summary>แหล่งข้อมูลและวิธีอ่านกราฟ <span>＋</span></summary><div><p>ผลตอบแทนรายวันใช้ราคาสินทรัพย์อ้างอิงจาก Yahoo Finance และ Coinbase (Kraken Spot สำรอง BTC/ETH) ไม่ใช่กระแสเงินทุน ราคาอาจล่าช้าและแท่งวันล่าสุดอาจยังไม่ปิด</p><p>CFTC แสดงสถานะสุทธิ Long − Short ของผู้เก็งกำไรในสัญญาฟิวเจอร์สที่ระบุ หารด้วย Open Interest การเปลี่ยนแปลงเป็นจุดเปอร์เซ็นต์รายสัปดาห์ ไม่ใช่เงินดอลลาร์ไหลเข้า–ออกหรือธุรกรรมสด รายงานอ้างอิงวันอังคารและเผยแพร่ตามรอบของ CFTC</p><p>ทองเป็นกระแสเงินของ Gold ETFs ที่มีทองจริงหนุนหลังทั่วโลก คริปโตแสดงการเปลี่ยนปริมาณ Stablecoin ที่ผูก USD จาก DefiLlama ไม่ใช่เงินไหลเข้า BTC/ETH ส่วน Fear & Greed เป็นดัชนีความเชื่อมั่น Bitcoin รายวันจาก Alternative.me</p></div></details></footer>") ?? "</div></section>\n  <footer class=\"sf-method\" id=\"sf-method\"><details><summary>แหล่งข้อมูลและวิธีอ่านกราฟ <span>＋</span></summary><div><p>ผลตอบแทนรายวันใช้ราคาสินทรัพย์อ้างอิงจาก Yahoo Finance และ Coinbase (Kraken Spot สำรอง BTC/ETH) ไม่ใช่กระแสเงินทุน ราคาอาจล่าช้าและแท่งวันล่าสุดอาจยังไม่ปิด</p><p>CFTC แสดงสถานะสุทธิ Long − Short ของผู้เก็งกำไรในสัญญาฟิวเจอร์สที่ระบุ หารด้วย Open Interest การเปลี่ยนแปลงเป็นจุดเปอร์เซ็นต์รายสัปดาห์ ไม่ใช่เงินดอลลาร์ไหลเข้า–ออกหรือธุรกรรมสด รายงานอ้างอิงวันอังคารและเผยแพร่ตามรอบของ CFTC</p><p>ทองเป็นกระแสเงินของ Gold ETFs ที่มีทองจริงหนุนหลังทั่วโลก คริปโตแสดงการเปลี่ยนปริมาณ Stablecoin ที่ผูก USD จาก DefiLlama ไม่ใช่เงินไหลเข้า BTC/ETH ส่วน Fear & Greed เป็นดัชนีความเชื่อมั่น Bitcoin รายวันจาก Alternative.me</p></div></details></footer>")}`;
  initBrief(q('#sf-brief'),showView);
  loadSpecialists();
  root.addEventListener('click',event=>{
    const tab=event.target.closest('[data-sentiment-view]');
    if(tab)showView(tab.dataset.sentimentView);
    if(event.target.closest('#sf-refresh')){
      if(view==='brief')refreshBrief();
      else if(view==='daily')refreshDaily();
      else refreshPositioning();
      loadSpecialists();
    }
  });
}
function showView(next,selection){
  view=next;
  q('#sf-brief').hidden=view!=='brief';
  q('#sf-daily').hidden=view!=='daily';
  q('#sf-positioning').hidden=view!=='positioning';
  root.querySelectorAll('[data-sentiment-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.sentimentView===view)));
  if(view==='daily'){
    if(!dailyInitialized){dailyInitialized=true;initDaily(q('#sf-daily'));}
    if(selection)selectDailyAsset(selection);
  }
  if(view==='positioning'){
    if(!positionInitialized){positionInitialized=true;initPositioning(q('#sf-positioning'));}
    if(selection)selectPositionMarket(selection);
  }
  if(!specialists)loadSpecialists();
  q('.sf-view-tabs').scrollIntoView({block:'nearest'});
  sync();
}
function bars(history){
  const max=Math.max(1,...history.map(h=>Math.abs(h.value??0)));
  return `${(globalThis.SnaapI18n?.text("<div class=\"sf-history\" tabindex=\"0\" aria-label=\"ข้อมูลย้อนหลัง เลื่อนแนวนอนเพื่อดูทั้งหมด\">") ?? "<div class=\"sf-history\" tabindex=\"0\" aria-label=\"ข้อมูลย้อนหลัง เลื่อนแนวนอนเพื่อดูทั้งหมด\">")}${history.map(h=>`<div class="sf-history-column ${h.value<0?'sf-out':'sf-in'}"><span class="sf-history-number">${money(h.value)}</span><span class="sf-history-track"><i style="--extent:${Math.abs(h.value??0)/max*46}%"></i></span><span class="sf-history-label">${h.period.slice(5).split('-').reverse().join('/')}</span></div>`).join('')}</div>`;
}
async function loadSpecialists(){
  if(specialistBusy)return;specialistBusy=true;
  try{const r=await fetch('/api/v1/sentiment/specialists',{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('source');const next=await r.json(),changed=JSON.stringify(specialists)!==JSON.stringify(next);specialists=next;if(changed)renderSpecialists();}
  catch{if(specialists){for(const item of Object.values(specialists))item.stale=true;renderSpecialists();}else q('#sf-specialist-data').innerHTML=(globalThis.SnaapI18n?.text("<p class=\"sf-warning\">อ่านข้อมูลทองและคริปโตไม่สำเร็จ กดตรวจสอบข้อมูลเพื่อลองอีกครั้ง</p>") ?? "<p class=\"sf-warning\">อ่านข้อมูลทองและคริปโตไม่สำเร็จ กดตรวจสอบข้อมูลเพื่อลองอีกครั้ง</p>");}
  finally{specialistBusy=false;}
}
function renderSpecialists(){
  q('#sf-specialist-data').innerHTML=['gold','crypto'].map(id=>{
    const item=specialists[id],isGold=id==='gold';
    if(item.error)return `<article class="sf-specialist"><h3>${isGold?(globalThis.SnaapI18n?.text("ทอง · Gold ETFs") ?? "ทอง · Gold ETFs"):(globalThis.SnaapI18n?.text("คริปโต · Stablecoin") ?? "คริปโต · Stablecoin")}</h3><p>${escape(item.error)}</p><a href="${escape(item.source)}${(globalThis.SnaapI18n?.text("\" target=\"_blank\" rel=\"noopener noreferrer\">เปิดแหล่งข้อมูล ↗</a></article>") ?? "\" target=\"_blank\" rel=\"noopener noreferrer\">เปิดแหล่งข้อมูล ↗</a></article>")}`;
    const latest=item.history.at(-1),weekly=item.cadence==='weekly',aged=Date.now()-Date.parse(latest.period)>(isGold?(weekly?14:45):2)*86400000;
    return `<article class="sf-specialist" data-specialist="${id}"><div class="sf-specialist-head"><div><span class="sf-asset-symbol ${isGold?'sf-gold':'sf-crypto'}">${isGold?'Au':'$'}</span><div><h3>${isGold?(globalThis.SnaapI18n?.text("ทอง") ?? "ทอง"):(globalThis.SnaapI18n?.text("คริปโต") ?? "คริปโต")}</h3><p>${isGold?(globalThis.SnaapI18n?.text("เงินไหล · Gold ETFs ทั่วโลก") ?? "เงินไหล · Gold ETFs ทั่วโลก"):(globalThis.SnaapI18n?.text("สภาพคล่อง · Stablecoin ที่ผูก USD") ?? "สภาพคล่อง · Stablecoin ที่ผูก USD")}</p></div></div><span class="sf-source-tag ${item.stale||aged?'sf-snapshot':''}">${item.stale?(globalThis.SnaapI18n?.text("ข้อมูลล่าสุดที่บันทึกไว้") ?? "ข้อมูลล่าสุดที่บันทึกไว้"):aged?(globalThis.SnaapI18n?.text("ต้นทางยังไม่มีรอบใหม่") ?? "ต้นทางยังไม่มีรอบใหม่"):(globalThis.SnaapI18n?.text("อัปเดตอัตโนมัติ") ?? "อัปเดตอัตโนมัติ")}</span></div><div class="sf-specialist-body"><div><strong class="${latest.value<0?'sf-negative':'sf-positive'}">${money(latest.value)}</strong><p>${isGold?(weekly?(globalThis.SnaapI18n?.text("เงินไหลสุทธิรายสัปดาห์") ?? "เงินไหลสุทธิรายสัปดาห์"):(globalThis.SnaapI18n?.text("เงินไหลสุทธิรายเดือน") ?? "เงินไหลสุทธิรายเดือน")):(globalThis.SnaapI18n?.text("ปริมาณหมุนเวียนเปลี่ยนใน 1 วัน") ?? "ปริมาณหมุนเวียนเปลี่ยนใน 1 วัน")}<br>${date(latest.period)}</p>${!isGold?`${(globalThis.SnaapI18n?.text("<small>ปริมาณรวม ") ?? "<small>ปริมาณรวม ")}${money(item.supply,false)}</small>`:''}</div>${bars(item.history)}</div><div class="sf-specialist-foot"><a href="${escape(item.source)}" target="_blank" rel="noopener noreferrer">${escape(item.sourceName)} ↗</a><span>${isGold?(weekly?(globalThis.SnaapI18n?.text("รายสัปดาห์ · USD") ?? "รายสัปดาห์ · USD"):(globalThis.SnaapI18n?.text("รายเดือน · USD") ?? "รายเดือน · USD")):(globalThis.SnaapI18n?.text("รายวัน · หน่วย USD ที่ตรึงมูลค่า") ?? "รายวัน · หน่วย USD ที่ตรึงมูลค่า")}</span></div><p class="sf-source-note">${isGold?(globalThis.SnaapI18n?.text("เฉพาะ ETF ที่มีทองจริงหนุนหลัง") ?? "เฉพาะ ETF ที่มีทองจริงหนุนหลัง"):(globalThis.SnaapI18n?.text("ปริมาณเหรียญเพิ่ม–ลด ไม่ใช่เงินไหลเข้า BTC/ETH หรือ ETF") ?? "ปริมาณเหรียญเพิ่ม–ลด ไม่ใช่เงินไหลเข้า BTC/ETH หรือ ETF")}${(globalThis.SnaapI18n?.text("<br>ตรวจต้นทาง ") ?? "<br>ตรวจต้นทาง ")}${checkedTime(item.checkedAt)}</p></article>`;
  }).join('');
  const fear=specialists.fear;
  if(fear&&!fear.error){
    const label={'Extreme Fear':(globalThis.SnaapI18n?.text("กลัวมาก") ?? "กลัวมาก"),Fear:(globalThis.SnaapI18n?.text("กลัว") ?? "กลัว"),Neutral:(globalThis.SnaapI18n?.text("เป็นกลาง") ?? "เป็นกลาง"),Greed:(globalThis.SnaapI18n?.text("โลภ") ?? "โลภ"),'Extreme Greed':(globalThis.SnaapI18n?.text("โลภมาก") ?? "โลภมาก")}[fear.classification];
    q('#sf-specialist-data').insertAdjacentHTML('beforeend',`<section class="sf-signal" data-mood="${escape(fear.classification)}${(globalThis.SnaapI18n?.text("\" aria-label=\"ความเชื่อมั่น Bitcoin\"><div class=\"sf-signal-heading\"><span class=\"sf-bitcoin-mark\" aria-hidden=\"true\">₿</span><div><h3>ความเชื่อมั่น Bitcoin</h3><p>Fear & Greed · ดัชนีรายวัน</p><div class=\"sf-signal-meta\"><a href=\"") ?? "\" aria-label=\"ความเชื่อมั่น Bitcoin\"><div class=\"sf-signal-heading\"><span class=\"sf-bitcoin-mark\" aria-hidden=\"true\">₿</span><div><h3>ความเชื่อมั่น Bitcoin</h3><p>Fear & Greed · ดัชนีรายวัน</p><div class=\"sf-signal-meta\"><a href=\"")}${escape(fear.source)}" target="_blank" rel="noopener noreferrer">Alternative.me ↗</a><span>· ${date(fear.period)}${fear.stale?(globalThis.SnaapI18n?.text(" · ข้อมูลล่าสุดที่บันทึกไว้") ?? " · ข้อมูลล่าสุดที่บันทึกไว้"):Date.now()-Date.parse(fear.period)>2*86400000?(globalThis.SnaapI18n?.text(" · รอข้อมูลใหม่") ?? " · รอข้อมูลใหม่"):''}</span></div></div></div><div class="sf-signal-score"><strong>${fear.value}<small>/100</small></strong><span class="sf-mood-label">${label}</span></div><div class="sf-signal-scale"><div class="sf-signal-meter" role="meter" aria-label="Fear & Greed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fear.value}" aria-valuetext="${fear.value}${(globalThis.SnaapI18n?.text(" จาก 100 · ") ?? " จาก 100 · ")}${label}" style="--value:${fear.value}${(globalThis.SnaapI18n?.text("%\"><span class=\"sf-mood-band\" title=\"0–24 กลัวมาก\"></span><span class=\"sf-mood-band\" title=\"25–44 กลัว\"></span><span class=\"sf-mood-band\" title=\"45–55 เป็นกลาง\"></span><span class=\"sf-mood-band\" title=\"56–74 โลภ\"></span><span class=\"sf-mood-band\" title=\"75–100 โลภมาก\"></span><i aria-hidden=\"true\"></i></div><div class=\"sf-signal-labels\" aria-hidden=\"true\"><span>0 · กลัวมาก</span><span>50 · เป็นกลาง</span><span>100 · โลภมาก</span></div></div></section>") ?? "%\"><span class=\"sf-mood-band\" title=\"0–24 กลัวมาก\"></span><span class=\"sf-mood-band\" title=\"25–44 กลัว\"></span><span class=\"sf-mood-band\" title=\"45–55 เป็นกลาง\"></span><span class=\"sf-mood-band\" title=\"56–74 โลภ\"></span><span class=\"sf-mood-band\" title=\"75–100 โลภมาก\"></span><i aria-hidden=\"true\"></i></div><div class=\"sf-signal-labels\" aria-hidden=\"true\"><span>0 · กลัวมาก</span><span>50 · เป็นกลาง</span><span>100 · โลภมาก</span></div></div></section>")}`);
  }
}
function sync(){
  visible=!root.hidden&&!document.hidden&&!document.documentElement.hasAttribute('data-boot');
  if(visible&&!initialized){initialized=true;shell();}
  setDailyActive(visible&&view==='daily');
  setBriefActive(visible&&view==='brief');
  setPositioningActive(visible&&view==='positioning');
  clearInterval(poll);
  if(visible)poll=setInterval(loadSpecialists,60000);
}
new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['hidden']});
new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['data-boot']});
document.addEventListener('visibilitychange',sync);
window.addEventListener('pagehide',()=>{
  clearInterval(poll);setDailyActive(false);setBriefActive(false);setPositioningActive(false);
});
window.addEventListener('pageshow',sync);
sync();
