const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const date = value => new Date(value).toLocaleDateString('th-TH',{day:'numeric',month:'short',timeZone:'UTC'});
const usd = value => '$'+(Math.abs(value)/1e9).toLocaleString('en-US',{maximumFractionDigits:2})+'B';
const pct = value => value==null?'—':`${value>0?'+':value<0?'−':''}${Math.abs(value).toFixed(2)}%`;
const labels={equity:'หุ้น',bond:'ตราสารหนี้',mixed:'กองทุนผสม',commodity:'สินค้าโภคภัณฑ์'};
const assets=[['spy','หุ้นสหรัฐ','↗'],['gld','ทองคำ','Au'],['tlt','พันธบัตร','≋'],['uso','น้ำมัน','◈'],['uup','ดอลลาร์','$']];
let host, openDetail, flows, daily, crypto, drill=null, group=null, coin=null, busy=false, timer, paused=false;
export function initBrief(element,onOpen){
  host=element;openDetail=onOpen;
  host.innerHTML='<p class="sb-loading" role="status">กำลังสรุปภาพตลาดล่าสุด…</p>';
  host.addEventListener('click',event=>{
    const asset=event.target.closest('[data-brief-asset]');
    if(asset){if(asset.dataset.briefAsset==='crypto'){drill='crypto';group=null;coin=null;renderDrill();}else if(asset.dataset.briefAsset==='spy'){drill='stocks';renderDrill();}else openDetail('daily',asset.dataset.briefAsset);}
    const subgroup=event.target.closest('[data-crypto-group]');if(subgroup){group=subgroup.dataset.cryptoGroup;coin=null;renderDrill();}
    const item=event.target.closest('[data-crypto-coin]');if(item){coin=item.dataset.cryptoCoin;renderDrill();}
    if(event.target.closest('[data-drill-close]')){const previous=drill;drill=null;renderDrill();host.querySelector(`[data-brief-asset=${previous==='crypto'?'crypto':'spy'}]`)?.focus({preventScroll:true});}
    if(event.target.closest('[data-drill-back]')){if(coin)coin=null;else group=null;renderDrill();}
    const stock=event.target.closest('[data-stock-detail]');if(stock)openDetail('daily',stock.dataset.stockDetail);
    const flow=event.target.closest('[data-brief-flows]');if(flow)openDetail('flows',flow.dataset.briefFlows,flow.dataset.briefMarket);
    if(event.target.closest('[data-brief-daily]'))openDetail('daily');
    if(event.target.closest('[data-brief-pause]')){paused=!paused;host.classList.toggle('sb-paused',paused);const b=host.querySelector('[data-brief-pause]');b.setAttribute('aria-pressed',String(paused));b.textContent=paused?'เล่นภาพเคลื่อนไหว':'หยุดภาพเคลื่อนไหว';}
  });
  refreshBrief();
}
export function setBriefActive(active){
  if(!host)return;clearInterval(timer);host.classList.toggle('sb-inactive',!active);
  if(active)timer=setInterval(refreshBrief,60000);
}
async function read(url){const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('source');return response.json();}
export async function refreshBrief(){
  if(!host||busy)return;busy=true;
  const results=await Promise.allSettled([read('/api/v1/sentiment?universe=us'),read('/api/v1/sentiment/daily'),read('/api/v1/sentiment/crypto-breakdown')]);
  const snapshot=()=>JSON.stringify([flows,daily?.markets.map(({checkedAt,...m})=>m),crypto]);
  const previous=snapshot();
  if(results[0].status==='fulfilled')flows=results[0].value;else if(flows)flows={...flows,stale:true};
  if(results[1].status==='fulfilled')daily=results[1].value;else if(daily)daily={...daily,markets:daily.markets.map(m=>({...m,stale:true}))};
  if(results[2].status==='fulfilled')crypto=results[2].value;else if(crypto)crypto={...crypto,stale:true};
  if(previous!==snapshot()||!host.querySelector('.sb-morning'))render();
  busy=false;
}
function flowSummary(){
  if(!flows)return '<div class="sb-unavailable"><h2>ยังอ่านรายงานเงินไหลไม่ได้</h2><p>ดูราคาล่าสุดด้านล่างได้ แล้วกดตรวจข้อมูลเพื่อลองอีกครั้ง</p></div>';
  const {i,rows,into,out,max,total}=briefFlowState(flows);
  return `<div class="sb-report"><span>เงินกองทุนล่าสุด</span><span>กองทุนสหรัฐ · สัปดาห์สิ้นสุด ${date(flows.periods[i])}</span>${flows.stale?'<b>ข้อมูลที่เก็บไว้ · ตรวจต้นทางไม่สำเร็จ</b>':''}</div>
  <section class="sb-flow-stage" aria-label="สรุปเงินเข้าหรือออกตามรายงานกองทุนสหรัฐล่าสุด"><div class="sb-takeaway"><p class="sb-eyebrow">${into?'เงินไหลเข้าสูงสุด':'ไม่มีหมวดเงินเข้าสุทธิ'}</p><h2 class="sb-positive">${into?labels[into.id]:'—'}<span aria-hidden="true">↗</span></h2><p class="sb-exit">${out?`เงินไหลออกสูงสุด <strong>${labels[out.id]}</strong>`:'ไม่มีหมวดเงินออกสุทธิ'}</p><div class="sb-net"><span>รวมทุกหมวด</span><b>${total<0?'ถอนสุทธิ':'เข้าสุทธิ'} ${usd(total)}</b></div><a href="${esc(flows.source)}" target="_blank" rel="noopener noreferrer">ICI · เผยแพร่ ${date(flows.publishedAt)} ↗</a></div>
  <div class="sb-lanes">${rows.map((m,index)=>`<button class="sb-lane ${m.value<0?'sb-negative':'sb-positive'}" data-brief-flows="us" data-brief-market="${m.id}" style="--delay:${index*75}ms;--extent:${Math.abs(m.value)/max*100}%" aria-label="${labels[m.id]} เงิน${m.value===0?'สุทธิ':m.value<0?'ออก':'เข้า'} ${usd(m.value)} ดูรายงาน"><span class="sb-lane-heading"><strong>${labels[m.id]}</strong><span>${m.value===0?'สุทธิ':m.value<0?'ออก':'เข้า'} <b>${usd(m.value)}</b><i aria-hidden="true">${m.value<0?'↙':'↗'}</i></span></span><span class="sb-track" aria-hidden="true"><span class="sb-stream"></span></span></button>`).join('')}<div class="sb-flow-caption"><span>เงินไหลสุทธิ (USD)</span><button data-brief-pause aria-pressed="${paused}">${paused?'เล่นภาพเคลื่อนไหว':'หยุดภาพเคลื่อนไหว'}</button></div></div></section>`;
}
function render(){
  const focus=host.contains(document.activeElement)?document.activeElement:null,asset=focus?.dataset.briefAsset;
  host.innerHTML=`<div class="sb-morning"><div class="sb-title"><div><h2>ภาพรวมตลาด</h2></div><span>${new Date().toLocaleDateString('th-TH',{day:'numeric',month:'long',timeZone:'Asia/Bangkok'})}</span></div>${flowSummary()}
  <section class="sb-prices" aria-label="ราคาล่าสุดของตลาดหลัก"><div class="sb-prices-heading"><h3>ตลาดหลัก</h3></div><div class="sb-price-grid">${assets.map(([id,name,mark])=>{
    const m=daily?.markets.find(m=>m.id===id),day=m?.days?.findLast(d=>d.close!==null),value=day?.change,unavailable=!m||m.error||value==null;
    const aged=day&&Date.now()-Date.parse(day.date)>(m.category==='crypto'?2:5)*86400000;
    return `<button data-brief-asset="${id}" ${id==='spy'?`aria-expanded="${drill==='stocks'}"`:''} class="sb-price ${unavailable||m.stale||aged?'sb-quiet':value<0?'sb-negative':'sb-positive'}" aria-label="${name} ${unavailable?'ยังไม่มีราคา':pct(value)} เปิดกราฟย้อนหลัง"><span><i class="sb-asset-mark" aria-hidden="true">${mark}</i>${name}${id==='spy'?'<i class="sb-expand">＋</i>':''}</span><strong>${pct(unavailable?null:value)}</strong><small>${unavailable?'ยังอ่านไม่ได้':m.stale?'ข้อมูลที่เก็บไว้':aged?'รอข้อมูลใหม่':value<0?'ราคาลง':value>0?'ราคาขึ้น':'ราคาเท่าเดิม'}</small><time>${day?date(day.date)+(day.provisional?' · ระหว่างวัน':' · ปิดวัน'):'—'}</time><span class="sb-price-arrow" aria-hidden="true">↗</span></button>`;
  }).join('')}<button data-brief-asset="crypto" class="sb-price ${!crypto||crypto.stale?'sb-quiet':crypto.change<0?'sb-negative':'sb-positive'}" aria-expanded="${drill==='crypto'}"><span><i class="sb-asset-mark" aria-hidden="true">₿</i>คริปโต <i class="sb-expand">＋</i></span><strong>${pct(crypto?.change)}</strong><small>${!crypto?'ยังอ่านไม่ได้':crypto.stale?'ข้อมูลที่เก็บไว้':crypto.change<0?'มูลค่าตลาดลด':'มูลค่าตลาดเพิ่ม'}</small><time>24 ชม. · ${crypto?crypto.count+' เหรียญ':'กำลังรอข้อมูล'}</time></button></div><div class="sb-drill" ${drill?'':'hidden'}></div><p class="sb-price-note">ETF: ราคาเทียบวันก่อน · คริปโต: มูลค่าตลาดเทียบ 24 ชม.</p></section>
  <div class="sb-more"><button data-brief-daily>ผลตอบแทน 7 วัน <span>↗</span></button><button data-brief-flows="global">เงินไหลทั่วโลก <span>↗</span></button></div></div>`;
  renderDrill(false);
  if(asset)host.querySelector(`[data-brief-asset="${asset}"]`)?.focus({preventScroll:true});
}

export function briefFlowState(dataset){
  const i=dataset.periods.length-1;
  const rows=dataset.markets.map(m=>({...m,value:m.values[i]})).filter(m=>m.value!==null).sort((a,b)=>Number(b.value>0)-Number(a.value>0)||Math.abs(b.value)-Math.abs(a.value));
  return {i,rows,into:rows.find(m=>m.value>0),out:rows.find(m=>m.value<0),max:Math.max(1,...rows.map(m=>Math.abs(m.value))),total:dataset.total[i]};
}

const amount=value=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2,style:'currency',currency:'USD'}).format(value);
function renderDrill(focus=true){
  const panel=host.querySelector('.sb-drill');if(!panel)return;host.querySelector('[data-brief-asset=crypto]')?.setAttribute('aria-expanded',String(drill==='crypto'));host.querySelector('[data-brief-asset=spy]')?.setAttribute('aria-expanded',String(drill==='stocks'));panel.hidden=!drill;if(!drill)return;
  const close='<button data-drill-close aria-label="ปิดรายละเอียดตลาด">×</button>';
  if(drill==='stocks'){
    panel.innerHTML=`<div class="sb-drill-head"><h3>หุ้น · แยกตามตลาด</h3>${close}</div><div class="sb-crypto-groups">${['spy','efa','eem'].map(id=>{const m=daily?.markets.find(m=>m.id===id),d=m?.days?.findLast(d=>d.close!==null);return `<button data-stock-detail="${id}"><strong>${esc(m?.name??id)}</strong><b class="${d?.change<0?'sb-negative':'sb-positive'}">${pct(d?.change)}</b><small>${d?date(d.date)+' · เทียบวันซื้อขายก่อน':'ยังไม่มีข้อมูล'}</small><span>ผลตอบแทน 7 วัน ↗</span></button>`;}).join('')}</div><p class="sb-drill-note">ราคา ETF อ้างอิงแต่ละตลาด</p>`;
  }else if(!crypto){panel.innerHTML=`<div class="sb-drill-head"><h3>คริปโต</h3>${close}</div><p>ยังอ่านองค์ประกอบตลาดไม่ได้ กดตรวจข้อมูลด้านบนเพื่อลองอีกครั้ง</p>`;}
  else{
    const negative=crypto.delta<0,denominator=negative?crypto.loss:crypto.gain,side=negative?'ลดลง':'เพิ่มขึ้น';panel.style.setProperty('--sb-direction',negative?'var(--sf-out)':'var(--sf-in)');
    const all=crypto.groups.flatMap(g=>g.coins),selectedGroup=crypto.groups.find(g=>g.id===group),selectedCoin=all.find(c=>c.id===coin);
    const contribution=c=>denominator?Math.max(0,negative?-c.delta:c.delta)/denominator*100:0;
    const driver=[...all].sort((a,b)=>contribution(b)-contribution(a))[0];
    const back=group||coin?'<button data-drill-back aria-label="กลับระดับก่อนหน้า">←</button>':'';
    let body;
    if(selectedCoin){
      body=`<div class="sb-coin-summary"><div><span>มูลค่าตลาด</span><strong>${amount(selectedCoin.cap)}</strong></div><div><span>มูลค่าตลาดเปลี่ยน</span><strong>${selectedCoin.delta<0?'−':'+'}${amount(Math.abs(selectedCoin.delta))}</strong></div><div><span>สัดส่วนมูลค่าที่${side}ทั้งหมด</span><strong>${contribution(selectedCoin).toFixed(1)}%</strong></div></div><a class="sb-coin-link" href="https://www.coingecko.com/en/coins/${encodeURIComponent(selectedCoin.id)}" target="_blank" rel="noopener noreferrer">ดู ${esc(selectedCoin.name)} บน CoinGecko ↗</a>`;
    }else if(selectedGroup){
      const list=[...selectedGroup.coins].sort((a,b)=>contribution(b)-contribution(a)||b.cap-a.cap);
      const row=c=>`<button class="sb-coin-row" data-crypto-coin="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.symbol)}</small></span><span class="${c.priceChange<0?'sb-negative':'sb-positive'}">${pct(c.priceChange)}<small>ราคา 24 ชม.</small></span><b>${contribution(c).toFixed(1)}%<small>ของมูลค่าที่${side}</small></b><i>↗</i></button>`;
      body=`<p class="sb-drill-sub">${selectedGroup.coins.length} เหรียญ · เรียงตามส่วนที่ทำให้มูลค่า${side}</p><div class="sb-coin-list">${list.slice(0,8).map(row).join('')}${list.length>8?`<details><summary>ดูอีก ${list.length-8} เหรียญ</summary>${list.slice(8).map(row).join('')}</details>`:''}</div>`;
    }else{
      body=`<p class="sb-driver">${denominator?`<strong>${esc(driver.name)}</strong> คิดเป็น <b>${contribution(driver).toFixed(0)}%</b> ของมูลค่าที่${side}`:'มูลค่าตลาดยังไม่เปลี่ยนในชุดข้อมูลนี้'}</p><div class="sb-crypto-groups">${crypto.groups.map(g=>`<button data-crypto-group="${g.id}"><strong>${g.name} <span>↗</span></strong><b class="${g.change<0?'sb-negative':'sb-positive'}">${pct(g.change)}</b><small>มูลค่าตลาด · 24 ชม.</small><span class="sb-contribution"><i style="width:${denominator?(negative?g.loss:g.gain)/denominator*100:0}%"></i></span><span>${denominator?((negative?g.loss:g.gain)/denominator*100).toFixed(0):'0'}% ของมูลค่าที่${side}</span></button>`).join('')}</div>`;
    }
    panel.innerHTML=`<div class="sb-drill-head"><div>${back}<h3>คริปโต${selectedGroup?' / '+selectedGroup.name:''}${selectedCoin?' / '+esc(selectedCoin.name):''}</h3></div>${close}</div>${crypto.stale?'<p class="sb-negative">ตรวจต้นทางไม่สำเร็จ · ใช้ข้อมูลที่เก็บไว้</p>':''}${body}<p class="sb-drill-note">${crypto.count} เหรียญจาก Top 100 · ไม่รวม Stablecoins · <a href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">CoinGecko ↗</a> · ข้อมูล ${new Date(crypto.observedAt).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p><details class="sb-calculation"><summary>วิธีคำนวณสัดส่วน</summary><p>สัดส่วนใช้ผลรวมมูลค่าที่${side}ของเหรียญฝั่งนั้น ไม่ใช่เงินไหลหรือสัดส่วนการซื้อขาย · Altcoins ไม่รวม BTC และ ETH</p></details>`;
  }
  if(focus){panel.querySelector('[data-drill-back], [data-drill-close]')?.focus({preventScroll:true});panel.scrollIntoView({block:'nearest',behavior:'instant'});}
}
