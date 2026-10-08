const labels={
  'us-stocks':'หุ้นสหรัฐ', 'developed-stocks':'หุ้นพัฒนาแล้วนอกสหรัฐ', 'emerging-stocks':'หุ้นเกิดใหม่',
  bonds:'พันธบัตรสหรัฐ 10 ปี', gold:'ทองคำ', oil:'น้ำมัน WTI', bitcoin:'Bitcoin', ethereum:'Ether',
};
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const date=value=>new Date(value).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric',calendar:'gregory',timeZone:'UTC'});
const signed=(value,unit)=>value==null?'—':(value>0?'+':value<0?'−':'')+Math.abs(value).toFixed(2)+' '+unit;
const change=(market,i)=>i>0&&market.values[i]!=null&&market.values[i-1]!=null?market.values[i]-market.values[i-1]:null;
let host,data,selected='us-stocks',period=0,busy=false,timer;

export function initPositioning(element){
  host=element;
  host.addEventListener('click',event=>{
    const row=event.target.closest('[data-position-market]');
    if(row){selected=row.dataset.positionMarket;render();host.querySelector('[data-position-market="'+selected+'"]')?.focus({preventScroll:true});}
  });
  host.addEventListener('change',event=>{
    if(event.target.matches('[data-position-period]')){period=Number(event.target.value);render();}
  });
  refreshPositioning();
}
export function setPositioningActive(active){
  clearInterval(timer);
  if(active&&host)timer=setInterval(refreshPositioning,60000);
}
export function selectPositionMarket(id){
  selected=id;
  if(data)render();
}
export async function refreshPositioning(){
  if(!host||busy)return;
  busy=true;
  if(!data)host.innerHTML=skeletonUI('market-positioning','กำลังอ่านสถานะฟิวเจอร์สจาก CFTC…');
  try{
    const response=await fetch('/api/v1/sentiment/positioning',{signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('source');
    const next=await response.json();
    if(next.error)throw Error('source');
    const latest=!data||period===data.periods.length-1;
    data=next;
    period=latest||period>=data.periods.length?data.periods.length-1:period;
    if(!data.markets.some(m=>m.id===selected))selected=data.markets[0].id;
  }catch{
    if(data)data={...data,stale:true};
    else{host.innerHTML='<div class="sp-unavailable"><h2>ยังอ่านข้อมูล CFTC ไม่ได้</h2><p>ตลาดหลักด้านล่างยังแสดงข้อมูลราคาแยกตามต้นทาง</p></div>';busy=false;return;}
  }
  render();
  busy=false;
}
function render(){
  if(!host||!data)return;
  const rows=data.markets.map(m=>({...m,delta:change(m,period),net:m.values[period]})).filter(m=>m.delta!=null);
  const ordered=[...rows].sort((a,b)=>b.delta-a.delta);
  const up=ordered.find(m=>m.delta>0),down=ordered.findLast(m=>m.delta<0),max=Math.max(1,...rows.map(m=>Math.abs(m.delta)));
  const market=data.markets.find(m=>m.id===selected),point=market?.positions[period],delta=market?change(market,period):null;
  const aged=Date.now()-Date.parse(data.periods.at(-1))>12*86400000;
  host.innerHTML='<div class="sp-head"><div><h2>สถานะฟิวเจอร์ส</h2><p>การเปลี่ยนแปลงสถานะสุทธิของผู้เก็งกำไร · รายสัปดาห์</p></div><label>สัปดาห์ข้อมูล <select data-position-period aria-label="สัปดาห์ข้อมูล">'+data.periods.slice(1).map((p,i)=>'<option value="'+(i+1)+'" '+(period===i+1?'selected':'')+'>'+date(p)+'</option>').join('')+'</select></label></div>'+
    '<p class="sp-meta '+(data.stale||aged?'sp-warning':'')+'">ข้อมูล ณ '+date(data.periods[period])+' · '+(data.stale?'ใช้ข้อมูลล่าสุดที่บันทึกไว้':aged?'CFTC ยังไม่มีรอบใหม่':'CFTC')+'</p>'+
    '<div class="sp-leaders"><div class="sp-leader"><span>สถานะเพิ่มมากสุด</span><strong>'+esc(labels[up?.id]??'—')+'</strong><b class="sp-positive">'+signed(up?.delta,'จุด')+'</b></div><div class="sp-leader"><span>สถานะลดมากสุด</span><strong>'+esc(labels[down?.id]??'—')+'</strong><b class="sp-negative">'+signed(down?.delta,'จุด')+'</b></div></div>'+
    '<div class="sp-grid"><section class="sp-board" aria-label="เปรียบเทียบการเปลี่ยนสถานะ"><div class="sp-board-head"><h3>เทียบรายงานก่อนหน้า</h3><span>จุดเปอร์เซ็นต์ของ Open Interest</span></div>'+
    ordered.map(m=>'<button class="sp-row '+(m.delta<0?'sp-negative':'sp-positive')+'" data-position-market="'+esc(m.id)+'" aria-pressed="'+(m.id===selected)+'" aria-label="'+esc(labels[m.id])+' '+signed(m.delta,'จุดเปอร์เซ็นต์')+' เปิดรายละเอียด"><span>'+esc(labels[m.id])+'</span><i class="sp-track" style="--extent:'+Math.abs(m.delta)/max*48+'%"><em></em></i><b>'+signed(m.delta,'จุด')+'</b></button>').join('')+
    '</section><aside class="sp-detail"><span class="sp-kicker">สถานะสุทธิ</span><h3>'+esc(labels[selected])+'</h3><strong class="'+(market?.values[period]==null?'':market.values[period]<0?'sp-negative':'sp-positive')+'">'+signed(market?.values[period],'% OI')+'</strong><p>Long − Short เทียบกับ Open Interest<br> เทียบรายงานก่อนหน้า '+signed(delta,'จุด')+'</p>'+
    (point?'<dl><div><dt>Long</dt><dd>'+point.long.toLocaleString('en-US')+' สัญญา</dd></div><div><dt>Short</dt><dd>'+point.short.toLocaleString('en-US')+' สัญญา</dd></div><div><dt>Open Interest</dt><dd>'+point.openInterest.toLocaleString('en-US')+' สัญญา</dd></div></dl>':'<p>ไม่มีข้อมูลสัปดาห์นี้</p>')+
    '<div class="sp-history" aria-label="สถานะสุทธิย้อนหลัง">'+(market?.values.map((value,i)=>value==null?'<span title="'+date(data.periods[i])+' · ไม่มีข้อมูล"></span>':'<span title="'+date(data.periods[i])+' · '+signed(value,'% OI')+'" class="'+(value<0?'sp-negative':'sp-positive')+'"><i style="height:'+Math.max(4,Math.min(100,Math.abs(value)*2))+'%"></i></span>').join('')??'')+'</div><small>ข้อมูลรายวันและราคาตลาดอยู่ในแท็บย้อนหลัง 7 วัน</small></aside></div>'+
    '<p class="sp-foot"><a href="'+esc(data.source)+'" target="_blank" rel="noopener noreferrer">CFTC Commitments of Traders ↗</a><span>สัญญาฟิวเจอร์ส 8 ตลาด · รายงานวันอังคาร เผยแพร่ตามรอบ CFTC</span></p>'+
    '<p class="sp-note">ตัวเลขนี้คือสถานะฟิวเจอร์สของผู้เก็งกำไรในสัญญาที่ระบุ ไม่ใช่เงินดอลลาร์ไหลเข้าหรือออกจากตลาด และไม่ครอบคลุมการซื้อขายทั้งหมด</p>';
}
