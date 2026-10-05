(() => {
  const guides = {
    name: ['ชื่อเซ็ตอัพ','ตั้งชื่อให้จำได้ว่าเฝ้าคู่ไหนและรอจังหวะอะไร เช่น BTC ย่อในขาขึ้น','ชื่อช่วยแยกเซ็ตอัพ ไม่เปลี่ยนเงื่อนไขสัญญาณ','none'],
    exchange: ['เลือกกระดาน','ใช้ราคาและคู่เทรดจากกระดานนี้เท่านั้น ราคาเหรียญเดียวกันอาจต่างกันในแต่ละกระดาน','เปลี่ยนกระดานแล้วตรวจคู่เทรดอีกครั้ง','source'],
    market: ['Spot / Futures','Spot ใช้เงื่อนไขฝั่งซื้อ ส่วน Perpetual Futures ตั้ง Long หรือ Short ได้','Futures ตอนนี้รองรับสัญญา USDT · ระบบสร้างสัญญาณ ไม่ส่งออเดอร์','source'],
    pair: ['คู่เทรด','เลือกสินทรัพย์และสกุลที่ใช้เทียบราคา เช่น BTC/USDT คือราคา BTC ในหน่วย USDT','รายการตรงกับกระดานและตลาดที่เลือก','source'],
    timeframe: ['รอบตรวจแท่งปิด','ระบบประเมินเมื่อแท่งของรอบนี้ปิด เช่น 5m ตรวจทุกแท่ง 5 นาที ไม่ใช่ทุกครั้งที่ราคาขยับ','กรอบเวลาของอินดิเคเตอร์แต่ละตัวเลือกต่างกันได้','time'],
    operandFrame: ['กรอบเวลาของค่านี้','ใช้แท่งจากกรอบเวลานี้คำนวณค่าฝั่งนี้ เช่น EMA 200 บน 1h ใช้แท่งชั่วโมง','อ่านเฉพาะแท่งที่ปิดแล้ว · ต่างจากรอบตรวจเซ็ตอัพ','time'],
    kind: ['ชนิดค่า','เลือกว่าจะตรวจราคา อินดิเคเตอร์ ตัวเลขคงที่ หรือผลตอบแทนจากจุดเริ่มสัญญาณ','ค่าทั้งสองฝั่งควรมีหน่วยเดียวกัน เช่น RSI เทียบ 30','compare'],
    field: ['แหล่งราคา','เปิด = ราคาแรก · สูง/ต่ำ = ขอบไส้เทียน · ปิด = ราคาสุดท้าย · วอลุ่ม = ปริมาณซื้อขายของแท่ง','ราคาปิดจะนิ่งเมื่อแท่งปิดแล้ว','candle'],
    source: ['แหล่งค่าของอินดิเคเตอร์','เลือกข้อมูลในแท่งที่นำไปคำนวณ เช่น close ใช้ราคาปิด ส่วน hl2 เฉลี่ยสูงกับต่ำ','hlc3 เฉลี่ยสูง/ต่ำ/ปิด · ohlc4 เฉลี่ยเปิด/สูง/ต่ำ/ปิด','candle'],
    period: ['ระยะอินดิเคเตอร์','จำนวนแท่งย้อนหลังที่ใช้คำนวณอินดิเคเตอร์ เปลี่ยนระยะแล้วช่วงข้อมูลและผลลัพธ์จะเปลี่ยน','200 แท่งบน 15m ใช้ข้อมูล 50 ชั่วโมง · EMA ยังต้องมีช่วงเตรียมข้อมูล','period'],
    value: ['ค่าที่เปรียบเทียบ','ตัวเลขเกณฑ์ เช่น RSI ต่ำกว่า 30 หรือราคาปิดมากกว่า 100','ตรวจหน่วยให้ตรงกัน: ราคา, RSI, วอลุ่ม หรือเปอร์เซ็นต์','compare'],
    deviation: ['ความกว้าง Bollinger Bands','จำนวนส่วนเบี่ยงเบนมาตรฐานที่ใช้กางแถบจากเส้นกลาง เพิ่มค่านี้แล้วแถบกว้างขึ้น','แถบกว้างไม่ได้แปลว่าราคาต้องกลับตัว','period'],
    slow: ['MACD slow','จำนวนแท่งของ EMA ฝั่งช้า MACD เปรียบเทียบเส้นเร็วกับเส้นช้า','ควรยาวกว่าระยะของฝั่งเร็ว','period'],
    signal: ['MACD signal','จำนวนแท่งที่ใช้ทำเส้นเฉลี่ยของ MACD เพื่อเป็นเส้นเทียบสัญญาณ','ค่ามากทำให้เส้นตอบสนองช้าลง','period'],
    bars: ['ต่อเนื่องหลายแท่ง','เงื่อนไขต้องจริงติดกันตามจำนวนแท่งที่กำหนด ถ้าขาดช่วงจะไม่ผ่าน','เช่น เหนือ EMA ต่อเนื่อง 3 แท่งปิด','hold'],
    withinBars: ['รอยืนยันภายในกี่แท่ง','หลังเงื่อนไขก่อนหน้าผ่าน ต้องเจอเงื่อนไขขั้นนี้ภายในจำนวนแท่งที่กำหนด','นับตามรอบตรวจเซ็ตอัพ · หมดเวลาจะยกเลิกการรอ','hold'],
    cooldownBars: ['พักหลังสัญญาณ','เว้นจำนวนแท่งหลังสัญญาณเริ่มหรือสัญญาณออก ก่อนหาโอกาสรอบใหม่','0 = ไม่เพิ่มช่วงพัก · เงื่อนไขเริ่มต้องเป็นเท็จก่อนจึงเริ่มซ้ำได้','cooldown'],
    group: ['AND / OR','AND ต้องผ่านทุกข้อพร้อมกัน ส่วน OR ผ่านอย่างน้อยหนึ่งข้อก็พอ','ใส่กลุ่มซ้อนได้เพื่อแยกเงื่อนไขหลักกับทางเลือก','hold'],
    direction: ['Long / Short','Long รอการเคลื่อนไหวขึ้น ส่วน Short รอการเคลื่อนไหวลง ตั้งเงื่อนไขให้ตรงกับฝั่งที่เลือก','สัญญาณจำลองไม่ใช่สถานะออเดอร์จริง','compare'],
    entry: ['เงื่อนไขเริ่มต้น','จุดเริ่มรอบสัญญาณ ต้องผ่านข้อนี้ก่อนจึงเข้าสู่ขั้นรอยืนยันถ้ามี','ระบบตรวจจากข้อมูลแท่งปิด','cross'],
    exit: ['สัญญาณออก','เงื่อนไขที่ใช้จบรอบสัญญาณหลังเริ่มแล้ว เช่น ราคาหลุดเส้นที่กำหนด','เป็นวงจรสัญญาณ ไม่ได้ขายหรือปิดออเดอร์ให้','below'],
    cancel: ['เงื่อนไขยกเลิก','ใช้ยกเลิกรอบที่กำลังรอหรือกำลังทำงาน เมื่อสถานการณ์ไม่ตรงกับแผนแล้ว','ใช้ได้ทั้งช่วงรอยืนยันและหลังเริ่มสัญญาณ','below'],
    destinations: ['ปลายทางแจ้งเตือน','เลือกรับสัญญาณผ่านช่องทางที่เชื่อมต่อไว้ กล่องแจ้งเตือนในเว็บมีเสมอ','การส่งอาจมีเวลาประมวลผลหลังแท่งปิด','none'],
    mirror: ['สลับเงื่อนไขให้ Short','กลับมากกว่าเป็นน้อยกว่า และตัดขึ้นเป็นตัดลง เพื่อสร้างเงื่อนไขอีกฝั่ง','ตัวเลขเดิมยังคงอยู่ เช่น RSI 30 ไม่เปลี่ยนเป็น 70 ต้องตรวจว่าเหมาะกับแผนไหม','crossDown'],
    import: ['นำเข้าอินดิเคเตอร์','นำเข้าสูตรรูปแบบ SNAAP JSON ที่รองรับ หรือดูแนวทางแปลงอินดิเคเตอร์ TradingView','ไม่สามารถรัน Pine Script ทุกชนิดโดยตรง','period'],
  };
  const operators = {
    '>':['มากกว่า (>)','ค่าฝั่งซ้ายต้องสูงกว่าฝั่งขวาบนแท่งที่ตรวจ','ถ้าอยู่เหนือเส้นอยู่แล้วก็ผ่าน ไม่จำเป็นต้องเพิ่งตัดขึ้น','above'],
    '>=':['มากกว่าหรือเท่ากับ (≥)','ฝั่งซ้ายสูงกว่าหรือเท่าฝั่งขวาก็ผ่าน','ค่าเท่ากันผ่านด้วย ต่างจากเครื่องหมาย >','above'],
    '<':['น้อยกว่า (<)','ค่าฝั่งซ้ายต้องต่ำกว่าฝั่งขวาบนแท่งที่ตรวจ','ถ้าอยู่ใต้เส้นอยู่แล้วก็ผ่าน ไม่จำเป็นต้องเพิ่งตัดลง','below'],
    '<=':['น้อยกว่าหรือเท่ากับ (≤)','ฝั่งซ้ายต่ำกว่าหรือเท่าฝั่งขวาก็ผ่าน','ค่าเท่ากันผ่านด้วย ต่างจากเครื่องหมาย <','below'],
    CROSS_ABOVE:['ตัดขึ้น','แท่งก่อนหน้า: ซ้าย ≤ ขวา → แท่งล่าสุด: ซ้าย > ขวา','ตรวจจังหวะข้ามขึ้นเท่านั้น อยู่เหนือเส้นต่อเฉย ๆ ไม่ผ่านข้อนี้','cross'],
    CROSS_BELOW:['ตัดลง','แท่งก่อนหน้า: ซ้าย ≥ ขวา → แท่งล่าสุด: ซ้าย < ขวา','ตรวจจังหวะข้ามลงเท่านั้น อยู่ใต้เส้นต่อเฉย ๆ ไม่ผ่านข้อนี้','crossDown'],
    AND:guides.group, OR:guides.group,
  };
  const indicator = {
    EMA:'เส้นเฉลี่ยราคา ให้น้ำหนักกับข้อมูลล่าสุดมากกว่า', SMA:'ค่าเฉลี่ยราคา ให้น้ำหนักแต่ละแท่งเท่ากัน', RSI:'ค่าความแรงของการขึ้นลง อยู่ในช่วง 0–100 ไม่ใช่หน่วยราคา', ATR:'ขนาดการแกว่งโดยเฉลี่ย อยู่ในหน่วยราคา ไม่บอกทิศทาง', VOLUME_RATIO:'วอลุ่มเทียบค่าเฉลี่ย เช่น 2 หมายถึงสองเท่าของช่วงอ้างอิง', MACD:'ส่วนต่างของเส้นเฉลี่ยเร็วกับช้า ใช้ดูแรงและทิศทาง', MACD_SIGNAL:'เส้นเฉลี่ยของ MACD ใช้เทียบกับค่า MACD', MACD_HIST:'MACD ลบเส้น Signal ค่าบวกและลบบอกว่าอยู่คนละฝั่ง', CUSTOM:'สูตรนำเข้าที่ระบบรองรับ ตรวจความหมายและหน่วยจากสูตรนั้น',
  };
  Object.assign(indicator, {WMA:'ค่าเฉลี่ยราคา ให้น้ำหนักมากขึ้นกับแท่งล่าสุดตามลำดับ',RMA:'ค่าเฉลี่ยแบบ Wilder ใช้ทำเส้นให้เรียบ',VWMA:'ค่าเฉลี่ยราคาให้น้ำหนักตามวอลุ่มของแต่ละแท่ง',ROC:'เปอร์เซ็นต์การเปลี่ยนราคาเทียบจำนวนแท่งย้อนหลัง',MOM:'ส่วนต่างราคาเทียบจำนวนแท่งย้อนหลัง หน่วยเดียวกับราคา',STDDEV:'ส่วนเบี่ยงเบนมาตรฐานของราคา ใช้วัดการกระจาย',VARIANCE:'ความแปรปรวนของราคา เป็นกำลังสองของส่วนเบี่ยงเบนมาตรฐาน',HIGHEST:'ค่าสูงสุดของแหล่งค่าที่เลือกในช่วงย้อนหลัง',LOWEST:'ค่าต่ำสุดของแหล่งค่าที่เลือกในช่วงย้อนหลัง',DONCHIAN_UPPER:'ขอบบนจากราคาสูงสุดในช่วงย้อนหลัง',DONCHIAN_LOWER:'ขอบล่างจากราคาต่ำสุดในช่วงย้อนหลัง',DONCHIAN_MID:'จุดกึ่งกลางระหว่างขอบบนและล่าง Donchian',STOCH_K:'ตำแหน่งราคาปิดเทียบช่วงสูง–ต่ำ อยู่ในช่วง 0–100',WILLIAMS_R:'ตำแหน่งราคาปิดเทียบช่วงสูง–ต่ำ อยู่ในช่วง −100 ถึง 0',CCI:'ราคาห่างจากค่าเฉลี่ยมากเพียงใด หลังปรับด้วยความแกว่ง',MFI:'แรงซื้อขายจากทั้งราคาและวอลุ่ม อยู่ในช่วง 0–100',CMF:'วัดแรงไหลเข้าออกโดยใช้ตำแหน่งราคาปิดและวอลุ่ม',BB_UPPER:'ขอบบน Bollinger: เส้นกลางบวกความแกว่งตามตัวคูณ',BB_LOWER:'ขอบล่าง Bollinger: เส้นกลางลบความแกว่งตามตัวคูณ',BB_MIDDLE:'เส้นค่าเฉลี่ยกลางของ Bollinger Bands',BB_WIDTH:'ความกว้าง Bollinger เทียบเส้นกลาง แสดงความแกว่ง',BB_PERCENT:'ตำแหน่งราคาในแถบ Bollinger: 0 ที่ขอบล่าง 1 ที่ขอบบน',TR:'True Range: ช่วงแกว่งที่รวมช่องว่างจากราคาปิดแท่งก่อน'});
  let active = null, tip = null, hideTimer, showTimer;
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function content(button) {
    const control = button._guideControl;
    if(button.dataset.guide==='op')return operators[control?.value] || guides.group;
    if(button.dataset.guide==='indicator') {
      const name=control?.value || 'อินดิเคเตอร์';
      const extended=window.SnaapIndicatorCatalog?.indicatorByName[name];
      if(extended)return [extended.label,extended.description,`หน่วย: ${extended.unit} · ใช้แท่งปิดจากกระดานที่เลือก`,null];
      return [name,indicator[name] || `ดูความหมาย สูตร และหน่วยของ ${name} ได้จากลิงก์ “สูตร หน่วย และข้อมูลที่ต้องใช้” ใต้การตั้งค่า`, 'ตรวจหน่วยของอินดิเคเตอร์ให้ตรงกับค่าที่นำมาเทียบ', ['RSI','STOCH_K','WILLIAMS_R','MFI','CCI'].includes(name)?'oscillator':'period'];
    }
    return guides[button.dataset.guide];
  }
  function close() {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    active?.removeAttribute('aria-describedby'); tip?.remove(); tip=null; active=null;
  }
  function position() {
    if(!active?.isConnected){close();return;}
    const rect=active.getBoundingClientRect(), w=tip.offsetWidth, h=tip.offsetHeight;
    const left=Math.max(12,Math.min(rect.left-12,innerWidth-w-12));
    const top=rect.bottom+h+12<=innerHeight ? rect.bottom+8 : Math.max(12,rect.top-h-8);
    tip.style.left=`${left}px`; tip.style.top=`${top}px`;
  }
  function open(button) {
    clearTimeout(hideTimer);clearTimeout(showTimer);
    if(active===button)return;
    close();active=button;
    const [title,description,note,mode]=content(button);
    tip=document.createElement('div');tip.id='snaap-setting-guide';tip.className='setting-guide';tip.setAttribute('role','tooltip');
    tip.innerHTML=`<div class="guide-eyebrow">รู้จักการตั้งค่านี้</div><strong>${escape(title)}</strong><p>${escape(description)}</p>${window.SnaapGuideScenes.render(button.dataset.guide, button._guideControl)}<p class="guide-note">${escape(note)}</p>`;
    document.body.append(tip);button.setAttribute('aria-describedby',tip.id);position();
    tip.onpointerenter=()=>clearTimeout(hideTimer);
    tip.onpointerleave=()=>hideTimer=setTimeout(close,180);
  }
  function add(target,key,control) {
    if(!target||target.dataset.guideEnhanced)return;
    target.dataset.guideEnhanced='true';
    const button=document.createElement('button');button.type='button';button.className='setting-guide-trigger';button.dataset.guide=key;button._guideControl=control;
    const title=key==='op'?'การเปรียบเทียบ':key==='indicator'?'อินดิเคเตอร์':guides[key][0];
    button.setAttribute('aria-label',`คำแนะนำ: ${title}`);button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 5.8v5.2M10 13.8v.4"/></svg>';
    if(control && !control.hasAttribute('aria-label')) {
      const originalName=[...target.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();
      if(originalName)control.setAttribute('aria-label',originalName);
    }
    if(target.tagName==='LEGEND' && !target.parentElement.hasAttribute('aria-label'))target.parentElement.setAttribute('aria-label',target.textContent.trim());
    if(target.tagName==='LABEL' && control) {
      const caption=document.createElement('span');caption.className='guide-label';
      const textNodes=[...target.childNodes].filter(node=>node.nodeType===3 && node.textContent.trim());
      target.prepend(caption);textNodes.forEach(node=>caption.append(node));caption.append(button);
    } else target.append(button);
    button.onpointerenter=e=>{if(e.pointerType!=='touch'){clearTimeout(hideTimer);showTimer=setTimeout(()=>open(button),220);}};
    button.onpointerleave=()=>{clearTimeout(showTimer);hideTimer=setTimeout(close,180);};
    button.onfocus=()=>open(button);button.onblur=()=>hideTimer=setTimeout(close,180);
    button.onclick=e=>{e.preventDefault();e.stopPropagation();open(button);};
  }
  function scan() {
    if(active&&!active.isConnected)close();
    const panel=document.querySelector('.design-panel');if(!panel)return;
    panel.querySelectorAll('label').forEach(label=>{
      const control=label.querySelector('select[data-path],input[data-path],select[data-opkind]');if(!control)return;
      const path=control.dataset.path||'', suffix=path.split('.').at(-1);
      const key=control.hasAttribute('data-opkind')?'kind':suffix==='op'?'op':suffix==='name'?(path==='name'?'name':'indicator'):suffix==='timeframe'?(path==='timeframe'?'timeframe':'operandFrame'):suffix;
      if(guides[key]||key==='op'||key==='indicator')add(label,key,control);
    });
    add(panel.querySelector('.exchange-fieldset legend'),'exchange');
    add(panel.querySelector('.pair-control > span'),'pair');
    add(panel.querySelector('.destination-choices legend'),'destinations');
    panel.querySelectorAll('.setup-section h3').forEach(title=>add(title,title.textContent.includes('รอยืนยัน')?'withinBars':title.textContent.includes('ออก')?'exit':'entry'));
    panel.querySelectorAll('.optional-heading h4').forEach(title=>add(title,title.textContent.includes('ยกเลิก')?'cancel':'exit'));
    panel.querySelectorAll('.condition-group').forEach(group=>add(group,'group',group.querySelector('select[data-path$=".op"]')));
    for(const [selector,key] of [['[data-import-indicator]','import'],['[data-group]','group'],['[data-hold]','bars']])panel.querySelectorAll(selector).forEach(button=>{
      if(button.parentElement.classList.contains('guide-action'))return;
      const wrapper=document.createElement('span');wrapper.className='guide-action';button.before(wrapper);wrapper.append(button);add(wrapper,key);
    });
    add(panel.querySelector('.direction-mirror-row'),'mirror');
    add(panel.querySelector('.setup-direction legend'),'direction');
  }
  document.addEventListener('setup-rendered',()=>{close();requestAnimationFrame(scan);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('pointerdown',e=>{if(active&&!e.target.closest('.setting-guide-trigger,.setting-guide'))close();});
  document.addEventListener('scroll',()=>{if(tip)position();},true);
  window.addEventListener('resize',()=>{if(tip)position();});
  scan();
})();
