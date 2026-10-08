function setupCodeDialog(title){
 const dialog=document.createElement('dialog');dialog.className='setup-files-dialog';
 dialog.innerHTML=`<header><h2>${esc(title)}${(globalThis.SnaapI18n?.text("</h2><button type=\"button\" class=\"icon-button\" aria-label=\"ปิด\">") ?? "</h2><button type=\"button\" class=\"icon-button\" aria-label=\"ปิด\">")}${uiIcon('close')}</button></header><div class="setup-files-content"></div>`;
 dialog.querySelector('header button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();return dialog;
}
function openSetupImport(){
 const workspaceId=state.workspaceId,dialog=setupCodeDialog((globalThis.SnaapI18n?.text("นำเข้าเซ็ตอัพ") ?? "นำเข้าเซ็ตอัพ")),content=dialog.querySelector('.setup-files-content');
 content.innerHTML=(globalThis.SnaapI18n?.text("<form class=\"setup-code-form\"><label>โค้ดเซ็ตอัพ<input name=\"code\" required maxlength=\"100\" placeholder=\"วางโค้ด SNAAP…\" autocomplete=\"off\" spellcheck=\"false\" autocapitalize=\"characters\"></label><p class=\"setup-code-error\" role=\"alert\" hidden></p><div class=\"setup-code-preview\" hidden></div><div class=\"row-actions\"><button class=\"primary\" type=\"submit\">ดูเซ็ตอัพ</button></div></form>") ?? "<form class=\"setup-code-form\"><label>โค้ดเซ็ตอัพ<input name=\"code\" required maxlength=\"100\" placeholder=\"วางโค้ด SNAAP…\" autocomplete=\"off\" spellcheck=\"false\" autocapitalize=\"characters\"></label><p class=\"setup-code-error\" role=\"alert\" hidden></p><div class=\"setup-code-preview\" hidden></div><div class=\"row-actions\"><button class=\"primary\" type=\"submit\">ดูเซ็ตอัพ</button></div></form>");
 const form=content.querySelector('form'),field=form.querySelector('input'),errorBox=form.querySelector('[role=alert]'),preview=form.querySelector('.setup-code-preview'),button=form.querySelector('button');let previewCode=null;
 field.oninput=()=>{previewCode=null;preview.hidden=true;errorBox.hidden=true;button.textContent=(globalThis.SnaapI18n?.text("ดูเซ็ตอัพ") ?? "ดูเซ็ตอัพ");};
 form.onsubmit=async event=>{
  event.preventDefault();button.disabled=true;errorBox.hidden=true;
  try{
   if(state.workspaceId!==workspaceId)throw Error((globalThis.SnaapI18n?.text("เวิร์กสเปซเปลี่ยนแล้ว กรุณาเปิดนำเข้าอีกครั้ง") ?? "เวิร์กสเปซเปลี่ยนแล้ว กรุณาเปิดนำเข้าอีกครั้ง"));
   const code=field.value.trim();
   if(previewCode===code){await api('/setup-shares/'+encodeURIComponent(code)+'/import','POST',{});dialog.close();await refresh();toast((globalThis.SnaapI18n?.text("เพิ่มเซ็ตอัพแล้ว") ?? "เพิ่มเซ็ตอัพแล้ว"));window.SnaapRouter.go("notifications");}
   else{
    preview.hidden=false;preview.innerHTML=skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังโหลดเซ็ตอัพ…") ?? "กำลังโหลดเซ็ตอัพ…"));
    const {setup}=await api('/setup-shares/'+encodeURIComponent(code));if(field.value.trim()!==code)return;
    preview.innerHTML=`<strong>${esc(setup.name)}</strong><small>${esc(setup.exchange.join(', '))} · ${esc(setup.market)} · ${esc(setup.pairs.join(', '))} · ${esc(setup.timeframe)}</small><p>${esc(fullSummary(setup))}${(globalThis.SnaapI18n?.text("</p><small>เพิ่มใน ") ?? "</p><small>เพิ่มใน ")}${esc(state.workspaces.find(w=>w.id===workspaceId)?.name??(globalThis.SnaapI18n?.text("พื้นที่หลัก") ?? "พื้นที่หลัก"))}${(globalThis.SnaapI18n?.text(" · ยังไม่เปิดแจ้งเตือน</small>") ?? " · ยังไม่เปิดแจ้งเตือน</small>")}`;
    preview.hidden=false;previewCode=code;button.textContent=(globalThis.SnaapI18n?.text("เพิ่มเซ็ตอัพ") ?? "เพิ่มเซ็ตอัพ");
   }
  }catch(error){preview.hidden=true;errorBox.textContent=error.message;errorBox.hidden=false;}finally{button.disabled=false;}
 };field.focus();
}
async function exportSetupCode(ruleId,trigger){
 trigger.disabled=true;
 const dialog=setupCodeDialog((globalThis.SnaapI18n?.text("ส่งออกเซ็ตอัพ") ?? "ส่งออกเซ็ตอัพ")),content=dialog.querySelector('.setup-files-content');
 content.innerHTML=skeletonUI('rows', (globalThis.SnaapI18n?.text("กำลังสร้างโค้ดเซ็ตอัพ…") ?? "กำลังสร้างโค้ดเซ็ตอัพ…"));
 try{
  const {code}=await api('/setup-shares','POST',{ruleId});if(!dialog.open)return;
  content.innerHTML=`${(globalThis.SnaapI18n?.text("<p>ส่งโค้ดนี้ให้คนอื่นได้เลย</p><input class=\"setup-share-code\" aria-label=\"โค้ดแชร์เซ็ตอัพ\" readonly value=\"") ?? "<p>ส่งโค้ดนี้ให้คนอื่นได้เลย</p><input class=\"setup-share-code\" aria-label=\"โค้ดแชร์เซ็ตอัพ\" readonly value=\"")}${esc(code)}${(globalThis.SnaapI18n?.text("\"><div class=\"row-actions\"><button type=\"button\" class=\"primary\" data-copy-code>คัดลอกโค้ด</button></div>") ?? "\"><div class=\"row-actions\"><button type=\"button\" class=\"primary\" data-copy-code>คัดลอกโค้ด</button></div>")}`;
  content.querySelector('[data-copy-code]').onclick=async()=>{try{await navigator.clipboard.writeText(code);toast((globalThis.SnaapI18n?.text("คัดลอกโค้ดแล้ว") ?? "คัดลอกโค้ดแล้ว"));}catch{content.querySelector('input').select();toast((globalThis.SnaapI18n?.text("เลือกโค้ดแล้ว กด Ctrl+C เพื่อคัดลอก") ?? "เลือกโค้ดแล้ว กด Ctrl+C เพื่อคัดลอก"));}};
 }catch(error){if(dialog.open)content.innerHTML='<p role="alert">'+esc(error.message)+'</p>';toast(error.message);}finally{trigger.disabled=false;}
}
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.hasAttribute('data-import-setup-code'))openSetupImport();
 if(button.hasAttribute('data-export-setup-code'))exportSetupCode(button.dataset.exportSetupCode,button);
});
