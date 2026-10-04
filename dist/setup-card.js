// Structured strategies enter this renderer; model-generated HTML never does.
export function setupSummaryMarkup(spec, {esc, fullSummary}) {
  const lines=fullSummary(spec).split('\n').filter(Boolean);
  let side='';
  const rows=lines.map(line=>{
    if(/^(Spot|Long|Short)\b/.test(line)){side=line;return '';}
    let label='เข้าเมื่อ',text=line,tone='entry';
    if(line.startsWith('ออก:')){label='ออกเมื่อ';text=line.slice(4).trim();tone='exit';}
    else if(line.startsWith('ยกเลิก:')){label='ยกเลิกเมื่อ';text=line.slice(7).trim();tone='cancel';}
    else if(line.startsWith('→')){label='ยืนยัน';text=line.slice(1).trim();tone='confirm';}
    else if(line.startsWith('พัก ')){label='พักสัญญาณ';text=line.slice(4);tone='cooldown';}
    const readable=text.replace(/ >= /g,' ไม่น้อยกว่า ').replace(/ <= /g,' ไม่มากกว่า ').replace(/ > /g,' สูงกว่า ').replace(/ < /g,' ต่ำกว่า ');
    const content=esc(readable).replace(/ และ /g,'<br><span class="setup-card-join">และ</span> ').replace(/ หรือ /g,'<br><span class="setup-card-join">หรือ</span> ');
    return `<div class="setup-card-condition" data-tone="${tone}"><dt>${esc(label)}${spec.side==='BOTH'&&tone==='entry'?`<small>${esc(side)}</small>`:''}</dt><dd>${content}</dd></div>`;
  }).join('');
  return `<dl class="setup-card-conditions" aria-label="เงื่อนไขเซตอัป">${rows}</dl>`;
}

export function setupCardMarkup({spec,title,status,version,active=false,channels='',actions='',note=''}, helpers){
  const {esc}=helpers;
  const side=spec.market==='Spot'?'Spot · ซื้อ':spec.side==='BOTH'?'Futures · Long / Short':`Futures · ${spec.side==='SHORT'?'Short':'Long'}`;
  return `<header class="setup-card-heading"><div class="setup-card-title"><span class="setup-card-eyebrow">เซตอัปเทรด${version?` · v${esc(String(version))}`:''}</span><h3>${esc(title??spec.name)}</h3></div><span class="setup-card-status" data-active="${active}"><span aria-hidden="true"></span>${esc(status)}</span></header><div class="setup-card-market"><strong>${esc(spec.pairs.length>3?spec.pairs.slice(0,2).join(', ')+' + อีก '+(spec.pairs.length-2)+' คู่':spec.pairs.join(', '))}</strong><span>${esc(spec.exchange.join(', '))}</span><span>${esc(side)}</span><span>${esc(spec.timeframe)} / แท่ง</span></div>${setupSummaryMarkup(spec,helpers)}${channels}<p class="preset-error setup-card-error" role="alert" hidden></p><footer class="setup-card-footer"><span class="setup-card-footnote">${esc(note)}</span><div class="setup-card-actions">${actions}</div></footer>`;
}

export function setupCardError(text){
  if(/worker|monitor.*(ready|unavailable)/i.test(text))return 'เปิดแจ้งเตือนยังไม่ได้ ระบบติดตามสัญญาณยังไม่พร้อม · เซตอัปของคุณยังบันทึกอยู่';
  return text;
}
