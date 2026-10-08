const pct = value => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}%`;
const price = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
const shortDate = value => new Date(value).toLocaleDateString('th-TH',{day:'numeric',month:'short',timeZone:'UTC'});
const checked = value => new Date(value).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',calendar:'gregory'});
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const tone = value => value == null ? 'sd-missing' : value < 0 ? 'sd-down' : value > 0 ? 'sd-up' : 'sd-flat';
const glyph = market => ({gold:'Au',crypto:market.id==='btc'?'₿':'Ξ',equity:'↗',bond:'≋',commodity:'◈',property:'▤',currency:'$'})[market.category];
let host, payload, selection='gld', active=false, loading=false, timer, focusDay=null;
const q = selector => host.querySelector(selector);
export function initDaily(element){
  host=element;
  host.innerHTML='<p class="sd-loading" role="status">กำลังอ่านข้อมูลรายวันจากแต่ละตลาด…</p>';
  host.addEventListener('click',event=>{
    const asset=event.target.closest('[data-daily-asset]');
    if(asset){selection=asset.dataset.dailyAsset;focusDay=null;renderDetail();host.querySelectorAll('[data-daily-asset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dailyAsset===selection)));}
    const day=event.target.closest('[data-daily-day]');
    if(day){focusDay=Number(day.dataset.dailyDay);renderDetail();q(`[data-daily-day="${focusDay}"]`)?.focus();}
    if(event.target.closest('[data-daily-latest]')){focusDay=null;renderDetail();}
  });
  refreshDaily();
}
export function setDailyActive(value){active=value;clearInterval(timer);if(active)timer=setInterval(refreshDaily,60000);}
export async function refreshDaily(){
  if(!host||loading)return;loading=true;
  try{
    const r=await fetch('/api/v1/sentiment/daily',{signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw new Error(r.status===401?'กรุณาเข้าสู่ระบบอีกครั้ง':'อ่านข้อมูลรายวันไม่สำเร็จ');
    const next=await r.json();
    // Preserve the selected asset/day and focused control when polling finds no new prices.
    const prices=data=>JSON.stringify(data.markets.map(({checkedAt,...market})=>market));
    const changed=!payload||prices(payload)!==prices(next);
    const focused=host.contains(document.activeElement)?document.activeElement:null;
    const focusSelector=focused?.dataset.dailyAsset?`[data-daily-asset="${focused.dataset.dailyAsset}"]`:focused?.dataset.dailyDay?`[data-daily-day="${focused.dataset.dailyDay}"]`:null;
    payload=next;
    if(changed){render();if(focusSelector)q(focusSelector)?.focus({preventScroll:true});}
    else if(q('.sd-sync')){q('.sd-sync').textContent=`ตรวจข้อมูลล่าสุด ${checked(payload.retrievedAt)}`;q('.sd-sync').classList.remove('sd-down');const sourceCheck=q('.sd-chart-source>span small');if(sourceCheck)sourceCheck.textContent=`ตรวจ ${checked(payload.markets.find(m=>m.id===selection).checkedAt)}`;}
  }catch(error){
    if(payload&&q('.sd-sync')){q('.sd-sync').textContent='ตรวจข้อมูลรอบใหม่ไม่สำเร็จ · กำลังแสดงข้อมูลล่าสุดที่บันทึกไว้';q('.sd-sync').classList.add('sd-down');}
    else host.innerHTML=`<div class="sd-empty" role="status"><h2>ยังเชื่อมข้อมูลรายวันไม่ได้</h2><p>${esc(error.message)} · กดปุ่มตรวจข้อมูลด้านบนเพื่อลองอีกครั้ง</p></div>`;
  }finally{loading=false;}
}
function miniLine(market){
  const points=market.days.filter(d=>d.relative!==null);if(points.length<2)return '';
  const min=Math.min(...points.map(p=>p.relative)),max=Math.max(...points.map(p=>p.relative)),span=Math.max(.1,max-min);
  return `<svg viewBox="0 0 100 32" class="sd-spark" aria-hidden="true"><polyline points="${market.days.flatMap((d,i)=>d.relative===null?[]:[`${i/6*98+1},${28-(d.relative-min)/span*24}`]).join(' ')}"/></svg>`;
}
function render(){
  const available=payload.markets.filter(m=>!m.error&&m.change7!==null);
  if(!available.length){host.innerHTML='<div class="sd-empty" role="status"><h2>ต้นทางยังไม่ส่งข้อมูลที่ใช้เปรียบเทียบได้</h2><p>กดตรวจข้อมูลอีกครั้ง หรือดูสถานะฟิวเจอร์ส</p></div>';return;}
  if(!available.some(m=>m.id===selection))selection=available[0].id;
  const ranked=[...available].sort((a,b)=>b.change7-a.change7),leader=ranked[0],laggard=ranked.at(-1),up=available.filter(m=>m.change7>0).length,down=available.filter(m=>m.change7<0).length;
  const dates=available[0].days.map(d=>d.date);
  host.innerHTML=`<div class="sd-intro"><div><h2>ผลตอบแทน 7 วัน</h2></div><span class="sd-range">${shortDate(dates[0])} — ${shortDate(dates.at(-1))}</span></div>
  <div class="sd-overview"><section class="sd-chart-card" aria-label="กราฟราคาตลาดที่เลือก"></section><aside class="sd-reading"><div class="sd-breadth"><h3>ภาพรวมราคา</h3><div class="sd-breadth-number"><strong>${up}<small>/${available.length}</small></strong><span>สินทรัพย์อ้างอิง<br>ราคาเพิ่มใน 7 วัน</span></div><div class="sd-breadth-bars" aria-hidden="true">${available.map((_,i)=>`<i class="${i<up?'is-up':i<up+down?'is-down':''}"></i>`).join('')}</div><p><span>ขึ้น ${up}</span><span>ลง ${down}</span><span>ทรงตัว ${available.length-up-down}</span></p></div><button class="sd-mover sd-leader" data-daily-asset="${leader.id}" aria-pressed="${leader.id===selection}"><span>ผลตอบแทนสูงสุด <span>↗</span></span><strong>${esc(leader.name)}</strong><b>${pct(leader.change7)}</b><small>${esc(leader.symbol)}</small></button><button class="sd-mover sd-laggard" data-daily-asset="${laggard.id}" aria-pressed="${laggard.id===selection}"><span>ผลตอบแทนต่ำสุด <span>↘</span></span><strong>${esc(laggard.name)}</strong><b class="${tone(laggard.change7)}">${pct(laggard.change7)}</b></button></aside></div>
  <section class="sd-market-board" aria-label="การเปลี่ยนแปลงรายวันย้อนหลังเจ็ดวัน"><div class="sd-board-heading"><div><h2>การเปลี่ยนแปลงรายวัน <span>(%)</span></h2></div><div class="sd-legend"><span><i class="sd-up-dot"></i>ขึ้น</span><span><i class="sd-down-dot"></i>ลง</span><span>— ไม่มีราคา</span></div></div><div class="sd-table-scroll" tabindex="0" aria-label="เลื่อนตารางข้อมูลรายวัน"><table class="sd-market-table"><thead><tr><th scope="col">สินทรัพย์อ้างอิง</th>${dates.map(d=>`<th scope="col">${shortDate(d)}</th>`).join('')}<th scope="col">รวม 7 วัน</th></tr></thead><tbody>${payload.markets.map(m=>m.error?`<tr><th scope="row">${esc(m.name)}<small>${esc(m.symbol)}</small></th><td colspan="8" class="sd-unavailable">อ่านข้อมูลไม่สำเร็จ · ลองใหม่อัตโนมัติ</td></tr>`:`<tr class="${m.id===selection?'is-selected':''}"><th scope="row"><button data-daily-asset="${m.id}" aria-pressed="${m.id===selection}"><span class="sd-asset-mark sd-${m.category}">${glyph(m)}</span><span>${esc(m.name)}<small>${esc(m.symbol)}${m.stale?' · ข้อมูลล่าสุดที่บันทึกไว้':''}</small></span></button></th>${m.days.map(d=>`<td><span class="sd-heat ${tone(d.change)}" style="--strength:${d.change===null?0:Math.min(1,Math.abs(d.change)/3).toFixed(3)}" title="${esc(m.name)} · ${shortDate(d.date)} · ${d.close===null?'ไม่มีราคาในวันนี้':price(d.close)+(d.provisional?' · ระหว่างวัน':' · ปิดวัน')}">${pct(d.change)}${d.provisional?'<sup>•</sup>':''}</span></td>`).join('')}<td><span class="sd-total-return ${tone(m.change7)}">${pct(m.change7)}</span>${miniLine(m)}</td></tr>`).join('')}</tbody></table></div><div class="sd-board-foot"><span>เทียบวันซื้อขายก่อน · • ระหว่างวัน</span><span>ETF ใช้ราคาอ้างอิง · ไม่ใช่เงินไหล</span></div></section><p class="sd-sync" role="status">ตรวจข้อมูลล่าสุด ${checked(payload.retrievedAt)}</p>`;
  renderDetail();
}
function renderDetail(){
  const m=payload.markets.find(m=>m.id===selection);if(!m||m.error)return;
  host.querySelectorAll('.sd-market-table tr').forEach(row=>row.classList.toggle('is-selected',row.querySelector('[data-daily-asset]')?.dataset.dailyAsset===selection));
  const points=m.days.flatMap((d,i)=>d.relative===null?[]:[{...d,i}]);
  const sample=focusDay===null?m.latest:m.days[focusDay],dailyChange=focusDay===null?m.days.findLast(d=>d.change!==null)?.change:sample.change;
  const top=Math.max(1,...points.map(p=>p.relative)),bottom=Math.min(-1,...points.map(p=>p.relative)),range=top-bottom;
  const x=i=>32+i/6*580,y=v=>26+(top-v)/range*164,zero=y(0);
  const path=points.map((p,i)=>`${i?'L':'M'}${x(p.i)},${y(p.relative)}`).join(' '),last=points.at(-1),hover=points.find(p=>p.i===focusDay);
  const color=m.change7<0?'var(--sf-out)':'var(--sf-in)';
  const aged=Date.now()-Date.parse(m.latest.date)>(m.category==='crypto'?2:5)*86400000;
  q('.sd-chart-card').innerHTML=`<div class="sd-chart-heading"><div class="sd-chart-asset"><span class="sd-asset-mark sd-${m.category}">${glyph(m)}</span><div><h3>${esc(m.name)}</h3><p>${esc(m.description)}</p></div></div><span class="sd-chart-tag">${m.stale?'ข้อมูลล่าสุดที่บันทึกไว้':aged?'รอข้อมูลใหม่':sample?.close===null?'ไม่มีราคา':sample?.provisional?'ระหว่างวัน':'ราคาปิดวัน'}</span></div><div class="sd-chart-metrics"><div><strong>${sample?.close?price(sample.close):'—'}</strong><span class="${tone(dailyChange)}">${pct(dailyChange)} <small>เทียบวันก่อน</small></span></div><div class="sd-period-return"><span>ผลตอบแทน 7 วัน</span><b class="${tone(m.change7)}">${pct(m.change7)}</b></div></div><div class="sd-chart-date">${sample?.date?shortDate(sample.date):shortDate(m.days[focusDay].date)}${sample?.provisional?' · ระหว่างวัน':''}${sample?.close===null?' · ไม่มีราคาในวันนี้':''} <button data-daily-latest ${focusDay===null?'hidden':''}>กลับล่าสุด ↗</button></div>
  <div class="sd-chart-frame"><svg class="sd-main-chart" viewBox="0 0 660 224" preserveAspectRatio="none" role="img" aria-label="การเปลี่ยนแปลงราคา ${esc(m.name)} เจ็ดวัน ${pct(m.change7)}" style="--chart-color:${color}"><defs><linearGradient id="sd-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".18"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>${[top,0,bottom].map(v=>`<line class="sd-grid-line ${v===0?'sd-zero':''}" x1="32" x2="612" y1="${y(v)}" y2="${y(v)}"/>`).join('')}${last?`<path d="${path} L${x(last.i)},${zero} L${x(points[0].i)},${zero} Z" fill="url(#sd-fill)"/><path class="sd-price-line" d="${path}"/>${points.map(p=>`<circle cx="${x(p.i)}" cy="${y(p.relative)}" r="${p.i===last.i?4:2.5}" fill="currentColor"/>`).join('')}`:''}${hover?`<line class="sd-crosshair" x1="${x(hover.i)}" x2="${x(hover.i)}" y1="14" y2="202"/><circle cx="${x(hover.i)}" cy="${y(hover.relative)}" r="6" fill="currentColor"/>`:''}</svg>${[top,0,bottom].map(v=>`<span class="sd-axis-label" style="top:${y(v)/224*100}%">${v>0?'+':''}${v.toFixed(1)}%</span>`).join('')}</div>
  <div class="sd-chart-days" role="group" aria-label="เลือกวันบนกราฟ">${m.days.map((d,i)=>`<button data-daily-day="${i}" style="--day-index:${i}" aria-pressed="${focusDay===i}" aria-label="${shortDate(d.date)} ${d.close===null?'ไม่มีราคา':price(d.close)}">${shortDate(d.date)}</button>`).join('')}</div><div class="sd-chart-source"><span><a href="${esc(m.source)}" target="_blank" rel="noopener noreferrer">${esc(m.sourceName)} ↗</a> · ${esc(m.timezone)}<small>ตรวจ ${checked(m.checkedAt)}</small></span><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(m.tradingView)}" target="_blank" rel="noopener noreferrer">เปิด TradingView ↗</a></div><p class="sd-chart-note">เทียบราคาก่อนเริ่มช่วง · ไม่รวมเงินปันผล</p>`;
}

export function selectDailyAsset(id){selection=id;focusDay=null;if(payload)render();}
