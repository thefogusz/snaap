/* Educational examples: each scene has an explicit concept; no generic chart fallback. */
window.SnaapGuideScenes = (() => {
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const svg = (body,height=140) => `<svg viewBox="0 0 300 ${height}" aria-hidden="true">${body}</svg>`;
  const scene = (body,caption) => `<div class="guide-chart">${body}<div class="guide-chart-caption">${esc(caption)}</div></div>`;
  const steps = items => `<div class="guide-steps">${items.map((item,i)=>`<div class="guide-step" style="--delay:${i*350}ms">${item}</div>`).join('')}</div>`;
  const card = (label,value) => `<small>${esc(label)}</small><strong>${esc(value)}</strong>`;
  const row = items => `<div class="guide-example-row">${items.map((item,i)=>`<div class="guide-step" style="--delay:${i*220}ms">${item}</div>`).join('')}</div>`;
  const selected = path => document.querySelector(`.design-panel select[data-path="${path}"]`)?.value;
  const indicatorName = control => control?.closest('.operand-block')?.querySelector('select[data-path$=".name"]')?.value;
  const candles = (values,baseline=10) => values.map((close,i)=>{
    const open=i?values[i-1]:close-.5, y=v=>115-v*6, x=42+i*65, green=close>=open;
    return `<g class="guide-candle" style="--delay:${i*400}ms"><path d="M${x} ${y(Math.max(open,close)+.4)}V${y(Math.min(open,close)-.4)}" stroke="${green?'#7adeb7':'#f38a96'}"/><rect x="${x-9}" y="${y(Math.max(open,close))}" width="18" height="${Math.max(3,Math.abs(y(close)-y(open)))}" rx="2" fill="${green?'#7adeb7':'#f38a96'}"/><circle cx="${x}" cy="${y(close)}" r="3" fill="#e4e8ef"/><text x="${x+15}" y="${y(close)+4}" fill="#edf0f4" font-size="13">${close}</text></g>`;
  }).join('');
  function comparison(op) {
    const crossing=op.startsWith('CROSS'), down=op==='CROSS_BELOW'||op.startsWith('<');
    const values=crossing?(down?[11,9,8]:[9,11,12]):[9,10,11];
    const pass=(v,i)=>op==='>'?v>10:op==='>='?v>=10:op==='<'?v<10:op==='<='?v<=10:!!i&&(down?values[i-1]>=10&&v<10:values[i-1]<=10&&v>10);
    return scene(`<div class="guide-chart-key"><span></span>ค่าเทียบ = 10 · จุดขาว = ราคาปิด</div>${svg(`<path d="M20 55H280" stroke="#c9f14a" stroke-dasharray="4 5"/><text x="255" y="47" fill="#c9f14a" font-size="13">10</text>${candles(values)}`)}${row(values.map((v,i)=>card(i===0&&crossing?'แท่งก่อน':`แท่ง ${i+1}`,`${v} · ${pass(v,i)?'ผ่าน':'ไม่ผ่าน'}`)))}`,crossing?'ตัดผ่านเพียงแท่งเดียว · แท่งถัดไปไม่ตัดซ้ำ':'ตรวจทุกแท่ง · ค่าเท่ากันผ่านเฉพาะ ≥ หรือ ≤');
  }
  function ohlc(field='close',caption) {
    if(field==='volume')return scene(svg([30,50,80,120].map((v,i)=>`<g class="guide-candle" style="--delay:${i*220}ms"><rect x="${28+i*70}" y="${126-v*.7}" width="30" height="${v*.7}" fill="#7adeb7" rx="3"/><text x="${43+i*70}" y="${118-v*.7}" text-anchor="middle" fill="#edf0f4" font-size="14">${v}</text><text x="${43+i*70}" y="148" text-anchor="middle" fill="#c5cbd3" font-size="12">แท่ง ${i+1}</text></g>`).join(''),160),'ตัวเลขเหนือแท่ง = ปริมาณซื้อขายในแท่งนั้น (หน่วย)');
    const values={high:110,close:106,open:100,low:95}, names={high:'สูงสุด',close:'ปิด',open:'เปิด',low:'ต่ำสุด'}, y={high:20,close:46,open:86,low:120};
    const callouts=Object.keys(values).map(key=>`<path d="M${key==='high'||key==='low'?85:104} ${y[key]}H140" stroke="${key===field?'#c9f14a':'#ffffff40'}"/><circle cx="${key==='high'||key==='low'?85:104}" cy="${y[key]}" r="${key===field?4:2}" fill="${key===field?'#c9f14a':'#b9c5cb'}"/><text x="150" y="${y[key]+5}" fill="${key===field?'#c9f14a':'#edf0f4'}" font-size="14" font-weight="${key===field?700:500}">${names[key]} ${values[key]}</text>`).join('');
    return scene(svg(`<path d="M85 20V120" stroke="#7adeb7" stroke-width="2"/><rect class="guide-anatomy" x="66" y="46" width="38" height="40" rx="4" fill="#7adeb7"/>${callouts}`),caption||`เปิด 100 → ปิด 106: ราคาเพิ่ม 6`);
  }
  function timeframe(key,frame) {
    const parts={'5m':['1m',5],'15m':['5m',3],'1h':['15m',4],'4h':['1h',4],'1d':['4h',6]}, [unit,count]=parts[frame]||parts['15m'];
    const small=Array.from({length:count},(_,i)=>`<g class="guide-candle" style="--delay:${i*200}ms"><path d="M${28+i*40} 30V80" stroke="#7adeb7"/><rect x="${20+i*40}" y="${48-i*2}" width="16" height="24" rx="2" fill="#7adeb7"/><text x="${28+i*40}" y="99" text-anchor="middle" fill="#edf0f4" font-size="12">${unit}</text></g>`).join('');
    return scene(`${svg(`${small}<path d="M18 113H${28+(count-1)*40}V119" fill="none" stroke="#c9f14a"/><text x="150" y="139" text-anchor="middle" fill="#c9f14a" font-size="14">${count} แท่ง × ${unit} = 1 แท่ง ${frame}</text>`,150)}${steps([card(key==='timeframe'?'จังหวะตรวจเซ็ตอัพ':'ข้อมูลของค่านี้',key==='timeframe'?`ปิดแท่ง ${frame} → ตรวจเงื่อนไข`:`คำนวณจากแท่ง ${frame} ที่ปิดแล้ว`)])}`,key==='timeframe'?'แท่งยังไม่ปิด → รอ · แท่งปิด → ตรวจ':'รวมแท่ง: เปิดแรก / สูงที่สุด / ต่ำที่สุด / ปิดสุดท้าย');
  }
  const formulas = {
    SMA:['ราคาปิด 10, 12, 14','(10 + 12 + 14) ÷ 3','SMA 3 = 12'],
    EMA:['EMA เดิม 10 · ราคาล่าสุด 14','EMA 3: ราคาใหม่มีน้ำหนัก 50% · ค่าก่อนหน้ามี 50%','10 + 0.5 × (14 − 10) = 12'],
    WMA:['ราคาปิด 10, 12, 14','(10×1 + 12×2 + 14×3) ÷ 6','WMA 3 ≈ 12.67'],
    RMA:['RMA เดิม 10 · ราคาล่าสุด 14','RMA 4: α = 1 ÷ 4','10 + 0.25 × (14 − 10) = 11'],
    VWMA:['ราคา 10, 20 · วอลุ่ม 3, 1','(10×3 + 20×1) ÷ (3 + 1)','VWMA 2 = 12.5'],
    RSI:['ค่าเฉลี่ยขึ้น 1 · ค่าเฉลี่ยลง 2','RS = 1 ÷ 2 = 0.5','100 − 100 ÷ (1 + 0.5) ≈ 33.33'],
    VOLUME_RATIO:['เฉลี่ยแท่งก่อน 100 · ล่าสุด 200','วอลุ่มล่าสุด ÷ ค่าเฉลี่ยแท่งก่อน','200 ÷ 100 = 2 เท่า'],
    MACD:['EMA เร็ว 105 · EMA ช้า 100','EMA เร็ว − EMA ช้า','MACD = 5'],
    MACD_SIGNAL:['ค่า MACD หลายแท่ง','EMA ของค่า MACD','Signal คือเส้นเฉลี่ยของ MACD'],
    MACD_HIST:['MACD = 5 · Signal = 3','MACD − Signal','Histogram = 2'],
    ROC:['ราคา n แท่งก่อน 100 · ล่าสุด 110','(110 ÷ 100 − 1) × 100','ROC = 10%'],
    MOM:['ราคา n แท่งก่อน 100 · ล่าสุด 110','110 − 100','Momentum = 10 หน่วยราคา'],
    HIGHEST:['ราคาจากแหล่งค่าที่เลือก: 10, 12, 11','เลือกค่ามากที่สุดในช่วง','HIGHEST 3 = 12'],
    LOWEST:['ราคาจากแหล่งค่าที่เลือก: 10, 12, 11','เลือกค่าน้อยที่สุดในช่วง','LOWEST 3 = 10'],
    DONCHIAN_UPPER:['ราคาสูงแต่ละแท่ง: 10, 12, 11','ค่าสูงสุดของ high ในช่วง','ขอบบน = 12'],
    DONCHIAN_LOWER:['ราคาต่ำแต่ละแท่ง: 8, 7, 9','ค่าต่ำสุดของ low ในช่วง','ขอบล่าง = 7'],
    DONCHIAN_MID:['ขอบบน 12 · ขอบล่าง 7','(12 + 7) ÷ 2','เส้นกลาง = 9.5'],
    STOCH_K:['สูงในช่วง 20 · ต่ำ 10 · ปิด 15','100 × (15 − 10) ÷ (20 − 10)','%K = 50'],
    WILLIAMS_R:['สูงในช่วง 20 · ต่ำ 10 · ปิด 15','−100 × (20 − 15) ÷ (20 − 10)','Williams %R = −50'],
    STDDEV:['ราคา 10, 12, 14 · เฉลี่ย 12','√((4 + 0 + 4) ÷ 3)','ส่วนเบี่ยงเบน ≈ 1.63'],
    VARIANCE:['ราคา 10, 12, 14 · เฉลี่ย 12','(4 + 0 + 4) ÷ 3','ความแปรปรวน ≈ 2.67'],
    CCI:['ล่าสุด 14 · เฉลี่ย 12 · mean deviation 1.33','(14 − 12) ÷ (0.015 × 1.33)','CCI ≈ 100'],
    CMF:['แท่งเดียว: สูง 20 · ต่ำ 10 · ปิด 18','(2×18 − 20 − 10) ÷ (20 − 10) = 0.6','CMF = ผลรวม(0.6 × วอลุ่ม) ÷ ผลรวมวอลุ่ม'],
    MFI:['กระแสเงินบวก 200 · ลบ 100','100 × 200 ÷ (200 + 100)','MFI ≈ 66.67'],
    TR:['สูง 110 · ต่ำ 105 · ปิดก่อน 100','มากสุดของ 5, 10, 5','True Range = 10'],
    ATR:['True Range ของแต่ละแท่ง','ทำค่าเฉลี่ยแบบ Wilder ตามระยะ','ผลลัพธ์เป็นหน่วยราคา ไม่บอกขึ้นหรือลง'],
    BB_MIDDLE:['ราคาปิดหลายแท่ง','SMA ตามระยะที่เลือก','เส้นกลางของ Bollinger Bands'],
    BB_UPPER:['เส้นกลาง 100 · σ = 5 · ตัวคูณ 2','100 + 2 × 5','ขอบบน = 110'],
    BB_LOWER:['เส้นกลาง 100 · σ = 5 · ตัวคูณ 2','100 − 2 × 5','ขอบล่าง = 90'],
    BB_WIDTH:['ขอบบน 110 · ล่าง 90 · กลาง 100','(110 − 90) ÷ 100 × 100','ความกว้าง = 20%'],
    BB_PERCENT:['บน 110 · ล่าง 90 · ราคาปิด 105','(105 − 90) ÷ (110 − 90)','ตำแหน่งในแถบ = 0.75'],
  };
  function indicatorPicture(name) {
    if(['SMA','EMA','WMA','RMA','VWMA'].includes(name)) {
      const prices=[10,10,10,10,10,14,14,14], n=3;
      let prev=10;
      const average=prices.map((price,i)=>{if(i<2)return null;const tail=prices.slice(i-2,i+1);if(name==='EMA'){prev+=(price-prev)*.5;return prev;}if(name==='RMA'){prev+=(price-prev)/3;return prev;}if(name==='WMA')return (tail[0]+tail[1]*2+tail[2]*3)/6;return tail.reduce((a,b)=>a+b,0)/3;});
      const points=values=>values.map((v,i)=>v===null?null:`${28+i*34},${115-(v-9)*17}`).filter(Boolean).join(' ');
      return `<div class="guide-chart-key"><span></span>ตัวอย่าง ${esc(name)} 3 · สีเทา = ราคา</div>${svg(`<polyline points="${points(prices)}" fill="none" stroke="#bbc3cf" stroke-width="2"/><polyline class="guide-average" points="${points(average)}" fill="none" stroke="#c9f14a" stroke-width="3"/><text x="28" y="125" fill="#e4e8ef" font-size="12">เริ่ม 10</text><text x="264" y="20" text-anchor="end" fill="#bbc3cf" font-size="12">ราคา 14</text><text x="266" y="${115-(average.at(-1)-9)*17+18}" text-anchor="end" fill="#c9f14a" font-size="12">${name} ${average.at(-1).toFixed(2)}</text>`)}<div class="guide-chart-caption">ราคาเปลี่ยนก่อน → เส้นเฉลี่ยค่อย ๆ ตาม${name==='VWMA'?' · ตัวอย่างใช้วอลุ่มเท่ากัน':''}</div>`;
    }
    if(['RSI','STOCH_K','WILLIAMS_R','MFI','BB_PERCENT'].includes(name)) {
      const ranges={RSI:[0,100,33.33],STOCH_K:[0,100,50],WILLIAMS_R:[-100,0,-50],MFI:[0,100,66.67],BB_PERCENT:[0,1,.75]},[min,max,value]=ranges[name],x=24+(value-min)/(max-min)*252;
      return svg(`<path d="M24 75H276" stroke="#a0a7b8" stroke-width="6" stroke-linecap="round"/><path class="guide-average" d="M24 75H${x}" stroke="#c9f14a" stroke-width="6" stroke-linecap="round"/><circle class="guide-signal" cx="${x}" cy="75" r="8" fill="#c9f14a"/><text x="${x}" y="48" text-anchor="middle" fill="#c9f14a" font-size="16">${name} ${value}</text><text x="24" y="105" fill="#edf0f4" font-size="14">${min}</text><text x="276" y="105" text-anchor="end" fill="#edf0f4" font-size="14">${max}</text>`)+`<div class="guide-chart-caption">${name==='BB_PERCENT'?'0 = ขอบล่าง · 1 = ขอบบน · ค่าอาจออกนอกแถบ':'ตำแหน่งบนสเกลของอินดิเคเตอร์ ไม่ใช่ราคาเหรียญ'}</div>`;
    }
    if(['HIGHEST','LOWEST','DONCHIAN_UPPER','DONCHIAN_LOWER','DONCHIAN_MID'].includes(name)) {
      const data=[{o:9,h:11,l:8,c:10},{o:10,h:13,l:9,c:12},{o:12,h:12,l:7,c:11},{o:11,h:14,l:10,c:13}],y=v=>130-(v-6)*12;
      const level={HIGHEST:13,LOWEST:10,DONCHIAN_UPPER:14,DONCHIAN_LOWER:7,DONCHIAN_MID:10.5}[name];
      const bars=data.map((v,i)=>{const x=30+i*55,green=v.c>=v.o;return `<g class="guide-candle" style="--delay:${i*200}ms"><path d="M${x} ${y(v.h)}V${y(v.l)}" stroke="${green?'#7adeb7':'#f38a96'}"/><rect x="${x-7}" y="${y(Math.max(v.o,v.c))}" width="14" height="${Math.abs(v.o-v.c)*12}" fill="${green?'#7adeb7':'#f38a96'}"/><text x="${x}" y="152" text-anchor="middle" fill="#edf0f4" font-size="12">${i+1}</text></g>`;}).join('');
      return svg(`${bars}<path d="M15 ${y(level)}H280" stroke="#c9f14a" stroke-dasharray="4 4"/><text x="278" y="${y(level)-8}" text-anchor="end" fill="#c9f14a" font-size="14">${level}</text>`,165)+`<div class="guide-chart-caption">ตัวอย่าง 4 แท่ง · ${name==='HIGHEST'?'ราคาปิดสูงสุด 13':name==='LOWEST'?'ราคาปิดต่ำสุด 10':name==='DONCHIAN_UPPER'?'ยอดไส้สูงสุด 14':name==='DONCHIAN_LOWER'?'ปลายไส้ต่ำสุด 7':'กลางระหว่างสูง 14 กับต่ำ 7 = 10.5'}</div>`;
    }
    if(name.startsWith('BB_'))return svg('<path d="M20 40H280V105H20Z" fill="#9eabff18"/><path d="M20 40H280M20 105H280" fill="none" stroke="#9eabff"/><path d="M20 73H280" stroke="#c9f14a" stroke-dasharray="4 4"/><text x="150" y="20" text-anchor="middle" fill="#c5cfff" font-size="13">ขอบบน 110</text><text x="150" y="65" text-anchor="middle" fill="#c9f14a" font-size="13">เส้นกลาง 100</text><text x="150" y="137" text-anchor="middle" fill="#c5cfff" font-size="13">ขอบล่าง 90</text>')+'<div class="guide-chart-caption">กางแถบจากเส้นกลางตามความแกว่งของราคา</div>';
    if(name==='VOLUME_RATIO')return `${svg('<rect class="guide-candle" x="60" y="80" width="55" height="45" fill="#9eabff"/><rect class="guide-candle" style="--delay:350ms" x="185" y="35" width="55" height="90" fill="#7adeb7"/><text x="87" y="69" text-anchor="middle" fill="#edf0f4" font-size="14">เฉลี่ย 100</text><text x="212" y="24" text-anchor="middle" fill="#edf0f4" font-size="14">ล่าสุด 200</text>')}<div class="guide-chart-caption">แท่งล่าสุดสูงเป็น 2 เท่าของค่าเฉลี่ย</div>`;
    return '';
  }
  function render(key,control) {
    const value=control?.value;
    if(key==='op')return ['AND','OR'].includes(value)?logic(value):comparison(value||'>');
    if(key==='exchange') {
      const chosen=document.querySelector('.exchange-choices input:checked')?.dataset.exchange || 'Binance';
      return scene(steps([row([...new Set([chosen,'Binance','Bybit'])].map(name=>`<div class="${name===chosen?'guide-value-selected':''}">${card('แหล่งข้อมูล',name)}</div>`)),card('แหล่งที่เลือก',chosen),card('ข้อมูลที่ใช้ตรวจ',`คู่เทรด + ราคา + แท่งจาก ${chosen}`)]),'แต่ละกระดานมีสมุดคำสั่งและข้อมูลราคาของตัวเอง');
    }
    if(key==='market')return scene(row([card('Spot','สินทรัพย์จริง ↔ เงินอ้างอิง'),card('Perpetual Futures','สัญญา · Long / Short')]),'ใน SNAAP ทั้งสองตลาดใช้ตั้งเงื่อนไขแจ้งเตือน');
    if(key==='pair') {const pair=document.querySelector('[data-pair-picker]')?.textContent.replace('▾','').trim()||'BTC/USDT';const [base,quote]=pair.split('/');return scene(row([card('สินทรัพย์ที่ตรวจ',base),card('หน่วยของราคา',quote)]),`${base}/${quote}: ราคาของ ${base} ในหน่วย ${quote}`);}
    if(key==='timeframe'||key==='operandFrame')return timeframe(key,value||'15m');
    if(key==='field')return ohlc(value);
    if(key==='source') {
      if(['open','high','low','close'].includes(value))return ohlc(value);
      const calculations={hl2:'HL2 = (110 + 95) ÷ 2 = 102.5',hlc3:'HLC3 = (110 + 95 + 106) ÷ 3 ≈ 103.67',ohlc4:'OHLC4 = (100 + 110 + 95 + 106) ÷ 4 = 102.75'};
      if(calculations[value])return ohlc('',calculations[value]);
      const formula={open:'ราคาเปิด',high:'ราคาสูง',low:'ราคาต่ำ',close:'ราคาปิด',hl2:'(high + low) ÷ 2',hlc3:'(high + low + close) ÷ 3',ohlc4:'(open + high + low + close) ÷ 4'}[value];
      return scene(steps([card('ข้อมูลต่อแท่ง',formula||value),card('ขั้นถัดไป','นำค่านี้ไปคำนวณอินดิเคเตอร์')]),'เปลี่ยนแหล่งค่าแล้วผลอินดิเคเตอร์อาจเปลี่ยน');
    }
    if(key==='indicator') {const formula=formulas[value], picture=indicatorPicture(value);return formula?scene(picture?`${picture}<div class="guide-formula-note">${esc(['SMA','EMA','WMA','RMA','VWMA'].includes(value)?formula[1]:formula[0]+' → '+formula[1])}</div>`:steps(formula.map((text,i)=>card(['ข้อมูลตัวอย่าง','วิธีคำนวณ','ผลลัพธ์'][i],text))),picture?`${value} · ดูสูตรละเอียดได้จากลิงก์ใต้ค่าตั้ง`:`${value} · ตัวอย่างการคำนวณ`):'';}
    if(key==='kind') {
      const examples={PRICE:['ข้อมูล OHLCV','เลือกราคา หรือวอลุ่มของแท่ง'],INDICATOR:['ข้อมูลแท่ง → สูตร','เช่น EMA / RSI / ATR'],CONSTANT:['เกณฑ์คงที่','เช่น 30 ไม่เปลี่ยนตามตลาด'],ENTRY_RETURN:['เริ่มที่ 100 → ล่าสุด 110','Long +10% · Short −10%']};
      const item=examples[value];return item?scene(steps(item.map((text,i)=>card(i?'ความหมาย':'แหล่งค่า',text))),'เลือกชนิดให้ตรงกับข้อมูลที่ต้องการตรวจ'):'';
    }
    if(key==='period')return scene(`${row([card('ระยะที่เลือก',`${value} แท่ง`),card('กรอบเวลาค่านี้',control.closest('.operand-block')?.querySelector('select[data-path$=".timeframe"]')?.value||'')])}${steps([card('ช่วงข้อมูลย้อนหลัง',`ใช้ ${value} แท่งคำนวณ ${indicatorName(control)||'ค่านี้'}`)])}`,'ระยะเป็นจำนวนแท่ง ไม่ใช่จำนวนนาที');
    if(key==='deviation')return scene(`${row([card('เส้นกลาง','100'),card('σ','5')])}${steps([card(`ตัวคูณ ${value}`,`ขอบบน ${100+Number(value)*5} · ขอบล่าง ${100-Number(value)*5}`)])}`,'ตัวคูณมากขึ้น → แถบกว้างขึ้น ทั้งบนและล่าง');
    if(key==='slow'||key==='signal')return scene(steps([card('พารามิเตอร์',`${value} แท่ง`),card('ใช้คำนวณ',key==='slow'?'EMA ฝั่งช้า → MACD = เร็ว − ช้า':'EMA ของ MACD → เส้น Signal')]),'เปลี่ยนระยะของเส้นนี้ ไม่ใช่เส้นราคาทั้งหมด');
    if(key==='value')return scene(row([card('เกณฑ์ที่เลือก',value),card('หน่วย','ตามชนิดของค่าอีกฝั่ง')]),'เช่น RSI เทียบ 30 · ราคาเทียบเกณฑ์หน่วยราคา');
    if(key==='bars') {const n=Number(value)||3;return scene(`${row([card('แท่งแรก','ผ่าน'),card('ระหว่างทาง','ไม่ผ่าน'),card('หลังจากนั้น','ผ่าน')])}${steps([card(`ต้องต่อเนื่อง ${n} แท่ง`,n===1?'ผ่านแท่งเดียวก็ครบ':'ชุดที่ขาดช่วงไม่ผ่าน'),card('ชุดที่ครบ',`ผ่านติดกัน ${n} แท่ง` )])}`,'HOLD ตรวจความจริงย้อนหลังตามจำนวนแท่งที่กำหนด');}
    if(key==='withinBars')return scene(steps([card('ขั้นก่อนหน้าผ่าน','เริ่มนับเวลารอ'),card('หน้าต่างยืนยัน',`${value||3} แท่งของรอบตรวจ`),card('ผลลัพธ์','ยืนยันทัน → ขั้นถัดไป · เกินเวลา → หมดอายุ')]),'รอเหตุการณ์ภายในเวลา ไม่จำเป็นต้องผ่านทุกแท่ง');
    if(key==='cooldownBars')return scene(steps([card('สัญญาณ ENTRY / EXIT','เริ่มช่วงพัก'),card('ระยะพัก',`${value||0} แท่ง`),card('เริ่มรอบใหม่','พ้นช่วงพัก และเงื่อนไขเริ่มรีเซ็ตแล้ว')]),'ช่วงพักไม่ใช่การหน่วงเวลาส่งแจ้งเตือน');
    if(key==='group')return logic(control?.value||'AND');
    if(key==='direction')return scene(row([card('ราคา 100 → 110','Long +10%'),card('ราคา 100 → 90','Short +10%')]),'การเปลี่ยนราคาตามฝั่งคิดจากราคาเริ่มสัญญาณ');
    if(key==='mirror')return scene(row([card('Long','ราคา > EMA'),card('Short แบบสลับ','ราคา < EMA')]),'สลับเครื่องหมาย · ค่าตัวเลขเดิมไม่เปลี่ยน');
    if(key==='entry'||key==='exit'||key==='cancel') {
      const lifecycle={entry:['เงื่อนไขเริ่มผ่าน','รอยืนยัน ถ้าตั้งไว้','ENTRY'],exit:['เริ่มสัญญาณแล้ว','เงื่อนไขออกผ่าน','EXIT → จบรอบ'],cancel:['กำลังรอ / ทำงาน','เงื่อนไขยกเลิกผ่าน','CANCEL → รีเซ็ตรอบ']};
      return scene(steps(lifecycle[key].map((text,i)=>card(`ขั้น ${i+1}`,text))),'เหตุการณ์ของระบบสัญญาณ ไม่ได้ส่งออเดอร์');
    }
    return ''; // No unrelated animation for names, destinations, custom formulas or imports.
  }
  function logic(op) {return scene(`${row([card('ข้อ A','ผ่าน'),card('ข้อ B','ไม่ผ่าน')])}${steps([card('AND','ไม่ผ่าน · ต้องผ่านทั้งสองข้อ'),card('OR','ผ่าน · มีอย่างน้อยหนึ่งข้อผ่าน')])}`,'ข้อมูลชุดเดียวกัน แต่ตัวเชื่อมให้ผลต่างกัน');}
  return {render};
})();
