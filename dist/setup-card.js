// Structured strategies enter this renderer; model-generated HTML never does.
export function setupSummaryMarkup(spec, {esc, fullSummary}) {
  const lines=fullSummary(spec).split('\n').filter(Boolean);
  const translate = value => globalThis.SnaapI18n?.text(value) ?? value;
  const exit = translate('ออก:'), cancel = translate('ยกเลิก:'), cooldown = translate('พัก ');
  let side='';
  const rows=lines.map(line=>{
    if(/^(Spot|Long|Short)\b/.test(line)){side=line;return '';}
    let label=(globalThis.SnaapI18n?.text("เข้าเมื่อ") ?? "เข้าเมื่อ"),text=line,tone='entry';
    if(line.startsWith(exit)){label=(globalThis.SnaapI18n?.text("ออกเมื่อ") ?? "ออกเมื่อ");text=line.slice(exit.length).trim();tone='exit';}
    else if(line.startsWith(cancel)){label=(globalThis.SnaapI18n?.text("ยกเลิกเมื่อ") ?? "ยกเลิกเมื่อ");text=line.slice(cancel.length).trim();tone='cancel';}
    else if(line.startsWith('→')){label=(globalThis.SnaapI18n?.text("ยืนยัน") ?? "ยืนยัน");text=line.slice(1).trim();tone='confirm';}
    else if(line.startsWith(cooldown)){label=(globalThis.SnaapI18n?.text("พักสัญญาณ") ?? "พักสัญญาณ");text=line.slice(cooldown.length);tone='cooldown';}
    const readable=text.replace(/ >= /g,translate(' ไม่น้อยกว่า ')).replace(/ <= /g,translate(' ไม่มากกว่า ')).replace(/ > /g,translate(' สูงกว่า ')).replace(/ < /g,translate(' ต่ำกว่า '));
    const content=esc(readable).split(translate(' และ ')).join('<br><span class="setup-card-join">'+translate('และ')+'</span> ').split(translate(' หรือ ')).join('<br><span class="setup-card-join">'+translate('หรือ')+'</span> ');
    return `<div class="setup-card-condition" data-tone="${tone}"><dt>${esc(label)}${spec.side==='BOTH'&&tone==='entry'?`<small>${esc(side)}</small>`:''}</dt><dd>${content}</dd></div>`;
  }).join('');
  return `${(globalThis.SnaapI18n?.text("<dl class=\"setup-card-conditions\" aria-label=\"เงื่อนไขเซ็ตอัพ\">") ?? "<dl class=\"setup-card-conditions\" aria-label=\"เงื่อนไขเซ็ตอัพ\">")}${rows}</dl>`;
}

export function setupCardMarkup({spec,title,status,version,active=false,channels='',actions='',note=''}, helpers){
  const {esc}=helpers;
  const side=spec.market==='Spot'?(globalThis.SnaapI18n?.text("Spot · ซื้อ") ?? "Spot · ซื้อ"):spec.side==='BOTH'?'Futures · Long / Short':`Futures · ${spec.side==='SHORT'?'Short':'Long'}`;
  return `${(globalThis.SnaapI18n?.text("<header class=\"setup-card-heading\"><div class=\"setup-card-title\"><span class=\"setup-card-eyebrow\">เซ็ตอัพเทรด") ?? "<header class=\"setup-card-heading\"><div class=\"setup-card-title\"><span class=\"setup-card-eyebrow\">เซ็ตอัพเทรด")}${version?` · v${esc(String(version))}`:''}</span><h3>${esc(title??spec.name)}</h3></div><span class="setup-card-status" data-active="${active}"><span aria-hidden="true"></span>${esc(status)}</span></header><div class="setup-card-market"><strong>${esc(spec.pairs.length>3?spec.pairs.slice(0,2).join(', ')+(globalThis.SnaapI18n?.text(" + อีก ") ?? " + อีก ")+(spec.pairs.length-2)+(globalThis.SnaapI18n?.text(" คู่") ?? " คู่"):spec.pairs.join(', '))}</strong><span>${esc(spec.exchange.join(', '))}</span><span>${esc(side)}</span><span>${esc(spec.timeframe)}${(globalThis.SnaapI18n?.text(" / แท่ง</span></div>") ?? " / แท่ง</span></div>")}${setupSummaryMarkup(spec,helpers)}${channels}<p class="preset-error setup-card-error" role="alert" hidden></p><footer class="setup-card-footer"><span class="setup-card-footnote">${esc(note)}</span><div class="setup-card-actions">${actions}</div></footer>`;
}

export function setupCardError(text){
  if(/worker|monitor.*(ready|unavailable)/i.test(text))return (globalThis.SnaapI18n?.text("เปิดแจ้งเตือนยังไม่ได้ ระบบติดตามสัญญาณยังไม่พร้อม · เซ็ตอัพของคุณยังบันทึกอยู่") ?? "เปิดแจ้งเตือนยังไม่ได้ ระบบติดตามสัญญาณยังไม่พร้อม · เซ็ตอัพของคุณยังบันทึกอยู่");
  return text;
}
