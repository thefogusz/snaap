async function renderLabImageChoices() {
  const target=sources.querySelector('[data-saved-images]');
  const images=await api('/images');
  state.allLibraryImages=images;
  state.libraryImages=images.slice(0,5);
  target.innerHTML=`<h3>ภาพจากข้อมูลของฉัน</h3><p class="field-note">${images.length ? `ใช้ภาพในคลังอัตโนมัติ ${state.libraryImages.length} ภาพ · พิมพ์ @ชื่อภาพ เพื่อระบุภาพที่ต้องการอ้างอิง` : 'ยังไม่มีภาพ เพิ่มภาพอ้างอิงได้ที่ข้อมูลของฉัน'}</p>`;
}
async function renderTradingLab() {
  const images=await api('/images');
  state.allLibraryImages=images;
  const section=document.createElement('section');
  section.className='runtime-card trading-lab-images';
  section.innerHTML=`<div class="library-heading"><h2>ภาพอ้างอิงของฉัน</h2><span class="library-count">${images.length}/5 ภาพ</span></div><p class="library-intro">อัปโหลดกราฟ อินดิเคเตอร์ หรือภาพอ้างอิง · Snaap ใช้ร่วมกับประวัติที่นำเข้าเมื่อเปิด “ใช้ข้อมูลของฉัน”</p><label class="file-drop"><span><strong>เพิ่มภาพ</strong><small>PNG / JPEG / WebP · ไม่เกิน 5 MB</small></span><input type="file" id="lab-image-upload" accept="image/png,image/jpeg,image/webp"></label><div class="lab-image-grid">${images.map(i=>`<article><img src="${esc(i.url)}" alt="${esc(i.name)}" loading="lazy"><div class="library-image-slot"></div></article>`).join('')}</div><p class="field-note library-retention">เก็บไว้จนกว่าคุณจะลบ · เปลี่ยนชื่อแล้วใช้ @ชื่อภาพ ในแชทได้</p>`;
  $$('#view-history .trading-lab-images').forEach(existing=>existing.remove());
  section.querySelector('#lab-image-upload').disabled=images.length>=5;
  section.querySelectorAll('.lab-image-grid article').forEach((card,index)=>{
    const image=images[index],tools=document.createElement('div');tools.className='library-image-tools';
    tools.innerHTML=`<input value="${esc(image.name)}" maxlength="60" aria-label="ชื่อภาพ ${esc(image.name)}"><button type="button" class="library-icon-button" data-rename-image aria-label="บันทึกชื่อภาพ" title="บันทึกชื่อภาพ">${uiIcon('save')}</button><button type="button" class="library-icon-button library-delete" data-delete-image aria-label="ลบภาพ ${esc(image.name)}" title="ลบภาพ">${uiIcon('trash')}</button>`;
    card.querySelector('.library-image-slot').replaceWith(tools);
    tools.querySelector('[data-rename-image]').onclick=async()=>{
      try{await api('/images/'+image.id,'PATCH',{name:tools.querySelector('input').value});await renderHistory();toast('เปลี่ยนชื่อภาพแล้ว');}catch(error){toast(error.message);}
    };
    tools.querySelector('[data-delete-image]').onclick=event=>showLibraryImageDelete(image,event.currentTarget);
  });
  $('#view-history .page-heading').after(section);
  section.querySelector('#lab-image-upload').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    e.target.disabled=true;
    try{const form=new FormData();form.append('file',file);await api('/images','POST',form);await renderHistory();toast('เพิ่มภาพแล้ว · พร้อมใช้เมื่อเปิดข้อมูลของฉัน');}
    catch(error){toast(error.message);e.target.disabled=false;}
  };
}
function showLibraryImageDelete(image, trigger) {
  if (document.querySelector('.library-delete-dialog')) return;
  const dialog=document.createElement('dialog');
  dialog.className='library-delete-dialog';
  dialog.setAttribute('aria-labelledby','library-delete-title');
  dialog.setAttribute('aria-describedby','library-delete-description');
  dialog.innerHTML=`<div class="library-delete-heading"><span class="library-delete-symbol">${uiIcon('trash')}</span><h2 id="library-delete-title">ลบภาพนี้?</h2></div><div class="library-delete-preview"><img src="${esc(image.url)}" alt=""><strong>${esc(image.name)}</strong></div><p id="library-delete-description">ภาพจะถูกลบจากข้อมูลของฉันถาวร และเรียกคืนไม่ได้</p><p class="library-delete-error" role="alert" hidden></p><div class="library-delete-actions"><button type="button" class="secondary" data-cancel-image-delete autofocus>เก็บภาพไว้</button><button type="button" class="library-delete-confirm" data-confirm-image-delete>ลบภาพ</button></div>`;
  document.body.append(dialog);
  let pending=false;
  const cancel=dialog.querySelector('[data-cancel-image-delete]');
  const confirmButton=dialog.querySelector('[data-confirm-image-delete]');
  cancel.onclick=()=>dialog.close();
  dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog||pending)return;
    const bounds=dialog.getBoundingClientRect();
    if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{dialog.remove();if(trigger.isConnected)trigger.focus({preventScroll:true});});
  confirmButton.onclick=async()=>{
    if(pending)return;
    pending=true;cancel.disabled=true;confirmButton.disabled=true;
    confirmButton.textContent='กำลังลบ…';dialog.setAttribute('aria-busy','true');
    const errorBox=dialog.querySelector('.library-delete-error');errorBox.hidden=true;
    try {
      await api('/images/'+image.id,'DELETE');
    } catch(error) {
      errorBox.textContent=error.message;errorBox.hidden=false;
      pending=false;cancel.disabled=false;confirmButton.disabled=false;
      confirmButton.textContent='ลองลบอีกครั้ง';dialog.removeAttribute('aria-busy');
      return;
    }
    state.libraryImages=state.libraryImages.filter(i=>i.id!==image.id);
    state.allLibraryImages=(state.allLibraryImages??[]).filter(i=>i.id!==image.id);
    state.images=state.images.filter(i=>i.id!==image.id);
    renderImages();
    dialog.close();
    try{await renderHistory();}catch(error){toast('ลบภาพแล้ว แต่โหลดรายการใหม่ไม่สำเร็จ · '+error.message);return;}
    toast('ลบภาพ “'+image.name+'” แล้ว');
  };
  dialog.showModal();
}
async function openLabDesign() {
  location.hash='home';showDesigner();setWorkbenchTab('chat');renderImages();
  await setMyData(true);
  const input=$('#followup-input');
  input.value='ช่วยออกแบบเทรดเซตอัปจากข้อมูลและภาพที่ฉันเลือก ถ้ายังไม่รู้เป้าหมายหรือเหตุผลเข้าออกให้ถามก่อน หากไม่มีข้อมูลช่วยเสนอทางเลือกอินดิเคเตอร์พร้อมข้อแลกเปลี่ยน';
  input.focus();
}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-start-from-data]'))openLabDesign().catch(error=>toast(error.message));
});

const imageMentionMenu=document.createElement('div');
imageMentionMenu.className='image-mention-menu';imageMentionMenu.hidden=true;
imageMentionMenu.setAttribute('role','listbox');imageMentionMenu.setAttribute('aria-label','เลือกภาพจากข้อมูลของฉัน');document.body.append(imageMentionMenu);
let mentionInput=null,mentionStart=0,mentionEnd=0,mentionOptions=[],mentionIndex=0;
function chooseImageMention(index){
  const image=mentionOptions[index];if(!image||!mentionInput)return;
  const token=/\s/.test(image.name)?'@"'+image.name+'"':'@'+image.name;
  mentionInput.setRangeText(token+' ',mentionStart,mentionEnd,'end');
  mentionInput.dispatchEvent(new Event('input',{bubbles:true}));imageMentionMenu.hidden=true;mentionInput.focus();
}
function updateImageMentions(input){
  imageMentionMenu.hidden=true;if(!state.useMyData)return;
  const end=input.selectionStart??input.value.length,match=input.value.slice(0,end).match(/@([^@\n"]{0,60})$/);if(!match)return;
  mentionOptions=(state.allLibraryImages??[]).filter(image=>image.name.toLocaleLowerCase().includes(match[1].toLocaleLowerCase()));if(!mentionOptions.length)return;
  mentionInput=input;mentionStart=end-match[0].length;mentionEnd=end;mentionIndex=0;
  imageMentionMenu.innerHTML=mentionOptions.map((image,index)=>`<button type="button" role="option" aria-selected="${index===0}" data-mention-index="${index}"><img src="${esc(image.url)}" alt=""><span>@${esc(image.name)}</span></button>`).join('');
  const rect=input.getBoundingClientRect();imageMentionMenu.style.left=Math.max(8,rect.left)+'px';imageMentionMenu.style.width=Math.min(rect.width,320)+'px';imageMentionMenu.style.bottom=Math.max(8,innerHeight-rect.top+8)+'px';imageMentionMenu.hidden=false;
}
for(const input of [$('#chat-input'),$('#followup-input')]){
  input.addEventListener('input',()=>updateImageMentions(input));
  input.addEventListener('keydown',event=>{
    if(imageMentionMenu.hidden||mentionInput!==input)return;
    if(event.key==='Escape'){imageMentionMenu.hidden=true;event.preventDefault();}
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();mentionIndex=(mentionIndex+(event.key==='ArrowDown'?1:-1)+mentionOptions.length)%mentionOptions.length;imageMentionMenu.querySelectorAll('[role="option"]').forEach((node,index)=>node.setAttribute('aria-selected',String(index===mentionIndex)));}
    if(event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();chooseImageMention(mentionIndex);}
  },true);
}
imageMentionMenu.addEventListener('mousedown',event=>event.preventDefault());
imageMentionMenu.addEventListener('click',event=>{const button=event.target.closest('[data-mention-index]');if(button)chooseImageMention(Number(button.dataset.mentionIndex));});
document.addEventListener('click',event=>{if(!imageMentionMenu.contains(event.target)&&event.target!==mentionInput)imageMentionMenu.hidden=true;});
