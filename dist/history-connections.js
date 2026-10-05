async function renderConnections(host = $("#view-history"), data) {
  data ??= await api("/connections");
  const section = document.createElement("div");
  section.className = "runtime-card";
  section.id = "history-connections";
  section.innerHTML = `<h2>เชื่อมประวัติจากกระดาน</h2><p>ใช้ประวัติจากกระดานมาช่วยออกแบบเซตอัป</p><p class="field-note">Binance / Bybit Spot · ครั้งละไม่เกิน 100 รายการตามคู่และช่วงเวลา<br>OKX / Bitget / MEXC ใช้ไฟล์นำเข้าในระหว่างตรวจรับตัวเชื่อมบัญชี</p>${data.items.map((x) => `<div class="connection-item"><strong>${esc(x.name)} · ${esc(x.exchange)} · ${esc(x.market??'Spot')}</strong><p>${x.last_sync ? "ซิงก์ล่าสุด " + new Date(x.last_sync).toLocaleString("th-TH") : "ยังไม่ซิงก์"} · ${esc(x.status)}</p><div class="connection-auto-status" data-auto-status></div><button class="text-button" data-revoke-key="${x.id}">ยกเลิกการเชื่อม</button></div>`).join("")}<details class="add-history-connection"><summary>เพิ่มการเชื่อมต่อ API</summary><form id="connect-history"><label>กระดาน<select name="exchange"><option>Binance</option><option>Bybit</option></select></label><label>ชื่อเรียกการเชื่อมต่อ<input name="name" required maxlength="80" placeholder="เช่น MEXC เทรดสั้น"></label><label>API key<input name="apiKey" type="password" autocomplete="off" required></label><label>API secret<input name="secret" type="password" autocomplete="off" required></label><p class="field-note">ใช้สิทธิ์ Read-only สำหรับประวัติ · Snaap ไม่อ่านยอดบัญชีหรือสินทรัพย์ และเก็บ key แบบเข้ารหัส</p><button type="submit" class="secondary" ${data.enabled ? "" : "disabled"}>ตรวจสิทธิ์และเชื่อม</button>${data.enabled ? "" : "<p>ผู้ดูแลต้องตั้งค่าการเข้ารหัสบนเซิร์ฟเวอร์ก่อน</p>"}</form></details>`;
  const previousSection=host.querySelector("#history-connections");
  const exchangeSelect = section.querySelector('select[name="exchange"]');
  exchangeSelect.innerHTML = ['Binance','Bybit','OKX','Bitget','MEXC'].map(name => `<option>${esc(name)}</option>`).join('');
  const form=section.querySelector('#connect-history');
  const privacyNote=form.querySelector('button[type="submit"]').previousElementSibling;
  privacyNote.classList.add('connection-privacy-note');
  form.querySelector('input[name="name"]').closest('label').classList.add('connection-name-field');
  data.items.forEach((item,index)=>{
    const card=section.querySelectorAll('.connection-item')[index];
    const disconnect=card.querySelector('[data-revoke-key]');
    disconnect.setAttribute('aria-label','ยกเลิกการเชื่อม '+item.name);
    const imported=[...host.querySelectorAll('[data-import-connection]')].find(node=>node.dataset.importConnection===item.id);
    {
      if(imported)[...host.querySelectorAll('[data-import-connection]')].filter(node=>node.dataset.importConnection===item.id).forEach(node=>node.remove());
      const header=document.createElement('div');header.className='history-api-header';
      card.prepend(header);header.append(card.querySelector('strong'),disconnect);
    }
    const detail=item.sync_details??{};
    const running=['VERIFIED','SYNCING'].includes(item.status);
    const status={VERIFIED:'รอซิงก์อัตโนมัติ',SYNCING:'กำลังซิงก์ประวัติ',SYNCED_WINDOW:'ซิงก์ช่วงประวัติแล้ว',PARTIAL_SYNC:'ซิงก์แล้ว · ข้อมูลบางส่วน',SYNC_FAILED:'ซิงก์ไม่สำเร็จ'}[item.status]??item.status;
    card.querySelector('p').textContent=(item.last_sync?'อัปเดต '+new Date(item.last_sync).toLocaleString('th-TH')+' · ':'')+status;
    const auto=card.querySelector('[data-auto-status]');
    const progress=detail.total?Math.min(100,Math.round((detail.completed??0)/detail.total*100)):0;
    auto.innerHTML=`${running?'<div class="history-sync-skeleton" aria-hidden="true"><span></span><span></span></div>':''}<div class="history-sync-caption"><span>${item.status==='SYNC_FAILED'?'ซิงก์ติดขัด ลองใหม่ได้':running?'Snaap กำลังอ่านรายการเทรดให้คุณอัตโนมัติ':'อ่านรายการเทรดอัตโนมัติ · อัปเดตทุก 6 ชั่วโมง'}</span><strong>${detail.rows??0} รายการ</strong></div>${running?`<div class="history-sync-progress" role="progressbar" aria-label="ความคืบหน้าซิงก์ประวัติ" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><small>${detail.total?`ตรวจแล้ว ${detail.completed??0} / ${detail.total} ช่วงคู่เทรด`:'กำลังตรวจสิทธิ์และเตรียมข้อมูล'}</small>`:''}<p class="field-note">${detail.from?`ช่วงที่ขออ่าน ${new Date(detail.from).toLocaleDateString('th-TH')} – ${new Date(detail.to).toLocaleDateString('th-TH')} · `:''}ย้อนหลังเริ่มต้นสูงสุด 90 วัน ตามคู่และข้อมูลที่ API เปิดให้ ไม่ใช่ประวัติทั้งหมดตลอดอายุบัญชี</p>${item.status==='SYNC_FAILED'?`<p class="connection-feedback" role="status">${esc(detail.error??'อ่านประวัติไม่สำเร็จ')}</p><button type="button" class="secondary" data-retry-history="${item.id}">ลองซิงก์อีกครั้ง</button>`:''}`;
  });
  const marketField=document.createElement('label');
  marketField.innerHTML='ตลาด<select name="market" aria-label="ตลาดที่ต้องการเชื่อม"><option value="Spot">Spot</option><option value="Futures">Futures</option></select>';
  exchangeSelect.closest('label').after(marketField);
  const marketSelect=marketField.querySelector('select');
  const keyInput=form.querySelector('input[name="apiKey"]');
  const keyLabel=keyInput.closest('label');
  keyLabel.firstChild.textContent='API Key';
  form.querySelector('input[name="secret"]').closest('label').firstChild.textContent='Secret Key';
  for(const input of [keyInput,form.querySelector('input[name="secret"]')]){input.spellcheck=false;input.setAttribute('autocapitalize','none');input.setAttribute('maxlength','200');}
  const passphrase=document.createElement('label');
  passphrase.className='connection-passphrase-field';
  passphrase.innerHTML='Passphrase<input name="passphrase" type="password" autocomplete="off" maxlength="200"><small class="field-note">รหัสที่คุณตั้งไว้ตอนสร้าง API key บนกระดาน</small>';
  form.querySelector('input[name="secret"]').closest('label').after(passphrase);
  const apiFields=[...form.children].filter(child=>child!==exchangeSelect.closest('label'));
  const fileMethod=document.createElement('div');
  fileMethod.className='connection-file-method';
  fileMethod.hidden=true;
  fileMethod.innerHTML='<p data-import-method-note></p><p class="field-note">ใช้ไฟล์ CSV / XLSX ตามรูปแบบที่รองรับ ตรวจรายการก่อนบันทึกได้</p><button type="button" class="secondary" data-choose-history-file>เลือกไฟล์ประวัติ</button><a href="/assets/trade-import-template.csv" download>ดาวน์โหลดไฟล์ต้นแบบ</a>';
  form.append(fileMethod);
  const historyRange=document.createElement('p');
  historyRange.className='field-note';
  form.append(historyRange);
  const guide=document.createElement('details');guide.className='connection-api-guide';
  guide.innerHTML='<summary>วิธีตั้งค่า API</summary><p class="field-note" data-api-guide></p>';
  keyLabel.before(guide);
  const updateMethod=()=>{
    const apiSupported=data.supported.includes(exchangeSelect.value);
    privacyNote.textContent='อ่านเฉพาะประวัติเทรด ไม่อ่านยอดเงิน · เก็บคีย์แบบเข้ารหัส';
    keyLabel.firstChild.textContent=exchangeSelect.value==='MEXC'?'Access Key':'API Key';
    keyInput.placeholder=exchangeSelect.value==='MEXC'?'วาง Access Key จาก MEXC':'วาง API Key จากกระดาน';
    form.querySelector('input[name="secret"]').placeholder='วาง Secret Key คู่เดียวกัน';
    guide.querySelector('[data-api-guide]').textContent={
      MEXC:`เลือก ${marketSelect.value} แล้วติ๊ก View Order Details (อ่านออเดอร์) เท่านั้น ไม่ต้องติ๊ก View Account Details`,
      Binance:'ติ๊ก Enable Reading (อ่านข้อมูล) เท่านั้น ไม่เปิดสิทธิ์ซื้อขายหรือถอนเงิน',
      Bybit:`เลือก Read-Only (อ่านอย่างเดียว) แล้วเปิดอ่าน ${marketSelect.value==='Spot'?'Spot':'Contract → Orders / Positions'} ไม่เปิดสิทธิ์ซื้อขายหรือถอนเงิน`,
      OKX:'เลือก Read (อ่านข้อมูล) เท่านั้น ไม่เลือก Trade หรือ Withdraw · Snaap ไม่อ่านยอดเงิน',
      Bitget:`เลือก Read-only (อ่านอย่างเดียว) แล้วเปิดอ่านประวัติ ${marketSelect.value} · บัญชี UTA เลือก UTA trade (read)`,
    }[exchangeSelect.value];
    form.dataset.apiSupported=String(apiSupported);
    apiFields.forEach(field=>{field.hidden=!apiSupported;field.querySelectorAll('input').forEach(input=>input.disabled=!apiSupported);});
    const needsPassphrase=apiSupported && ['OKX','Bitget'].includes(exchangeSelect.value);
    passphrase.hidden=!needsPassphrase;
    passphrase.querySelector('input').disabled=!needsPassphrase;
    passphrase.querySelector('input').required=needsPassphrase;
    historyRange.textContent='ซิงก์ประวัติอัตโนมัติย้อนหลังสูงสุด 90 วัน ตามข้อมูลที่กระดานให้';
    fileMethod.hidden=apiSupported;
    fileMethod.querySelector('[data-import-method-note]').textContent=`${exchangeSelect.value} · นำเข้าผ่านไฟล์ ตอนนี้ยังเชื่อมประวัติผ่าน API ไม่ได้`;
  };
  exchangeSelect.addEventListener('change',updateMethod);
  marketSelect.addEventListener('change',updateMethod);
  fileMethod.querySelector('[data-choose-history-file]').onclick=()=>{
    $('#account-scope').value=exchangeSelect.value+' บัญชีหลัก';
    $('#history-upload').click();
  };
  updateMethod();
  const feedback=document.createElement('p');
  feedback.className='connection-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.hidden=true;
  const submitButton=form.querySelector('button[type="submit"]');
  const footer=document.createElement('div');footer.className='connection-form-footer';
  const notes=document.createElement('div');notes.className='connection-form-notes';
  notes.append(privacyNote,historyRange);
  footer.append(notes,submitButton,feedback);
  form.append(footer);
  const capabilities = document.createElement('div');
  capabilities.className = 'history-exchange-capabilities';
  capabilities.setAttribute('aria-label', 'วิธีนำเข้าประวัติแต่ละกระดาน');
  capabilities.innerHTML = ['Binance','Bybit','OKX','Bitget','MEXC'].map(name => `<div><strong>${name}</strong><span>${data.supported.includes(name) ? 'เชื่อม API · Spot / Futures' : 'นำเข้า CSV / XLSX'}</span></div>`).join('');
  section.querySelector('.field-note').replaceWith(capabilities);
  const scope = document.createElement('p');
  scope.className = 'field-note connection-scope';
  scope.textContent = 'อ่านเฉพาะประวัติซื้อขาย · ไม่อ่านยอดเงินหรือสินทรัพย์ · เชื่อมแยก Spot / Futures';
  capabilities.after(scope);
  if(previousSection)previousSection.replaceWith(section);else host.append(section);
  scheduleHistorySyncRefresh();
}
function confirmHistoryConnection(exchange, market, trigger) {
  return new Promise(resolve=>{
    const dialog=document.createElement('dialog');
    dialog.className='runtime-dialog connection-consent-dialog';
    dialog.setAttribute('aria-labelledby','history-consent-title');
    dialog.setAttribute('aria-describedby','history-consent-description');
    const permissionNote=exchange==='MEXC'
      ?'เลือก View Order Details เท่านั้น หากไม่เปิด View Account Details คีย์จะไม่มีสิทธิ์อ่านข้อมูลบัญชีในหมวดนั้น'
      :'เลือก Read-only และสิทธิ์อ่านประวัติที่จำเป็น บางกระดานรวมบัญชีกับประวัติไว้ในสิทธิ์ Read เดียว แต่ตัวเชื่อม Snaap บล็อก API ยอดเงินและสินทรัพย์';
    dialog.innerHTML=`<div class="consent-overline">${uiIcon('link')} ${esc(exchange)} · ${esc(market)}</div><h2 id="history-consent-title">ให้ Snaap อ่านประวัติเทรด?</h2><p id="history-consent-description">ใช้รายการซื้อขายเพื่อช่วยออกแบบเซตอัป เมื่อคุณเปิด “ใช้ข้อมูลของฉัน” ในแชท</p><div class="consent-data-scope"><span>${uiIcon('check')}</span><div><strong>ข้อมูลเทรดที่เก็บ</strong><p>คู่เทรด เวลา ซื้อ/ขาย ราคา จำนวน ค่าธรรมเนียม และข้อมูลสัญญา Futures ที่มี</p></div></div><div class="consent-data-scope"><span>${uiIcon('save')}</span><div><strong>ข้อมูลสำหรับเชื่อมต่อ</strong><p>ชื่อเรียกที่คุณตั้ง คีย์ API แบบเข้ารหัส สถานะซิงก์ และบันทึกการยินยอม · ไม่ส่งคีย์ให้ LLM</p></div></div><p class="consent-permission-note">${esc(permissionNote)}</p><p class="field-note">ไม่เรียกยอดเงินหรือสินทรัพย์ ไม่ส่งคำสั่งเทรด โอน หรือถอน · ยกเลิกการเชื่อมได้ภายหลัง คีย์ที่เก็บจะถูกลบ แต่ประวัติที่นำเข้าแล้วยังอยู่</p><div class="design-actions"><button type="button" class="secondary" data-consent-cancel autofocus>ยกเลิก</button><button type="button" class="primary" data-consent-accept>ตกลงและเชื่อม</button></div>`;
    let accepted=false;
    dialog.querySelector('[data-consent-cancel]').onclick=()=>dialog.close();
    dialog.querySelector('[data-consent-accept]').onclick=()=>{accepted=true;dialog.close();};
    dialog.addEventListener('close',()=>{dialog.remove();if(trigger.isConnected)trigger.focus({preventScroll:true});resolve(accepted);},{once:true});
    document.body.append(dialog);dialog.showModal();
  });
}
document.addEventListener("submit", async (e) => {
  if (e.target.id !== "connect-history" && !e.target.dataset.sync) return;
  e.preventDefault();
  if(e.target.id==='connect-history' && e.target.dataset.apiSupported!=='true')return;
  const button = e.target.querySelector('button[type="submit"]');
  const feedback=e.target.querySelector('.connection-feedback');
  if(button.disabled)return;
  const submittedForm = e.target;
  const data = Object.fromEntries(new FormData(submittedForm));
  if(submittedForm.id==='connect-history'){
    button.disabled=true;
    let accepted;
    try{accepted=await confirmHistoryConnection(data.exchange,data.market,button);}finally{button.disabled=false;}
    if(!accepted||!submittedForm.isConnected)return;
    data.privacyConsent='trade-history-v1';
  }
  const originalLabel=button.textContent;
  if(feedback){feedback.hidden=false;feedback.dataset.state='pending';feedback.textContent='กำลังตรวจสิทธิ์กับกระดาน…';}
  button.textContent=e.target.id==='connect-history'?'กำลังตรวจสิทธิ์…':'กำลังดึงประวัติ…';
  button.disabled = true;
  try {
    if (e.target.id === "connect-history") {
      data.apiKey=data.apiKey.trim();data.secret=data.secret.trim();
      await api("/connections", "POST", data);
      e.target.reset();
      toast("เชื่อมสำเร็จ · กำลังซิงก์ประวัติอัตโนมัติ");
    } else {
      data.from = new Date(data.from).toISOString();
      const result = await api(
        "/connections/" + e.target.dataset.sync + "/sync",
        "POST",
        data,
      );
      toast(
        `เพิ่ม ${result.inserted} รายการ · ข้อมูลบางส่วน ไม่ใช่ประวัติทั้งบัญชี`,
      );
    }
    await renderHistory();
  } catch (error) {
    if(feedback){feedback.hidden=false;feedback.dataset.state='error';feedback.textContent=error.message;}
    toast(error.message);
  } finally {
    button.textContent=originalLabel;
    button.disabled = false;
  }
});
document.addEventListener("click", async (e) => {
  const refreshButton = e.target.closest('[data-history-refresh]');
  if (refreshButton) {
    if (refreshButton.disabled) return;
    refreshButton.disabled = true;
    refreshButton.textContent = 'กำลังอัปเดต…';
    try { await renderHistory(); } finally { refreshButton.disabled = false; refreshButton.textContent = 'รีเฟรชข้อมูล'; }
    return;
  }
  const button = e.target.closest("[data-revoke-key]");
  if (!button || button.disabled) return;
  button.disabled = true;
  button.textContent = 'กำลังยกเลิก…';
  try {
    await api("/connections/" + button.dataset.revokeKey, "DELETE");
    toast('ยกเลิกการเชื่อมแล้ว');
    await renderHistory();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'ยกเลิกการเชื่อม';
  }
});

let historySyncRefresh;
function scheduleHistorySyncRefresh(){
  clearTimeout(historySyncRefresh);
  if(document.querySelector('#history-connections .history-sync-skeleton'))historySyncRefresh=setTimeout(async()=>{
    if(document.querySelector('#view-history')?.hidden || document.visibilityState!=='visible'){scheduleHistorySyncRefresh();return;}
    if(document.activeElement?.closest('#view-history input') || document.querySelector('.add-history-connection[open], .history-file-details[open]')){scheduleHistorySyncRefresh();return;}
    try{await renderConnections();if(!document.querySelector('#history-connections .history-sync-skeleton'))await renderHistory();}catch{}finally{scheduleHistorySyncRefresh();}
  },5000);
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('[data-retry-history]');if(!button||button.disabled)return;
  button.disabled=true;
  try{await api('/connections/'+button.dataset.retryHistory+'/auto-sync','POST',{});await renderHistory();}catch(error){toast(error.message);button.disabled=false;}
});
