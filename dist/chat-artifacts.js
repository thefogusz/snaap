const n = value => typeof value === 'number' && Number.isFinite(value);
const number = value => n(value) ? (Math.abs(value)>0 && Math.abs(value)<1e-6?value.toPrecision(5):value.toLocaleString('en-US', {maximumFractionDigits: Math.abs(value) < 10 ? 8 : 2})) : '—';
const compact = value => n(value) ? new Intl.NumberFormat('en-US', {notation:'compact',maximumFractionDigits:2}).format(value) : '—';
const percent = value => n(value) ? `${value>0?'+':''}${value.toFixed(2)}%` : '—';
const date = value => value != null && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString((globalThis.SnaapI18n?.locale ?? "th-TH"),{dateStyle:'short',timeStyle:'short'}) : (globalThis.SnaapI18n?.text("ไม่ระบุเวลา") ?? "ไม่ระบุเวลา");
const el = (tag, cls, text) => {const node=document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=String(text);return node;};
const short = value => typeof value==='string' && value.length>22 ? value.slice(0,10)+'…'+value.slice(-8) : value;
const colors=['#72bcf7','#67d2ad','#eaba6b'];
const status = value => ({UNAVAILABLE:(globalThis.SnaapI18n?.text("ข้อมูลไม่พร้อม") ?? "ข้อมูลไม่พร้อม"),INSUFFICIENT:(globalThis.SnaapI18n?.text("ข้อมูลไม่ครบ") ?? "ข้อมูลไม่ครบ"),DELAYED:(globalThis.SnaapI18n?.text("ข้อมูลล่าช้า") ?? "ข้อมูลล่าช้า"),CURRENT:(globalThis.SnaapI18n?.text("แท่งปิดล่าสุด") ?? "แท่งปิดล่าสุด"),SOURCE_TIME_UNKNOWN:(globalThis.SnaapI18n?.text("ต้นทางไม่ระบุเวลา") ?? "ต้นทางไม่ระบุเวลา"),OBSERVED:(globalThis.SnaapI18n?.text("พบข้อมูล") ?? "พบข้อมูล"),UP:(globalThis.SnaapI18n?.text("อยู่เหนือ EMA") ?? "อยู่เหนือ EMA"),DOWN:(globalThis.SnaapI18n?.text("อยู่ใต้ EMA") ?? "อยู่ใต้ EMA"),MIXED:(globalThis.SnaapI18n?.text("แนวโน้มผสม") ?? "แนวโน้มผสม")}[value] ?? value);
function link(label,url){
  const node=el('a','',label);
  try {const target=new URL(url);if(target.protocol!=='https:'||target.username||target.password)throw Error();node.href=target.href;node.target='_blank';node.rel='noopener noreferrer';}
  catch {return el('span','',label);}
  return node;
}
function rowsFor(a){
  const d=a.data;
  return d.items.map((item,i)=>{
    const name=item.pair??item.name??item.title??(item.baseToken?item.baseToken.symbol+'/'+item.quoteToken?.symbol:short(item.txid));
    const source=item.exchange??item.chain??item.symbol??d.source??'';
    if(a.kind==='screen_assets')return {name,source,value:a.query.sort==='volume'?item.quoteVolume:a.query.sort==='new'?null:item.changePercent,primary:a.query.sort==='volume'?compact(item.quoteVolume)+' USDT':a.query.sort==='new'?(item.listingBasis==='PROVIDER_LAUNCH'?(globalThis.SnaapI18n?.text("เปิดสัญญา") ?? "เปิดสัญญา"):(globalThis.SnaapI18n?.text("เริ่มพบคู่") ?? "เริ่มพบคู่")):percent(item.changePercent),secondary:`${(globalThis.SnaapI18n?.text("ราคา ") ?? "ราคา ")}${number(item.last)} USDT · ${percent(item.changePercent)}${(globalThis.SnaapI18n?.text(" / 24 ชม.") ?? " / 24 ชม.")}`,direction:['gainers','losers'].includes(a.query.sort)?item.changePercent:null,detail:a.query.sort==='new'?date(item.listedAt??item.firstObservedAt):null};
    if(a.kind==='read_defi_context')return {name,source,value:item.tvlUSD,primary:'$'+compact(item.tvlUSD),url:item.url};
    if(a.kind==='read_dex_pools')return {name,source:source+' · '+item.dex,value:['gainers','losers'].includes(a.query.sort)?item.change24hPercent:a.query.sort==='liquidity'?item.liquidityUSD:item.volume24hUSD,primary:['gainers','losers'].includes(a.query.sort)?percent(item.change24hPercent):'$'+compact(a.query.sort==='liquidity'?item.liquidityUSD:item.volume24hUSD),secondary:`${(globalThis.SnaapI18n?.text("ราคา $") ?? "ราคา $")}${number(item.priceUSD)}${(globalThis.SnaapI18n?.text(" · สภาพคล่อง $") ?? " · สภาพคล่อง $")}${compact(item.liquidityUSD)} · ${percent(item.change24hPercent)}`,detail:`${item.chain} · ${item.pairAddress} · token ${item.baseToken.address} / ${item.quoteToken.address}`,url:item.url};
    if(a.kind==='read_market_news')return {name,source,primary:item.dateBasis==='UPDATED'?(globalThis.SnaapI18n?.text("อัปเดต ") ?? "อัปเดต ")+date(item.updatedAt):date(item.publishedAt),url:item.url};
    if(a.kind==='read_chain_activity')return {name,source,primary:number(item.largestOutputBTC)+' BTC',secondary:`${(globalThis.SnaapI18n?.text("output ใหญ่สุด · ") ?? "output ใหญ่สุด · ")}${date(item.blockTime)}`,detail:item.netAddressBTC!=null?`${(globalThis.SnaapI18n?.text("สุทธิของ address ") ?? "สุทธิของ address ")}${number(item.netAddressBTC)} BTC`:null,url:item.url};
    if(a.kind==='read_evm_transfers')return {name,source,primary:(item.amountTokens??item.amountRaw)+(item.amountTokens==null?' raw':' tokens'),secondary:`block ${item.blockNumber}${(globalThis.SnaapI18n?.text(" · ไม่ระบุเวลารายธุรกรรม") ?? " · ไม่ระบุเวลารายธุรกรรม")}`,detail:`${item.from} → ${item.to}`,url:item.url};
    if(a.kind==='analyze_assets')return {name,source,primary:status(item.status),secondary:item.metrics?`${status(item.trend)} · RSI ${number(item.metrics.rsi14)}${(globalThis.SnaapI18n?.text(" · ราคา ") ?? " · ราคา ")}${number(item.metrics.close)}`:(globalThis.SnaapI18n?.text("ยังวิเคราะห์ไม่ได้") ?? "ยังวิเคราะห์ไม่ได้"),detail:item.metrics?`EMA20 ${number(item.metrics.ema20)} · EMA50 ${number(item.metrics.ema50)} · ATR14 ${number(item.metrics.atr14)}${(globalThis.SnaapI18n?.text(" · วอลุ่ม ×") ?? " · วอลุ่ม ×")}${number(item.metrics.volumeRatio20)}`:null};
    if(a.kind==='comparison')return {name,source,primary:number(item.last)+' '+item.pair.split('/')[1],secondary:`${percent(item.changePercent)}${(globalThis.SnaapI18n?.text(" / 24 ชม. · วอลุ่ม ") ?? " / 24 ชม. · วอลุ่ม ")}${compact(item.quoteVolume)} ${item.pair.split('/')[1]}`,direction:item.changePercent,detail:status(item.status)};
    return {name,source,primary:status(item.status),secondary:item.points?.length?`${item.points.length}${(globalThis.SnaapI18n?.text(" แท่ง · ล่าสุด ") ?? " แท่ง · ล่าสุด ")}${number(item.points.at(-1).close)}`:(globalThis.SnaapI18n?.text("ไม่มีแท่งราคาที่ตรวจสอบได้") ?? "ไม่มีแท่งราคาที่ตรวจสอบได้")};
  });
}
function scope(a){
  if(a.kind==='screen_assets')return `${(globalThis.SnaapI18n?.text("เฉพาะคู่ USDT · ") ?? "เฉพาะคู่ USDT · ")}${a.data.market}${(globalThis.SnaapI18n?.text(" · 24 ชม. ย้อนหลัง") ?? " · 24 ชม. ย้อนหลัง")}${a.query.exchange==='all'?(globalThis.SnaapI18n?.text(" · เลือกกระดานวอลุ่มสูงสุดต่อคู่ ไม่รวมวอลุ่มข้ามกระดาน") ?? " · เลือกกระดานวอลุ่มสูงสุดต่อคู่ ไม่รวมวอลุ่มข้ามกระดาน"):''}${a.data.category==='stocks'?(globalThis.SnaapI18n?.text(" · สัญญาอ้างอิง/โทเคนหุ้น") ?? " · สัญญาอ้างอิง/โทเคนหุ้น"):''}${a.query.theme==='meme'?(globalThis.SnaapI18n?.text(" · เฉพาะเหรียญที่กระดานติดหมวด Meme") ?? " · เฉพาะเหรียญที่กระดานติดหมวด Meme"):''}${a.query.sort==='new'?(globalThis.SnaapI18n?.text(" · วันเปิดสัญญาหรือเริ่มพบคู่ ไม่ใช่วันสร้างเหรียญ") ?? " · วันเปิดสัญญาหรือเริ่มพบคู่ ไม่ใช่วันสร้างเหรียญ"):''}`;
  if(a.kind==='history')return (a.data.items.filter(i=>i.points?.length).length>1?(globalThis.SnaapI18n?.text("ราคาเทียบฐาน 100 ณ เวลาเริ่มร่วมกัน") ?? "ราคาเทียบฐาน 100 ณ เวลาเริ่มร่วมกัน"):(globalThis.SnaapI18n?.text("ราคาจากแท่งปิด") ?? "ราคาจากแท่งปิด"))+` · ${a.data.timeframe}${(globalThis.SnaapI18n?.text(" · แกนเวลา UTC") ?? " · แกนเวลา UTC")}`;
  if(a.kind==='comparison')return (globalThis.SnaapI18n?.text("ราคาแต่ละคู่และกระดาน · สถิติ 24 ชม. ย้อนหลัง · สัญญาอาจต่างกัน") ?? "ราคาแต่ละคู่และกระดาน · สถิติ 24 ชม. ย้อนหลัง · สัญญาอาจต่างกัน");
  if(a.kind==='analyze_assets')return `${(globalThis.SnaapI18n?.text("แท่งปิด ") ?? "แท่งปิด ")}${a.data.timeframe}${(globalThis.SnaapI18n?.text(" · EMA/RSI/ATR · ไม่ใช่การทำนาย") ?? " · EMA/RSI/ATR · ไม่ใช่การทำนาย")}`;
  if(a.kind==='read_market_news')return `${(globalThis.SnaapI18n?.text("พาดหัวจากผู้เผยแพร่ · ") ?? "พาดหัวจากผู้เผยแพร่ · ")}${a.data.windowHours}${(globalThis.SnaapI18n?.text(" ชม. ย้อนหลัง · ครอบคลุมเฉพาะแหล่งที่รองรับ") ?? " ชม. ย้อนหลัง · ครอบคลุมเฉพาะแหล่งที่รองรับ")}`;
  if(a.kind==='read_dex_pools')return (globalThis.SnaapI18n?.text("เฉพาะพูลที่ค้นพบ · หน่วย USD · ไม่ระบุเวลาต้นทาง · ยังตั้งสัญญาณกับพูลไม่ได้") ?? "เฉพาะพูลที่ค้นพบ · หน่วย USD · ไม่ระบุเวลาต้นทาง · ยังตั้งสัญญาณกับพูลไม่ได้");
  if(a.kind==='read_defi_context')return (globalThis.SnaapI18n?.text("TVL หน่วย USD · ไม่ระบุเวลาต้นทาง · ไม่ใช่เงินไหลเข้าหรือการซื้อ") ?? "TVL หน่วย USD · ไม่ระบุเวลาต้นทาง · ไม่ใช่เงินไหลเข้าหรือการซื้อ");
  return (globalThis.SnaapI18n?.text("หลักฐานการโอน · ไม่ทราบเจ้าของ · ไม่ยืนยันการซื้อหรือสะสม") ?? "หลักฐานการโอน · ไม่ทราบเจ้าของ · ไม่ยืนยันการซื้อหรือสะสม");
}
function seriesFor(a){
  const valid=a.data.items.filter(i=>i.points?.length && ['CURRENT','DELAYED'].includes(i.status));
  if(valid.length<2)return valid.map(i=>({...i,values:i.points.map(p=>({time:p.time/1000,value:p.close}))}));
  const times=valid.slice(1).map(i=>new Set(i.points.map(p=>p.time)));
  const start=valid[0].points.find(p=>times.every(set=>set.has(p.time)))?.time;
  if(start==null)return [];
  return valid.map(i=>{const base=i.points.find(p=>p.time===start).close;return {...i,values:i.points.filter(p=>p.time>=start).map(p=>({time:p.time/1000,value:p.close/base*100}))};});
}
const activeCharts=new Map();
let removalObserver;
let removalFrame;
function disposeCharts(){for(const [host,chart] of activeCharts)if(!host.isConnected){chart.remove();activeCharts.delete(host);}}
function drawHistory(host,a){
  const series=seriesFor(a);
  if(!series.length){host.append(el('p','artifact-empty',(globalThis.SnaapI18n?.text("ไม่มีช่วงราคาที่เปรียบเทียบร่วมกันได้") ?? "ไม่มีช่วงราคาที่เปรียบเทียบร่วมกันได้")));return;}
  const legend=el('div','artifact-legend');
  series.forEach((i,index)=>{const label=el('span','',`${i.pair} · ${i.exchange}${i.status==='DELAYED'?(globalThis.SnaapI18n?.text(" · ล่าช้า") ?? " · ล่าช้า"):''}`);label.style.color=colors[index];legend.append(label);});host.append(legend);
  const chartHost=el('div','artifact-chart');host.append(chartHost);
  const observer=new IntersectionObserver(entries=>{
    if(!entries.some(e=>e.isIntersecting))return;
    observer.disconnect();
    if(!chartHost.isConnected || !window.LightweightCharts)return;
    const dark=document.documentElement.dataset.theme==='dark';
    const chart=window.LightweightCharts.createChart(chartHost,{autoSize:true,height:240,layout:{background:{type:'solid',color:dark?'#191a1c':'#fff'},textColor:dark?'#acb1bc':'#545a66',fontSize:11},grid:{vertLines:{visible:false},horzLines:{color:dark?'#282b30':'#edf0f3'}},timeScale:{timeVisible:true},rightPriceScale:{borderVisible:false},localization:{locale:'en-US'}});
    const lines=series.map((item,index)=>{const first=item.values[0].value, precision=series.length>1?2:first>=1?2:8;const line=chart.addSeries(window.LightweightCharts.LineSeries,{color:colors[index],lineWidth:2,priceFormat:{type:'price',precision,minMove:10**-precision},title:item.pair,lastValueVisible:true});line.setData(item.values);return line;});
    chart.subscribeCrosshairMove(event=>series.forEach((item,index)=>{const value=event.seriesData?.get(lines[index])?.value;legend.children[index].textContent=`${item.pair} · ${item.exchange}${n(value)?' · '+number(value):''}${item.status==='DELAYED'?(globalThis.SnaapI18n?.text(" · ล่าช้า") ?? " · ล่าช้า"):''}`;}));
    chart.timeScale().fitContent();activeCharts.set(chartHost,chart);
    if(!removalObserver){removalObserver=new MutationObserver(()=>{if(!removalFrame)removalFrame=requestAnimationFrame(()=>{removalFrame=null;disposeCharts();});});removalObserver.observe(document.body,{childList:true,subtree:true});}
  });
  observer.observe(chartHost);
  // Stop pending lazy chart observation when an offscreen chat is removed.
  activeCharts.set(chartHost,{remove:()=>observer.disconnect()});
}
function download(blob,name,button){const url=URL.createObjectURL(blob),a=el('a','artifact-download',(globalThis.SnaapI18n?.text("ดาวน์โหลด PNG") ?? "ดาวน์โหลด PNG"));a.href=url;a.download=name;
  if(button)button.after(a);else{a.hidden=true;document.body.append(a);}
  a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},30000);
}
async function exportImage(a){
  const rows=rowsFor(a), history=a.kind==='history'?seriesFor(a):[],height=150+(history.length?300:rows.length*62);
  const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#191a1c';ctx.fillRect(0,0,1100,height);ctx.fillStyle='#f4f5f8';ctx.font='bold 24px sans-serif';ctx.fillText('Snaap · '+a.title,30,44);
  ctx.font='16px sans-serif';ctx.fillStyle='#acb1bc';ctx.fillText(scope(a).slice(0,110),30,78);
  if(history.length){history.forEach((item,index)=>{const values=history.flatMap(i=>i.values.map(p=>p.value)),low=Math.min(...values),high=Math.max(...values),start=Math.min(...history.map(i=>i.values[0].time)),end=Math.max(...history.map(i=>i.values.at(-1).time));ctx.strokeStyle=colors[index];ctx.beginPath();item.values.forEach((p,i)=>{const x=40+(p.time-start)/Math.max(1,end-start)*1000,y=340-(p.value-low)/Math.max(1e-12,high-low)*220;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();ctx.fillStyle=colors[index];ctx.fillText(item.pair+' · '+item.exchange,30+index*350,390);});}
  else rows.forEach((row,i)=>{const y=120+i*62;ctx.fillStyle='#f4f5f8';ctx.font='bold 17px sans-serif';ctx.fillText(`${i+1}. ${String(row.name).slice(0,62)}`,30,y);ctx.textAlign='right';ctx.fillText(String(row.primary).slice(0,50),1070,y);ctx.textAlign='left';ctx.fillStyle='#acb1bc';ctx.font='14px sans-serif';ctx.fillText([row.source,row.secondary].filter(Boolean).join(' · ').slice(0,130),30,y+23);});
  ctx.fillStyle='#acb1bc';ctx.font='14px sans-serif';ctx.fillText((globalThis.SnaapI18n?.text("ข้อมูล ณ ") ?? "ข้อมูล ณ ")+date(a.data.asOf??a.createdAt)+(globalThis.SnaapI18n?.text(" · แหล่ง: ") ?? " · แหล่ง: ")+sourceNames(a),30,height-22);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Image unavailable');
  return blob;
}
function sourceNames(a){return a.data.source??[...new Set([...(a.data.sources??[]).map(s=>s.exchange??s.name??s.symbol),...a.data.items.map(i=>i.exchange)].filter(Boolean))].join(', ');}
function snapshotTime(a){return a.data.asOf??a.data.sources?.find(s=>s.fetchedAt)?.fetchedAt??a.data.items.find(i=>i.fetchedAt)?.fetchedAt??a.createdAt;}
function content(a){
  const body=el('div','artifact-content'),rows=rowsFor(a),barKinds=['screen_assets','read_dex_pools','read_defi_context'];
  if(a.kind==='history')drawHistory(body,a);
  if(!rows.length)body.append(el('p','artifact-empty',(globalThis.SnaapI18n?.text("ไม่พบรายการที่ตรงเงื่อนไขในข้อมูลที่ตรวจสอบได้") ?? "ไม่พบรายการที่ตรงเงื่อนไขในข้อมูลที่ตรวจสอบได้")));
  if(a.kind==='history'){
    const states=el('div','artifact-history-status');a.data.items.forEach(i=>states.append(el('span','',`${i.pair} · ${status(i.status)}${i.bars!=null?' · '+i.bars+'/'+a.data.requestedBars+(globalThis.SnaapI18n?.text(" แท่ง") ?? " แท่ง"):''}${i.historyCoverage==='PARTIAL'?(globalThis.SnaapI18n?.text(" (ประวัติไม่ครบ)") ?? " (ประวัติไม่ครบ)"):''}${i.latestClose?' · '+date(i.latestClose):''}`)));body.append(states);return body;
  }
  const list=el('ol',a.kind==='comparison'||a.kind==='analyze_assets'?'artifact-metrics':'artifact-list');
  const max=Math.max(1,...rows.map(r=>n(r.value)?Math.abs(r.value):0));
  rows.forEach((row,i)=>{
    const item=el('li','artifact-row'),identity=el('div','artifact-identity'),name=el('strong','',row.name);
    if(barKinds.includes(a.kind)){item.classList.add('is-ranked');item.append(el('span','artifact-rank',String(i+1).padStart(2,'0')));}
    identity.append(row.url?link(row.name,row.url):name,el('small','',row.source));
    const metric=el('div','artifact-value'),primary=el('strong','',row.primary);
    if(n(row.direction))primary.classList.add(row.direction>=0?'positive':'negative');
    metric.append(primary);if(row.secondary)metric.append(el('small','',row.secondary));item.append(identity,metric);
    if(barKinds.includes(a.kind) && n(row.value)){const bar=el('span','artifact-bar');bar.setAttribute('aria-hidden','true');bar.style.width=Math.max(1,Math.min(100,Math.abs(row.value)/max*100))+'%';if(row.value<0)bar.classList.add('negative');item.append(bar);}
    if(row.detail){const detail=el('details','artifact-row-detail');detail.append(el('summary','',a.kind==='read_dex_pools'?(globalThis.SnaapI18n?.text("ดูสัญญา / พูล") ?? "ดูสัญญา / พูล"):(globalThis.SnaapI18n?.text("รายละเอียด") ?? "รายละเอียด")),el('p','',row.detail));item.append(detail);}
    list.append(item);
  });body.append(list);
  return body;
}
function details(a){
  const d=a.data,node=el('details','artifact-details');node.append(el('summary','',(globalThis.SnaapI18n?.text("แหล่งข้อมูลและขอบเขต") ?? "แหล่งข้อมูลและขอบเขต")));
  const list=el('ul');
  const notes=[scope(a),`${(globalThis.SnaapI18n?.text("แหล่ง: ") ?? "แหล่ง: ")}${sourceNames(a)||(globalThis.SnaapI18n?.text("ตามรายการ") ?? "ตามรายการ")}${(globalThis.SnaapI18n?.text(" · เวลาดึงข้อมูล ") ?? " · เวลาดึงข้อมูล ")}${date(d.asOf??a.createdAt)}`];
  if(d.sources)notes.push(...d.sources.map(s=>`${s.exchange??s.name??s.symbol}: ${s.status==='READY'?(globalThis.SnaapI18n?.text("พร้อม") ?? "พร้อม"):(globalThis.SnaapI18n?.text("ไม่พร้อม / ไม่รองรับ") ?? "ไม่พร้อม / ไม่รองรับ")}${s.volumeCoverage!=null?(globalThis.SnaapI18n?.text(" · ตรวจ ") ?? " · ตรวจ ")+s.volumeCoverage+(globalThis.SnaapI18n?.text(" คู่") ?? " คู่"):''}${s.fetchedAt?' · '+date(s.fetchedAt):''}`));
  if(d.cacheMaxAgeSeconds)notes.push(`${(globalThis.SnaapI18n?.text("ข้อมูลอาจมาจากแคชไม่เกิน ") ?? "ข้อมูลอาจมาจากแคชไม่เกิน ")}${d.cacheMaxAgeSeconds}${(globalThis.SnaapI18n?.text(" วินาที · เวลาเรียกอ่านไม่ใช่เวลาต้นทาง") ?? " วินาที · เวลาเรียกอ่านไม่ใช่เวลาต้นทาง")}`);
  if(d.window?.fromBlock!=null)notes.push(`finalized block ${d.window.fromBlock}–${d.window.toBlock}${(globalThis.SnaapI18n?.text(" · สิ้นสุดช่วง ") ?? " · สิ้นสุดช่วง ")}${date(d.window.endBlockTime)} · ${status(d.window.status)}`);
  if(d.contractAddress)notes.push(`${(globalThis.SnaapI18n?.text("สัญญา ") ?? "สัญญา ")}${d.contractAddress} · decimals ${d.decimals??(globalThis.SnaapI18n?.text("ไม่ทราบ") ?? "ไม่ทราบ")}${(globalThis.SnaapI18n?.text(" · ไม่ทราบเจ้าของกระเป๋า") ?? " · ไม่ทราบเจ้าของกระเป๋า")}`);
  if(d.netWalletTokens!=null)notes.push(`${(globalThis.SnaapI18n?.text("สุทธิของ address ในช่วงที่ตรวจ ") ?? "สุทธิของ address ในช่วงที่ตรวจ ")}${d.netWalletTokens}${(globalThis.SnaapI18n?.text(" tokens · ไม่ใช่ยอดถือทั้งหมดหรือการซื้อ") ?? " tokens · ไม่ใช่ยอดถือทั้งหมดหรือการซื้อ")}`);
  if(d.inspectedTransactions!=null)notes.push(`${(globalThis.SnaapI18n?.text("ตรวจ ") ?? "ตรวจ ")}${d.inspectedTransactions}${(globalThis.SnaapI18n?.text(" ธุรกรรม") ?? " ธุรกรรม")}${d.address?(globalThis.SnaapI18n?.text(" ล่าสุดของ address") ?? " ล่าสุดของ address"):(globalThis.SnaapI18n?.text(" จาก 50 รายการแรกของแต่ละบล็อกล่าสุดสูงสุด 2 บล็อก · ตัวอย่างไม่สุ่ม") ?? " จาก 50 รายการแรกของแต่ละบล็อกล่าสุดสูงสุด 2 บล็อก · ตัวอย่างไม่สุ่ม")}`);
  if(d.inspectedEvents!=null)notes.push(`${(globalThis.SnaapI18n?.text("ตรวจ ") ?? "ตรวจ ")}${d.inspectedEvents}${(globalThis.SnaapI18n?.text(" events · หน่วยตามสัญญา · ไม่ใช่มูลค่า USD") ?? " events · หน่วยตามสัญญา · ไม่ใช่มูลค่า USD")}`);
  for(const note of notes)list.append(el('li','',note));node.append(list);
  const raw=el('button','',(globalThis.SnaapI18n?.text("ดาวน์โหลดข้อมูล") ?? "ดาวน์โหลดข้อมูล"));raw.type='button';raw.onclick=()=>download(new Blob([JSON.stringify(a,null,2)],{type:'application/json'}),'snaap-'+a.kind+'.json');node.append(raw);
  return node;
}
export function renderArtifacts(parent,artifacts,{refresh}={}){
  if(artifacts?.length)parent.classList.add('has-artifacts');
  for(const original of artifacts??[]){
    if(original.version!==1 || !original.data || !Array.isArray(original.data.items))continue;
    const card=el('section','chat-artifact');card.setAttribute('aria-label',original.title);card.dataset.artifactId=original.id;
    let current=original;
    const render=()=>{
      card.replaceChildren();disposeCharts();
      const header=el('header','artifact-header'),heading=el('div');heading.append(el('small','artifact-kicker',(globalThis.SnaapI18n?.text("SNAAP · ข้อมูลตลาด") ?? "SNAAP · ข้อมูลตลาด")),el('h3','',current.title));
      const tools=el('div','artifact-toolbar');
      const expand=el('button','',(globalThis.SnaapI18n?.text("ขยาย") ?? "ขยาย"));expand.type='button';expand.onclick=()=>{
        const dialog=el('dialog','artifact-dialog'),close=el('button','artifact-close',(globalThis.SnaapI18n?.text("ปิด") ?? "ปิด"));dialog.setAttribute('aria-label',current.title);close.type='button';close.onclick=()=>dialog.close();
        dialog.append(close,el('h3','',current.title),el('p','artifact-context',scope(current)),content(current),details(current));document.body.append(dialog);
        dialog.addEventListener('close',()=>{dialog.remove();disposeCharts();expand.focus();},{once:true});dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.showModal();close.focus();
      };
      const image=el('button','',(globalThis.SnaapI18n?.text("บันทึกภาพ") ?? "บันทึกภาพ"));image.type='button';image.onclick=async()=>{
        image.disabled=true;image.textContent=(globalThis.SnaapI18n?.text("กำลังสร้างภาพ") ?? "กำลังสร้างภาพ");
        try{download(await exportImage(current),'snaap-'+current.kind+'.png',image);image.textContent=(globalThis.SnaapI18n?.text("สร้างภาพแล้ว") ?? "สร้างภาพแล้ว");}
        catch{const error=el('p','artifact-error',(globalThis.SnaapI18n?.text("สร้างภาพไม่สำเร็จ · ลองดาวน์โหลดข้อมูลแทน") ?? "สร้างภาพไม่สำเร็จ · ลองดาวน์โหลดข้อมูลแทน"));error.setAttribute('role','alert');card.append(error);}
        finally{image.disabled=false;setTimeout(()=>image.textContent=(globalThis.SnaapI18n?.text("บันทึกภาพ") ?? "บันทึกภาพ"),2000);}
      };tools.append(expand,image);
      if(refresh){const update=el('button','',(globalThis.SnaapI18n?.text("อัปเดต") ?? "อัปเดต"));update.type='button';update.onclick=async()=>{
        update.disabled=true;update.textContent=(globalThis.SnaapI18n?.text("กำลังอัปเดต") ?? "กำลังอัปเดต");
        try{current=await refresh(original.id);render();card.prepend(el('p','artifact-refresh-note',(globalThis.SnaapI18n?.text("อัปเดตมุมมองแล้ว · ประวัติแชทยังคงข้อมูลเดิม") ?? "อัปเดตมุมมองแล้ว · ประวัติแชทยังคงข้อมูลเดิม")));}
        catch{const error=el('p','artifact-error',(globalThis.SnaapI18n?.text("อัปเดตไม่สำเร็จ · แสดงข้อมูลเดิม") ?? "อัปเดตไม่สำเร็จ · แสดงข้อมูลเดิม"));error.setAttribute('role','alert');card.append(error);}
        finally{update.disabled=false;update.textContent=(globalThis.SnaapI18n?.text("อัปเดต") ?? "อัปเดต");}
      };tools.append(update);}
      header.append(heading,tools);card.append(header,el('p','artifact-context',scope(current)),content(current),el('footer','artifact-asof',`${sourceNames(current)||(globalThis.SnaapI18n?.text("แหล่งตามรายการ") ?? "แหล่งตามรายการ")}${(globalThis.SnaapI18n?.text(" · ข้อมูล ณ ") ?? " · ข้อมูล ณ ")}${date(snapshotTime(current))} · snapshot`),details(current));
    };
    parent.insertBefore(card,parent.querySelector('.assistant-body'));render();
  }
}
