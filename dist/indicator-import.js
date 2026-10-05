// Declarative import only: never execute uploaded JavaScript or Pine.
document.addEventListener('click',e=>{
 const button=e.target.closest('[data-import-indicator]');if(!button)return;
 const path=button.dataset.importIndicator;
 const originalDraft=JSON.stringify(state.draft), originalWorkspace=state.workspaceId;
 const existing=path.split(".").reduce((value,key)=>value?.[key],state.draft);
 const dialog=document.createElement('dialog');dialog.className='about-dialog indicator-import-dialog';dialog.setAttribute('aria-label','นำเข้าอินดิเคเตอร์');
 dialog.innerHTML=`<h2>นำเข้าอินดิเคเตอร์</h2><p>รองรับสูตร SNAAP JSON v1: ผลรวมถ่วงน้ำหนักของ SMA, EMA, WMA, RMA, RSI, ATR, ROC, MOM และ STDDEV รวมค่าคงที่</p><p>ใช้บนกราฟและเงื่อนไขแจ้งเตือนได้ สูตรจะบันทึกไปกับเวอร์ชันเซ็ตอัพ</p><details><summary>ใช้ indicator จาก TradingView</summary><p>ถ้าเป็นสูตรมาตรฐาน ให้เลือกชื่อและตั้งค่าให้ตรง รวมถึงกระดาน คู่เทรด กรอบเวลา และแหล่งราคา</p><p>ถ้าเปิดเผยโค้ด ให้ตรวจสิทธิ์การใช้งานและแปลงเฉพาะสูตรที่รองรับเป็น JSON ก่อน เรายังไม่รัน Pine Script หรืออ่านสูตรจากภาพ</p><p>Protected / Invite-only ไม่เปิดเผยสูตร จึงนำเข้าตรงๆ ไม่ได้ การ export ค่ากราฟก็ไม่ใช่สูตรสำหรับคำนวณแท่งใหม่</p><a href="https://www.tradingview.com/support/solutions/43000482573-what-are-the-different-types-of-published-scripts/" target="_blank" rel="noopener">ข้อจำกัดจาก TradingView</a></details><p><a href="/assets/indicator-example.json" download>ดาวน์โหลดตัวอย่าง EMA 12 − EMA 26</a></p><div class="indicator-file-field"><span>ไฟล์สูตร JSON</span><input type="file" accept=".json,application/json" aria-label="ไฟล์สูตร JSON" hidden><button class="indicator-file-picker" type="button" data-pick-file><span class="indicator-file-icon" aria-hidden="true">${uiIcon("file")}</span><span class="indicator-file-copy"><strong>เลือกไฟล์สูตร</strong><small data-file-name>ไฟล์ .json · ไม่เกิน 16 KB</small></span><span aria-hidden="true">＋</span></button></div><p role="status" class="indicator-file-status" aria-live="polite"></p><button class="secondary" type="button" data-close-import>ปิด</button>`;
 document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-close-import]').onclick=()=>dialog.close();dialog.querySelector('[data-pick-file]').onclick=()=>dialog.querySelector('input').click();dialog.onclose=()=>{dialog.remove();[...document.querySelectorAll("[data-import-indicator]")].find(el=>el.dataset.importIndicator===path)?.focus();};
 dialog.querySelector('input').onchange=async e=>{
  const status=dialog.querySelector('[role=status]');try{
   const file=e.target.files[0];if(!file)return;dialog.querySelector('[data-file-name]').textContent=file.name;status.textContent='กำลังตรวจไฟล์…';dialog.querySelector('[data-pick-file]').disabled=true;if(file.size>16384)throw Error('ไฟล์ต้องไม่เกิน 16 KB');
   const formula=JSON.parse(await file.text());
   const candidate={kind:'INDICATOR',name:'CUSTOM',period:14,timeframe:existing?.timeframe||state.draft.timeframe,source:existing?.source||'close',formula};
   // Server uses the same strict schema as saved strategies.
   if(!dialog.open)return;
   const checked=await api('/indicators/validate','POST',candidate);
   if(!dialog.open)return;
   if(state.workspaceId!==originalWorkspace||JSON.stringify(state.draft)!==originalDraft)throw Error('เซ็ตอัพเปลี่ยนระหว่างนำเข้า กรุณาปิดแล้วเปิดนำเข้าใหม่');
   snapshot();set(path,checked);queueDraftSave();renderDesigner();dialog.close();toast('นำเข้าสูตรแล้ว ตรวจกราฟและเงื่อนไขก่อนเปิดใช้งาน');
  }catch(error){status.textContent=error instanceof SyntaxError?'ไฟล์นี้ไม่ใช่ JSON ที่สมบูรณ์ กรุณาตรวจไฟล์แล้วเลือกใหม่':error.message==='ข้อมูลไม่ถูกต้อง'?'สูตรไม่ตรงกับ SNAAP JSON v1 กรุณาตรวจชื่ออินดิเคเตอร์ ระยะ และน้ำหนักตามไฟล์ตัวอย่าง':error.message||'อ่านสูตรไม่สำเร็จ';}
  finally{dialog.querySelector('[data-pick-file]').disabled=false;e.target.value='';}
 };
});
